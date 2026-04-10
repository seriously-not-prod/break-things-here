/**
 * Cookie Session tests — issue #29
 *
 * Verifies that login sets httpOnly cookies with correct attributes,
 * tokens are NOT exposed in the response body, logout clears cookies,
 * and authenticateToken reads tokens from cookies.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { hashPassword } from '../src/utils/auth-helpers.js';

// ---------------------------------------------------------------------------
// Minimal mock of Express req / res with cookie options tracking
// ---------------------------------------------------------------------------
interface CookieEntry {
  value: string;
  options: Record<string, unknown>;
}

function makeRes() {
  const res: Record<string, unknown> & {
    statusCode: number;
    body: unknown;
    cookieEntries: Record<string, CookieEntry>;
    clearedCookies: string[];
    status: (code: number) => typeof res;
    json: (data: unknown) => typeof res;
    cookie: (name: string, value: string, opts?: Record<string, unknown>) => typeof res;
    clearCookie: (name: string, opts?: Record<string, unknown>) => typeof res;
  } = {
    statusCode: 200,
    body: null,
    cookieEntries: {},
    clearedCookies: [],
    status(code: number) { this.statusCode = code; return this; },
    json(data: unknown) { this.body = data; return this; },
    cookie(name: string, value: string, opts?: Record<string, unknown>) {
      this.cookieEntries[name] = { value, options: opts ?? {} };
      return this;
    },
    clearCookie(name: string) {
      this.clearedCookies.push(name);
      delete this.cookieEntries[name];
      return this;
    },
  };
  return res;
}

function makeReq(
  body: Record<string, unknown> = {},
  user?: { id: number; email: string; role_id: number },
  cookies?: Record<string, string>,
) {
  return {
    body,
    user,
    cookies: cookies ?? {},
    headers: { authorization: user ? 'Bearer access-tok' : undefined },
  } as unknown as import('express').Request;
}

// ---------------------------------------------------------------------------
// Stubs
// ---------------------------------------------------------------------------
vi.mock('nodemailer', () => ({
  default: {
    createTransport: () => ({
      sendMail: vi.fn().mockResolvedValue({}),
    }),
  },
}));

import sqlite3 from 'sqlite3';
import { open, type Database } from 'sqlite';

let testDb: Database;

vi.mock('../src/db/database.js', () => ({
  getDatabase: () => testDb,
  initializeDatabase: async () => testDb,
}));

async function seedUser(opts: {
  email: string;
  password: string;
  emailVerified?: boolean;
}) {
  const hash = await hashPassword(opts.password);
  await testDb.run(
    `INSERT INTO users
       (email, password_hash, email_verified, role_id)
     VALUES (?, ?, ?, 1)`,
    [opts.email, hash, opts.emailVerified ?? true ? 1 : 0],
  );
}

beforeEach(async () => {
  testDb = await open({ filename: ':memory:', driver: sqlite3.Database });
  await testDb.exec('PRAGMA foreign_keys = ON');
  await testDb.exec(`
    CREATE TABLE IF NOT EXISTS roles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL
    );
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      display_name TEXT,
      email_verified BOOLEAN DEFAULT 0,
      email_verified_at DATETIME,
      email_verification_token TEXT,
      account_locked BOOLEAN DEFAULT 0,
      locked_until DATETIME,
      login_attempts INTEGER DEFAULT 0,
      role_id INTEGER NOT NULL DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      deleted_at DATETIME
    );
    CREATE TABLE IF NOT EXISTS sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      token TEXT UNIQUE NOT NULL,
      refresh_token TEXT,
      expires_at DATETIME NOT NULL,
      last_activity DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    INSERT INTO roles (name) VALUES ('Attendee'), ('Organizer'), ('Admin');
  `);
});

afterEach(async () => {
  await testDb.close();
});

// ---------------------------------------------------------------------------
// Import controllers / middleware after DB mock is established
// ---------------------------------------------------------------------------
import { login, logout } from '../src/controllers/auth-controller.js';
import { authenticateToken } from '../src/middleware/auth.js';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Cookie Session — Login sets httpOnly cookies', () => {
  it('sets accessToken cookie with httpOnly, sameSite=strict, and correct maxAge', async () => {
    await seedUser({ email: 'alice@example.com', password: 'Valid1Pass!' });

    const req = makeReq({ email: 'alice@example.com', password: 'Valid1Pass!' });
    const res = makeRes();
    await login(req, res as unknown as import('express').Response);

    expect(res.statusCode).toBe(200);

    const entry = res.cookieEntries['accessToken'];
    expect(entry).toBeDefined();
    expect(entry.value).toBeTruthy();
    expect(entry.options.httpOnly).toBe(true);
    expect(entry.options.sameSite).toBe('strict');
    expect(entry.options.maxAge).toBe(60 * 60 * 1000); // 1 hour
    expect(entry.options.path).toBe('/');
  });

  it('sets refreshToken cookie with httpOnly, sameSite=strict, and correct maxAge', async () => {
    await seedUser({ email: 'bob@example.com', password: 'Valid1Pass!' });

    const req = makeReq({ email: 'bob@example.com', password: 'Valid1Pass!' });
    const res = makeRes();
    await login(req, res as unknown as import('express').Response);

    expect(res.statusCode).toBe(200);

    const entry = res.cookieEntries['refreshToken'];
    expect(entry).toBeDefined();
    expect(entry.value).toBeTruthy();
    expect(entry.options.httpOnly).toBe(true);
    expect(entry.options.sameSite).toBe('strict');
    expect(entry.options.maxAge).toBe(7 * 24 * 60 * 60 * 1000); // 7 days
    expect(entry.options.path).toBe('/');
  });

  it('sets Secure flag only in production (not in test environment)', async () => {
    await seedUser({ email: 'carol@example.com', password: 'Valid1Pass!' });

    const req = makeReq({ email: 'carol@example.com', password: 'Valid1Pass!' });
    const res = makeRes();
    await login(req, res as unknown as import('express').Response);

    // In test env (not production), secure should be false
    expect(res.cookieEntries['accessToken'].options.secure).toBe(false);
    expect(res.cookieEntries['refreshToken'].options.secure).toBe(false);
  });

  it('does NOT expose tokens in the response body', async () => {
    await seedUser({ email: 'dave@example.com', password: 'Valid1Pass!' });

    const req = makeReq({ email: 'dave@example.com', password: 'Valid1Pass!' });
    const res = makeRes();
    await login(req, res as unknown as import('express').Response);

    expect(res.statusCode).toBe(200);

    const body = res.body as Record<string, unknown>;
    expect(body).not.toHaveProperty('accessToken');
    expect(body).not.toHaveProperty('refreshToken');
    expect(body).toHaveProperty('message');
    expect(body).toHaveProperty('user');
  });
});

describe('Cookie Session — Logout clears cookies', () => {
  it('clears both accessToken and refreshToken cookies on logout', async () => {
    await seedUser({ email: 'eve@example.com', password: 'Valid1Pass!' });
    const user = await testDb.get<{ id: number }>('SELECT id FROM users WHERE email = ?', ['eve@example.com']);

    await testDb.run(
      `INSERT INTO sessions (user_id, token, refresh_token, expires_at)
       VALUES (?, 'access-tok', 'refresh-tok', datetime('now', '+1 hour'))`,
      [user!.id],
    );

    const req = makeReq({}, { id: user!.id, email: 'eve@example.com', role_id: 1 });
    const res = makeRes();
    await logout(req, res as unknown as import('express').Response);

    expect(res.statusCode).toBe(200);
    expect(res.clearedCookies).toContain('accessToken');
    expect(res.clearedCookies).toContain('refreshToken');
  });
});

describe('Cookie Session — authenticateToken reads from cookies', () => {
  it('authenticates using cookie when no Authorization header is present', async () => {
    await seedUser({ email: 'frank@example.com', password: 'Valid1Pass!' });

    // First login to get a real token
    const loginReq = makeReq({ email: 'frank@example.com', password: 'Valid1Pass!' });
    const loginRes = makeRes();
    await login(loginReq, loginRes as unknown as import('express').Response);

    const accessToken = loginRes.cookieEntries['accessToken']?.value;
    expect(accessToken).toBeTruthy();

    // Now test authenticateToken with cookie (no Authorization header)
    const req = makeReq({}, undefined, { accessToken });
    (req as unknown as Record<string, unknown>).headers = {}; // no auth header
    const res = makeRes();
    let nextCalled = false;

    await authenticateToken(
      req as unknown as import('express').Request,
      res as unknown as import('express').Response,
      () => { nextCalled = true; },
    );

    expect(nextCalled).toBe(true);
    expect((req as unknown as Record<string, unknown>).user).toBeDefined();
  });

  it('returns 401 when neither cookie nor header token is present', () => {
    const req = makeReq();
    (req as unknown as Record<string, unknown>).headers = {};
    (req as unknown as Record<string, unknown>).cookies = {};
    const res = makeRes();
    let nextCalled = false;

    authenticateToken(
      req as unknown as import('express').Request,
      res as unknown as import('express').Response,
      () => { nextCalled = true; },
    );

    expect(nextCalled).toBe(false);
    expect(res.statusCode).toBe(401);
  });

  it('prefers Authorization header token over cookie token', async () => {
    await seedUser({ email: 'grace@example.com', password: 'Valid1Pass!' });

    // Login to get a real token
    const loginReq = makeReq({ email: 'grace@example.com', password: 'Valid1Pass!' });
    const loginRes = makeRes();
    await login(loginReq, loginRes as unknown as import('express').Response);

    const accessToken = loginRes.cookieEntries['accessToken']?.value;
    expect(accessToken).toBeTruthy();

    // Set up req with both header and cookie
    const req = makeReq({}, undefined, { accessToken: 'invalid-cookie-token' });
    (req as unknown as Record<string, unknown>).headers = {
      authorization: `Bearer ${accessToken}`,
    };
    const res = makeRes();
    let nextCalled = false;

    await authenticateToken(
      req as unknown as import('express').Request,
      res as unknown as import('express').Response,
      () => { nextCalled = true; },
    );

    // Should succeed because header token is valid
    expect(nextCalled).toBe(true);
  });
});
