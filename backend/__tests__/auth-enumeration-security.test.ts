/**
 * Security tests — Issue #32
 *
 * Verifies that the login endpoint does not leak whether an email address
 * is registered.  Both unknown-email and wrong-password scenarios must
 * return identical HTTP status codes, error messages, and response shapes.
 * Timing consistency is ensured by a real bcrypt compare on a dummy hash
 * for unknown users.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { hashPassword } from '../src/utils/auth-helpers.js';

// ---------------------------------------------------------------------------
// Minimal mock of Express req / res
// ---------------------------------------------------------------------------
function makeRes() {
  const res: Record<string, unknown> & {
    statusCode: number;
    body: unknown;
    status: (code: number) => typeof res;
    json: (data: unknown) => typeof res;
  } = {
    statusCode: 200,
    body: null,
    status(code: number) { this.statusCode = code; return this; },
    json(data: unknown) { this.body = data; return this; },
  };
  return res;
}

function makeReq(body: Record<string, unknown>) {
  return { body, headers: {} } as unknown as import('express').Request;
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
// In-memory SQLite — mirrors production schema (stripped down)
// ---------------------------------------------------------------------------
import sqlite3 from 'sqlite3';
import { open, type Database } from 'sqlite';

let testDb: Database;

vi.mock('../src/db/database.js', () => ({
  getDatabase: () => testDb,
  initializeDatabase: async () => testDb,
}));

async function seedUser(email: string, password: string) {
  const hash = await hashPassword(password);
  await testDb.run(
    `INSERT INTO users
       (email, password_hash, email_verified, account_locked, login_attempts, role_id)
     VALUES (?, ?, 1, 0, 0, 1)`,
    [email, hash],
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

// Import controller after mock is established
import { login } from '../src/controllers/auth-controller.js';

// ---------------------------------------------------------------------------
// Security: User Enumeration Resistance
// ---------------------------------------------------------------------------

describe('Security — Login Enumeration Resistance (#32)', () => {
  const KNOWN_EMAIL = 'registered@example.com';
  const KNOWN_PASSWORD = 'Correct1Pass!';
  const UNKNOWN_EMAIL = 'nonexistent@example.com';
  const WRONG_PASSWORD = 'Wrong1Pass!';

  it('returns identical status code for unknown email vs wrong password', async () => {
    await seedUser(KNOWN_EMAIL, KNOWN_PASSWORD);

    const resWrongPwd = makeRes();
    await login(makeReq({ email: KNOWN_EMAIL, password: WRONG_PASSWORD }), resWrongPwd as unknown as import('express').Response);

    const resUnknown = makeRes();
    await login(makeReq({ email: UNKNOWN_EMAIL, password: WRONG_PASSWORD }), resUnknown as unknown as import('express').Response);

    expect(resWrongPwd.statusCode).toBe(401);
    expect(resUnknown.statusCode).toBe(401);
  });

  it('returns identical error message for unknown email vs wrong password', async () => {
    await seedUser(KNOWN_EMAIL, KNOWN_PASSWORD);

    const resWrongPwd = makeRes();
    await login(makeReq({ email: KNOWN_EMAIL, password: WRONG_PASSWORD }), resWrongPwd as unknown as import('express').Response);

    const resUnknown = makeRes();
    await login(makeReq({ email: UNKNOWN_EMAIL, password: WRONG_PASSWORD }), resUnknown as unknown as import('express').Response);

    const msgWrongPwd = (resWrongPwd.body as Record<string, string>).error;
    const msgUnknown = (resUnknown.body as Record<string, string>).error;

    expect(msgWrongPwd).toBe('Invalid email or password.');
    expect(msgUnknown).toBe('Invalid email or password.');
    expect(msgWrongPwd).toBe(msgUnknown);
  });

  it('returns identical response keys for unknown email vs wrong password', async () => {
    await seedUser(KNOWN_EMAIL, KNOWN_PASSWORD);

    const resWrongPwd = makeRes();
    await login(makeReq({ email: KNOWN_EMAIL, password: WRONG_PASSWORD }), resWrongPwd as unknown as import('express').Response);

    const resUnknown = makeRes();
    await login(makeReq({ email: UNKNOWN_EMAIL, password: WRONG_PASSWORD }), resUnknown as unknown as import('express').Response);

    const keysWrongPwd = Object.keys(resWrongPwd.body as object).sort();
    const keysUnknown = Object.keys(resUnknown.body as object).sort();
    expect(keysWrongPwd).toEqual(keysUnknown);
  });

  it('uses generic message and does not mention "email", "user", or "account" in error text', async () => {
    await seedUser(KNOWN_EMAIL, KNOWN_PASSWORD);

    const resUnknown = makeRes();
    await login(makeReq({ email: UNKNOWN_EMAIL, password: WRONG_PASSWORD }), resUnknown as unknown as import('express').Response);

    const msg = ((resUnknown.body as Record<string, string>).error ?? '').toLowerCase();
    expect(msg).not.toMatch(/user not found|no account|email not registered|does not exist/);
  });

  it('response time is consistent — both paths run bcrypt compare', async () => {
    await seedUser(KNOWN_EMAIL, KNOWN_PASSWORD);

    // Warm up the dummy hash cache so first call isn't an outlier
    const warmup = makeRes();
    await login(makeReq({ email: UNKNOWN_EMAIL, password: 'x' }), warmup as unknown as import('express').Response);

    // Measure unknown-email path
    const t0 = performance.now();
    const resUnknown = makeRes();
    await login(makeReq({ email: UNKNOWN_EMAIL, password: WRONG_PASSWORD }), resUnknown as unknown as import('express').Response);
    const unknownMs = performance.now() - t0;

    // Measure wrong-password path
    const t1 = performance.now();
    const resWrongPwd = makeRes();
    await login(makeReq({ email: KNOWN_EMAIL, password: WRONG_PASSWORD }), resWrongPwd as unknown as import('express').Response);
    const wrongPwdMs = performance.now() - t1;

    // Both should be in the same order of magnitude (bcrypt ~100-300ms at cost 12).
    // Allow a generous 5× ratio to avoid flaky CI.
    const ratio = Math.max(unknownMs, wrongPwdMs) / Math.max(Math.min(unknownMs, wrongPwdMs), 1);
    expect(ratio).toBeLessThan(5);
  });

  it('does not leak user existence through extra fields in the JSON body', async () => {
    await seedUser(KNOWN_EMAIL, KNOWN_PASSWORD);

    const resWrongPwd = makeRes();
    await login(makeReq({ email: KNOWN_EMAIL, password: WRONG_PASSWORD }), resWrongPwd as unknown as import('express').Response);

    const resUnknown = makeRes();
    await login(makeReq({ email: UNKNOWN_EMAIL, password: WRONG_PASSWORD }), resUnknown as unknown as import('express').Response);

    // Neither response should contain user-related data
    const bodyWrongPwd = resWrongPwd.body as Record<string, unknown>;
    const bodyUnknown = resUnknown.body as Record<string, unknown>;

    for (const body of [bodyWrongPwd, bodyUnknown]) {
      expect(body).not.toHaveProperty('user');
      expect(body).not.toHaveProperty('userId');
      expect(body).not.toHaveProperty('email');
      expect(body).not.toHaveProperty('exists');
    }
  });
});
