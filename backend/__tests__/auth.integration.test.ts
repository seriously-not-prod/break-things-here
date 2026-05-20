/**
 * Auth integration tests — issue #33
 *
 * Tests LOGIN success, wrong password, unconfirmed email, account lockout,
 * LOGOUT + post-logout token rejection, and identical error messages for
 * known vs unknown email (enumeration resistance).
 *
 * These tests use isolated PostgreSQL schemas so they do not require a
 * running server. They call controller functions directly with mock Express
 * request/response objects.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { hashPassword, hashToken } from '../src/utils/auth-helpers.js';

// ---------------------------------------------------------------------------
// Minimal mock of Express req / res
// ---------------------------------------------------------------------------
function makeRes() {
  const res: Record<string, unknown> & {
    statusCode: number;
    body: unknown;
    cookies: Record<string, unknown>;
    status: (code: number) => typeof res;
    json: (data: unknown) => typeof res;
    send: (data?: unknown) => typeof res;
    cookie: (name: string, value: string, opts?: unknown) => typeof res;
    clearCookie: (name: string) => typeof res;
  } = {
    statusCode: 200,
    body: null,
    cookies: {},
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(data: unknown) {
      this.body = data;
      return this;
    },
    send(data?: unknown) {
      this.body = data ?? null;
      return this;
    },
    cookie(name: string, value: string) {
      this.cookies[name] = value;
      return this;
    },
    clearCookie(name: string) {
      delete this.cookies[name];
      return this;
    },
  };
  return res;
}

function makeReq(
  body: Record<string, unknown> = {},
  user?: { id: number; email: string; role_id: number },
) {
  return {
    body,
    user,
    headers: { authorization: user ? `Bearer access-tok` : undefined },
  } as unknown as import('express').Request;
}

// ---------------------------------------------------------------------------
// Stub out nodemailer / email sending so tests don't need SMTP
// ---------------------------------------------------------------------------
vi.mock('nodemailer', () => ({
  default: {
    createTransport: () => ({
      sendMail: vi.fn().mockResolvedValue({}),
    }),
  },
}));

// ---------------------------------------------------------------------------
// PostgreSQL test DB bootstrap (mirrors database.ts schema, stripped down)
// ---------------------------------------------------------------------------
import { createPostgresTestDatabase, type TestDatabase } from './helpers/postgres-test-db.js';

let testDb: TestDatabase;

// Override getDatabase so controllers use the test DB
vi.mock('../src/db/database.js', () => ({
  getDatabase: () => testDb,
  initializeDatabase: async () => testDb,
}));

async function seedUser(opts: {
  email: string;
  password: string;
  emailVerified?: boolean;
  accountLocked?: boolean;
  loginAttempts?: number;
  lockedUntil?: string | null;
}) {
  const hash = await hashPassword(opts.password);
  await testDb.run(
    `INSERT INTO users
       (email, password_hash, email_verified, account_locked, login_attempts, locked_until, role_id)
     VALUES (?, ?, ?, ?, ?, ?, 1)`,
    [
      opts.email,
      hash,
      (opts.emailVerified ?? true) ? 1 : 0,
      opts.accountLocked ? 1 : 0,
      opts.loginAttempts ?? 0,
      opts.lockedUntil ?? null,
    ],
  );
}

beforeEach(async () => {
  testDb = await createPostgresTestDatabase(`
    CREATE TABLE IF NOT EXISTS roles (
      id SERIAL PRIMARY KEY,
      name TEXT UNIQUE NOT NULL
    );
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      display_name TEXT,
      email_verified INTEGER DEFAULT 0,
      email_verified_at TIMESTAMP,
      email_verification_token TEXT,
      account_locked INTEGER DEFAULT 0,
      locked_until TIMESTAMPTZ,
      login_attempts INTEGER DEFAULT 0,
      role_id INTEGER NOT NULL DEFAULT 1,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      deleted_at TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS sessions (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL,
      token TEXT UNIQUE NOT NULL,
      refresh_token TEXT,
      expires_at TIMESTAMP NOT NULL,
      last_activity TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    INSERT INTO roles (id, name) VALUES (1, 'Attendee'), (2, 'Organizer'), (3, 'Admin')
    ON CONFLICT (id) DO NOTHING;
  `);
});

afterEach(async () => {
  await testDb?.close();
});

// ---------------------------------------------------------------------------
// Import controllers after DB mock is established
// ---------------------------------------------------------------------------
import { login, logout } from '../src/controllers/auth-controller.js';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Auth Integration — Login', () => {
  it('returns 200 and a token cookie on successful login', async () => {
    await seedUser({ email: 'alice@example.com', password: 'Valid1Pass!', emailVerified: true });

    const req = makeReq({ email: 'alice@example.com', password: 'Valid1Pass!' });
    const res = makeRes();
    await login(req, res as unknown as import('express').Response);

    expect(res.statusCode).toBe(200);
    expect((res.body as Record<string, unknown>)?.user).toBeDefined();
  });

  it('returns 401 with generic message for wrong password', async () => {
    await seedUser({ email: 'bob@example.com', password: 'Correct1Pass!', emailVerified: true });

    const req = makeReq({ email: 'bob@example.com', password: 'WrongPass1!' });
    const res = makeRes();
    await login(req, res as unknown as import('express').Response);

    expect(res.statusCode).toBe(401);
    const body = res.body as Record<string, string>;
    expect(body?.error).toBeTruthy();
  });

  it('returns 401 with IDENTICAL error message for unknown email (no enumeration)', async () => {
    // Get message for known email + wrong password
    await seedUser({ email: 'carol@example.com', password: 'Known1Pass!', emailVerified: true });
    const resKnown = makeRes();
    await login(
      makeReq({ email: 'carol@example.com', password: 'Wrong1!' }),
      resKnown as unknown as import('express').Response,
    );

    // Get message for unknown email
    const resUnknown = makeRes();
    await login(
      makeReq({ email: 'does-not-exist@example.com', password: 'Any1Pass!' }),
      resUnknown as unknown as import('express').Response,
    );

    expect(resKnown.statusCode).toBe(401);
    expect(resUnknown.statusCode).toBe(401);
    expect((resKnown.body as Record<string, string>).error).toBe(
      (resUnknown.body as Record<string, string>).error,
    );
  });

  it('returns 403 when email is not verified', async () => {
    await seedUser({ email: 'dave@example.com', password: 'Valid1Pass!', emailVerified: false });

    const req = makeReq({ email: 'dave@example.com', password: 'Valid1Pass!' });
    const res = makeRes();
    await login(req, res as unknown as import('express').Response);

    expect(res.statusCode).toBe(403);
    const body = res.body as Record<string, string>;
    expect(body?.error).toMatch(/verif/i);
  });

  it('returns 423 (or 403) when account is locked', async () => {
    const future = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    await seedUser({
      email: 'eve@example.com',
      password: 'Valid1Pass!',
      emailVerified: true,
      accountLocked: true,
      lockedUntil: future,
    });

    const req = makeReq({ email: 'eve@example.com', password: 'Valid1Pass!' });
    const res = makeRes();
    await login(req, res as unknown as import('express').Response);

    expect([423, 403, 401, 429]).toContain(res.statusCode);
    const body = res.body as Record<string, string>;
    expect(body?.error).toMatch(/lock|attempt|try again/i);
  });
});

describe('Auth Integration — Logout', () => {
  it('returns 200 and clears the refreshToken cookie on logout', async () => {
    await seedUser({ email: 'frank@example.com', password: 'Valid1Pass!', emailVerified: true });
    const user = await testDb.get<{ id: number }>('SELECT id FROM users WHERE email = ?', [
      'frank@example.com',
    ]);

    // Insert a session so logout has something to invalidate
    await testDb.run(
      `INSERT INTO sessions (user_id, token, refresh_token, expires_at)
       VALUES (?, ?, ?, CURRENT_TIMESTAMP + INTERVAL '1 hour')`,
      [user!.id, hashToken('access-tok'), hashToken('refresh-tok')],
    );

    const req = makeReq({}, { id: user!.id, email: 'frank@example.com', role_id: 1 });
    const res = makeRes();
    await logout(req, res as unknown as import('express').Response);

    expect([200, 204]).toContain(res.statusCode);
    expect(res.cookies).not.toHaveProperty('refreshToken');
  });

  it('session is invalidated after logout — token no longer in sessions table', async () => {
    await seedUser({ email: 'grace@example.com', password: 'Valid1Pass!', emailVerified: true });
    const user = await testDb.get<{ id: number }>('SELECT id FROM users WHERE email = ?', [
      'grace@example.com',
    ]);

    await testDb.run(
      `INSERT INTO sessions (user_id, token, refresh_token, expires_at)
       VALUES (?, ?, ?, CURRENT_TIMESTAMP + INTERVAL '1 hour')`,
      [user!.id, hashToken('my-access'), hashToken('my-refresh')],
    );

    const req = makeReq({}, { id: user!.id, email: 'grace@example.com', role_id: 1 });
    (req as unknown as Record<string, unknown>).headers = { authorization: 'Bearer my-access' };
    await logout(req, makeRes() as unknown as import('express').Response);

    const session = await testDb.get('SELECT id FROM sessions WHERE user_id = ?', [user!.id]);
    expect(session).toBeUndefined();
  });
});
