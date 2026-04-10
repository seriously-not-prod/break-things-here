/**
 * Logout and Session Invalidation tests — issue #30
 *
 * Tests that:
 * 1. POST /api/auth/logout returns 200
 * 2. Logout clears auth cookies
 * 3. Logout deletes the session from the database
 * 4. Subsequent requests with the old token are rejected (session-aware validation)
 * 5. Full login → authenticate → logout → re-authenticate flow
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { hashPassword } from '../src/utils/auth-helpers.js';

// ---------------------------------------------------------------------------
// Minimal mock of Express req / res
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
  headers?: Record<string, string | undefined>,
  cookies?: Record<string, string>,
) {
  return {
    body,
    user,
    cookies: cookies ?? {},
    headers: headers ?? (user ? { authorization: 'Bearer access-tok' } : {}),
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
      expires_at DATETIME NOT NULL
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

describe('Logout endpoint — POST /api/auth/logout (#30)', () => {
  it('returns 200 on successful logout', async () => {
    await seedUser({ email: 'alice@example.com', password: 'Valid1Pass!' });

    // Login first to create a session
    const loginReq = makeReq({ email: 'alice@example.com', password: 'Valid1Pass!' });
    const loginRes = makeRes();
    await login(loginReq, loginRes as unknown as import('express').Response);
    expect(loginRes.statusCode).toBe(200);

    const accessToken = (loginRes.body as Record<string, string>).accessToken;
    const user = await testDb.get<{ id: number }>('SELECT id FROM users WHERE email = ?', ['alice@example.com']);

    const logoutReq = makeReq(
      {},
      { id: user!.id, email: 'alice@example.com', role_id: 1 },
      { authorization: `Bearer ${accessToken}` },
    );
    const logoutRes = makeRes();
    await logout(logoutReq, logoutRes as unknown as import('express').Response);

    expect(logoutRes.statusCode).toBe(200);
    expect((logoutRes.body as Record<string, string>).message).toMatch(/logged out/i);
  });

  it('clears accessToken and refreshToken cookies on logout', async () => {
    await seedUser({ email: 'bob@example.com', password: 'Valid1Pass!' });

    const loginReq = makeReq({ email: 'bob@example.com', password: 'Valid1Pass!' });
    const loginRes = makeRes();
    await login(loginReq, loginRes as unknown as import('express').Response);

    const accessToken = (loginRes.body as Record<string, string>).accessToken;
    const user = await testDb.get<{ id: number }>('SELECT id FROM users WHERE email = ?', ['bob@example.com']);

    const logoutReq = makeReq(
      {},
      { id: user!.id, email: 'bob@example.com', role_id: 1 },
      { authorization: `Bearer ${accessToken}` },
    );
    const logoutRes = makeRes();
    await logout(logoutReq, logoutRes as unknown as import('express').Response);

    expect(logoutRes.clearedCookies).toContain('accessToken');
    expect(logoutRes.clearedCookies).toContain('refreshToken');
  });

  it('deletes session from database on logout', async () => {
    await seedUser({ email: 'carol@example.com', password: 'Valid1Pass!' });

    const loginReq = makeReq({ email: 'carol@example.com', password: 'Valid1Pass!' });
    const loginRes = makeRes();
    await login(loginReq, loginRes as unknown as import('express').Response);

    const accessToken = (loginRes.body as Record<string, string>).accessToken;
    const user = await testDb.get<{ id: number }>('SELECT id FROM users WHERE email = ?', ['carol@example.com']);

    // Verify session exists before logout
    const sessionBefore = await testDb.get('SELECT id FROM sessions WHERE user_id = ?', [user!.id]);
    expect(sessionBefore).toBeDefined();

    const logoutReq = makeReq(
      {},
      { id: user!.id, email: 'carol@example.com', role_id: 1 },
      { authorization: `Bearer ${accessToken}` },
    );
    const logoutRes = makeRes();
    await logout(logoutReq, logoutRes as unknown as import('express').Response);

    // Session should be deleted
    const sessionAfter = await testDb.get('SELECT id FROM sessions WHERE user_id = ?', [user!.id]);
    expect(sessionAfter).toBeUndefined();
  });

  it('returns 401 when no user is authenticated', async () => {
    const req = makeReq();
    const res = makeRes();
    await logout(req as unknown as import('express').Request, res as unknown as import('express').Response);

    expect(res.statusCode).toBe(401);
  });
});

describe('Post-logout token rejection (#30)', () => {
  it('rejects the old token after logout — authenticateToken returns 401', async () => {
    await seedUser({ email: 'dave@example.com', password: 'Valid1Pass!' });

    // Step 1: Login to get a real JWT and create a session
    const loginReq = makeReq({ email: 'dave@example.com', password: 'Valid1Pass!' });
    const loginRes = makeRes();
    await login(loginReq, loginRes as unknown as import('express').Response);
    expect(loginRes.statusCode).toBe(200);

    const accessToken = (loginRes.body as Record<string, string>).accessToken;
    expect(accessToken).toBeTruthy();

    const user = await testDb.get<{ id: number }>('SELECT id FROM users WHERE email = ?', ['dave@example.com']);

    // Step 2: Verify authenticateToken succeeds BEFORE logout
    const authReqBefore = makeReq({}, undefined, { authorization: `Bearer ${accessToken}` });
    const authResBefore = makeRes();
    let nextCalledBefore = false;
    await authenticateToken(
      authReqBefore as unknown as import('express').Request,
      authResBefore as unknown as import('express').Response,
      () => { nextCalledBefore = true; },
    );
    expect(nextCalledBefore).toBe(true);

    // Step 3: Logout — delete the session
    const logoutReq = makeReq(
      {},
      { id: user!.id, email: 'dave@example.com', role_id: 1 },
      { authorization: `Bearer ${accessToken}` },
    );
    await logout(logoutReq, makeRes() as unknown as import('express').Response);

    // Step 4: Try authenticateToken with the SAME token — should be REJECTED
    const authReqAfter = makeReq({}, undefined, { authorization: `Bearer ${accessToken}` });
    const authResAfter = makeRes();
    let nextCalledAfter = false;
    await authenticateToken(
      authReqAfter as unknown as import('express').Request,
      authResAfter as unknown as import('express').Response,
      () => { nextCalledAfter = true; },
    );

    expect(nextCalledAfter).toBe(false);
    expect(authResAfter.statusCode).toBe(401);
    expect((authResAfter.body as Record<string, string>).error).toMatch(/invalidated/i);
  });

  it('rejects token via cookie after logout', async () => {
    await seedUser({ email: 'eve@example.com', password: 'Valid1Pass!' });

    // Login
    const loginReq = makeReq({ email: 'eve@example.com', password: 'Valid1Pass!' });
    const loginRes = makeRes();
    await login(loginReq, loginRes as unknown as import('express').Response);

    const accessToken = (loginRes.body as Record<string, string>).accessToken;
    const user = await testDb.get<{ id: number }>('SELECT id FROM users WHERE email = ?', ['eve@example.com']);

    // Logout
    const logoutReq = makeReq(
      {},
      { id: user!.id, email: 'eve@example.com', role_id: 1 },
      { authorization: `Bearer ${accessToken}` },
    );
    await logout(logoutReq, makeRes() as unknown as import('express').Response);

    // Try to authenticate using the old token as a cookie (no header)
    const authReq = makeReq({}, undefined, {}, { accessToken });
    const authRes = makeRes();
    let nextCalled = false;
    await authenticateToken(
      authReq as unknown as import('express').Request,
      authRes as unknown as import('express').Response,
      () => { nextCalled = true; },
    );

    expect(nextCalled).toBe(false);
    expect(authRes.statusCode).toBe(401);
  });

  it('other users sessions are not affected by one users logout', async () => {
    await seedUser({ email: 'frank@example.com', password: 'Valid1Pass!' });
    await seedUser({ email: 'grace@example.com', password: 'Valid1Pass!' });

    // Login both users
    const loginReqF = makeReq({ email: 'frank@example.com', password: 'Valid1Pass!' });
    const loginResF = makeRes();
    await login(loginReqF, loginResF as unknown as import('express').Response);
    const frankToken = (loginResF.body as Record<string, string>).accessToken;

    const loginReqG = makeReq({ email: 'grace@example.com', password: 'Valid1Pass!' });
    const loginResG = makeRes();
    await login(loginReqG, loginResG as unknown as import('express').Response);
    const graceToken = (loginResG.body as Record<string, string>).accessToken;

    const frank = await testDb.get<{ id: number }>('SELECT id FROM users WHERE email = ?', ['frank@example.com']);

    // Frank logs out
    const logoutReq = makeReq(
      {},
      { id: frank!.id, email: 'frank@example.com', role_id: 1 },
      { authorization: `Bearer ${frankToken}` },
    );
    await logout(logoutReq, makeRes() as unknown as import('express').Response);

    // Grace's token should still work
    const authReq = makeReq({}, undefined, { authorization: `Bearer ${graceToken}` });
    const authRes = makeRes();
    let nextCalled = false;
    await authenticateToken(
      authReq as unknown as import('express').Request,
      authRes as unknown as import('express').Response,
      () => { nextCalled = true; },
    );

    expect(nextCalled).toBe(true);
  });
});
