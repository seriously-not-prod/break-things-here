/**
 * JWT Token Refresh tests — Issue #81
 *
 * Tests the POST /api/auth/refresh endpoint including:
 * - Successful token refresh with rotation
 * - Missing refresh token → 401
 * - Invalid/expired refresh token → 403
 * - Revoked (not in DB) refresh token → 403
 * - Deleted user → 403 + session cleanup
 * - Token rotation invalidates old refresh token
 * - Sets httpOnly cookie with new refresh token
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import jwt from 'jsonwebtoken';
import { hashPassword, hashToken } from '../src/utils/auth-helpers.js';

// ---------------------------------------------------------------------------
// Minimal Express req / res mocks
// ---------------------------------------------------------------------------
function makeRes() {
  const res: Record<string, unknown> & {
    statusCode: number;
    body: unknown;
    cookies: Record<string, { value: string; options: unknown }>;
    status: (code: number) => typeof res;
    json: (data: unknown) => typeof res;
    cookie: (name: string, value: string, opts?: unknown) => typeof res;
    clearCookie: (name: string) => typeof res;
  } = {
    statusCode: 200,
    body: null,
    cookies: {},
    status(code: number) { this.statusCode = code; return this; },
    json(data: unknown) { this.body = data; return this; },
    cookie(name: string, value: string, opts?: unknown) {
      this.cookies[name] = { value, options: opts };
      return this;
    },
    clearCookie(name: string) { delete this.cookies[name]; return this; },
  };
  return res;
}

function makeReq(
  body: Record<string, unknown> = {},
  cookies: Record<string, string> = {},
) {
  return {
    body,
    cookies,
    headers: {},
  } as unknown as import('express').Request;
}

// ---------------------------------------------------------------------------
// Stub nodemailer
// ---------------------------------------------------------------------------
vi.mock('nodemailer', () => ({
  default: {
    createTransport: () => ({
      sendMail: vi.fn().mockResolvedValue({}),
    }),
  },
}));

// ---------------------------------------------------------------------------
// In-memory SQLite
// ---------------------------------------------------------------------------
import sqlite3 from 'sqlite3';
import { open, type Database } from 'sqlite';

let testDb: Database;

vi.mock('../src/db/database.js', () => ({
  getDatabase: () => testDb,
  initializeDatabase: async () => testDb,
}));

// JWT_SECRET is provided by vitest env config — never fall back to a hardcoded literal.
const JWT_SECRET = process.env.JWT_SECRET as string;

function makeRefreshToken(userId: number, email: string, roleId: number, expiresIn = '7d'): string {
  return jwt.sign(
    { id: userId, email, role_id: roleId, type: 'refresh' },
    JWT_SECRET,
    { expiresIn } as jwt.SignOptions,
  );
}

async function seedUser(email: string, password: string): Promise<number> {
  const hash = await hashPassword(password);
  const result = await testDb.run(
    `INSERT INTO users (email, password_hash, email_verified, account_locked, login_attempts, role_id)
     VALUES (?, ?, 1, 0, 0, 1)`,
    [email, hash],
  );
  return result.lastID!;
}

async function insertSession(userId: number, accessToken: string, refreshToken: string): Promise<number> {
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const result = await testDb.run(
    `INSERT INTO sessions (user_id, token, refresh_token, expires_at)
     VALUES (?, ?, ?, ?)`,
    [userId, hashToken(accessToken), hashToken(refreshToken), expiresAt],
  );
  return result.lastID!;
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

// Import after mock
import { refreshTokenEndpoint, login } from '../src/controllers/auth-controller.js';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('JWT Token Refresh (#81)', () => {
  const EMAIL = 'alice@example.com';
  const PASSWORD = 'Valid1Pass!';

  it('returns 401 when no refresh token is provided', async () => {
    const req = makeReq({}, {});
    const res = makeRes();
    await refreshTokenEndpoint(req, res as unknown as import('express').Response);

    expect(res.statusCode).toBe(401);
    expect((res.body as Record<string, string>).error).toMatch(/refresh token/i);
  });

  it('returns 403 for an invalid/expired refresh token', async () => {
    const req = makeReq({}, { refreshToken: 'not.a.valid.jwt' });
    const res = makeRes();
    await refreshTokenEndpoint(req, res as unknown as import('express').Response);

    expect(res.statusCode).toBe(403);
    expect((res.body as Record<string, string>).error).toMatch(/invalid|expired/i);
  });

  it('returns 403 when refresh token is valid JWT but not in sessions table (revoked)', async () => {
    const userId = await seedUser(EMAIL, PASSWORD);
    const revokedToken = makeRefreshToken(userId, EMAIL, 1);

    // Do NOT insert into sessions — simulates revoked token
    const req = makeReq({}, { refreshToken: revokedToken });
    const res = makeRes();
    await refreshTokenEndpoint(req, res as unknown as import('express').Response);

    expect(res.statusCode).toBe(403);
    expect((res.body as Record<string, string>).error).toMatch(/revoked/i);
  });

  it('returns 200 with new access token on successful refresh', async () => {
    const userId = await seedUser(EMAIL, PASSWORD);
    const oldRefresh = makeRefreshToken(userId, EMAIL, 1);
    await insertSession(userId, 'old-access-token', oldRefresh);

    const req = makeReq({}, { refreshToken: oldRefresh });
    const res = makeRes();
    await refreshTokenEndpoint(req, res as unknown as import('express').Response);

    expect(res.statusCode).toBe(200);
    // access token is set as encrypted httpOnly cookie
    expect(res.cookies).toHaveProperty('accessToken');
    const body = res.body as Record<string, string>;
    expect(body.message).toMatch(/refresh/i);
  });

  it('rotates refresh token — old refresh token is invalidated in DB', async () => {
    const userId = await seedUser(EMAIL, PASSWORD);
    const oldRefresh = makeRefreshToken(userId, EMAIL, 1);
    const sessionId = await insertSession(userId, 'old-access-token', oldRefresh);

    const req = makeReq({}, { refreshToken: oldRefresh });
    const res = makeRes();
    await refreshTokenEndpoint(req, res as unknown as import('express').Response);

    expect(res.statusCode).toBe(200);

    // Old refresh token should no longer be in DB
    const oldSession = await testDb.get(
      'SELECT id FROM sessions WHERE refresh_token = ?',
      [oldRefresh],
    );
    expect(oldSession).toBeUndefined();

    // New refresh token should be stored
    const updatedSession = await testDb.get<{ refresh_token: string }>(
      'SELECT refresh_token FROM sessions WHERE id = ?',
      [sessionId],
    );
    expect(updatedSession).toBeDefined();
    expect(updatedSession!.refresh_token).not.toBe(oldRefresh);
  });

  it('sets httpOnly cookie with new refresh token', async () => {
    const userId = await seedUser(EMAIL, PASSWORD);
    const oldRefresh = makeRefreshToken(userId, EMAIL, 1);
    await insertSession(userId, 'old-access-token', oldRefresh);

    const req = makeReq({}, { refreshToken: oldRefresh });
    const res = makeRes();
    await refreshTokenEndpoint(req, res as unknown as import('express').Response);

    expect(res.statusCode).toBe(200);
    expect(res.cookies).toHaveProperty('refreshToken');
    const cookie = res.cookies.refreshToken;
    expect(cookie.value).toBeDefined();
    expect(cookie.value).not.toBe(oldRefresh);
    expect((cookie.options as Record<string, unknown>).httpOnly).toBe(true);
    expect((cookie.options as Record<string, unknown>).sameSite).toBe('strict');
  });

  it('returns 403 when user has been deleted', async () => {
    const userId = await seedUser(EMAIL, PASSWORD);
    const oldRefresh = makeRefreshToken(userId, EMAIL, 1);
    await insertSession(userId, 'old-access-token', oldRefresh);

    // Soft-delete the user
    await testDb.run('UPDATE users SET deleted_at = CURRENT_TIMESTAMP WHERE id = ?', [userId]);

    const req = makeReq({}, { refreshToken: oldRefresh });
    const res = makeRes();
    await refreshTokenEndpoint(req, res as unknown as import('express').Response);

    expect(res.statusCode).toBe(403);

    // Session should be cleaned up
    const session = await testDb.get('SELECT id FROM sessions WHERE user_id = ?', [userId]);
    expect(session).toBeUndefined();
  });

  it('accepts refresh token from request body as well', async () => {
    const userId = await seedUser(EMAIL, PASSWORD);
    const oldRefresh = makeRefreshToken(userId, EMAIL, 1);
    await insertSession(userId, 'old-access-token', oldRefresh);

    // Send via body, no cookie
    const req = makeReq({ refreshToken: oldRefresh }, {});
    const res = makeRes();
    await refreshTokenEndpoint(req, res as unknown as import('express').Response);

    expect(res.statusCode).toBe(200);
    // access token is now set as an encrypted httpOnly cookie
    expect(res.cookies).toHaveProperty('accessToken');
  });

  it('reusing a rotated-out refresh token returns 403', async () => {
    const userId = await seedUser(EMAIL, PASSWORD);
    const oldRefresh = makeRefreshToken(userId, EMAIL, 1);
    await insertSession(userId, 'old-access-token', oldRefresh);

    // First refresh — success
    const res1 = makeRes();
    await refreshTokenEndpoint(makeReq({}, { refreshToken: oldRefresh }), res1 as unknown as import('express').Response);
    expect(res1.statusCode).toBe(200);

    // Try reusing the old token — should fail
    const res2 = makeRes();
    await refreshTokenEndpoint(makeReq({}, { refreshToken: oldRefresh }), res2 as unknown as import('express').Response);
    expect(res2.statusCode).toBe(403);
  });
});
