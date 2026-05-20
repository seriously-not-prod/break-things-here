/**
 * Session Timeout tests — Issue #82
 *
 * Tests server-side session inactivity validation:
 * - Active session allowed through
 * - Expired session (>30 min inactivity) rejected with SESSION_TIMEOUT code
 * - Session deleted from DB on expiry
 * - Heartbeat updates last_activity and returns timeout config
 * - Configurable timeout via SESSION_TIMEOUT_MS
 * - authenticateToken updates last_activity on every request
 * - Route configuration includes heartbeat endpoint
 */

import { readFileSync } from 'node:fs';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import jwt from 'jsonwebtoken';
import { hashPassword, hashToken } from '../src/utils/auth-helpers.js';

// ---------------------------------------------------------------------------
// Minimal Express req / res / next mocks
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
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(data: unknown) {
      this.body = data;
      return this;
    },
  };
  return res;
}

function makeReq(
  token?: string,
  body: Record<string, unknown> = {},
  user?: { id: number; email: string; role_id: number },
) {
  return {
    body,
    headers: token ? { authorization: `Bearer ${token}` } : {},
    user,
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
// Isolated PostgreSQL schema
// ---------------------------------------------------------------------------
import { createPostgresTestDatabase, type TestDatabase } from './helpers/postgres-test-db.js';

let testDb: TestDatabase;

vi.mock('../src/db/database.js', () => ({
  getDatabase: () => testDb,
  initializeDatabase: async () => testDb,
}));

// JWT_SECRET is provided by vitest env config — never fall back to a hardcoded literal.
const JWT_SECRET = process.env.JWT_SECRET as string;

function makeAccessToken(userId: number, email: string, roleId: number): string {
  return jwt.sign({ id: userId, email, role_id: roleId }, JWT_SECRET, {
    expiresIn: '1h',
  } as jwt.SignOptions);
}

async function seedUser(email: string, password: string): Promise<number> {
  const hash = await hashPassword(password);
  const result = await testDb.run(
    `INSERT INTO users (email, password_hash, email_verified, account_locked, login_attempts, role_id)
     VALUES (?, ?, 1, 0, 0, 1)
     RETURNING id`,
    [email, hash],
  );
  return result.lastID!;
}

async function insertSession(
  userId: number,
  accessToken: string,
  lastActivity?: string,
): Promise<number> {
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const activity = lastActivity ?? new Date().toISOString();
  const result = await testDb.run(
    `INSERT INTO sessions (user_id, token, refresh_token, expires_at, last_activity)
     VALUES (?, ?, ?, ?, ?)
     RETURNING id`,
    [userId, hashToken(accessToken), hashToken('refresh-tok'), expiresAt, activity],
  );
  return result.lastID!;
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
      deleted_at TIMESTAMP,
      deactivated_at TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS sessions (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL,
      token TEXT UNIQUE NOT NULL,
      refresh_token TEXT,
      expires_at TIMESTAMPTZ NOT NULL,
      last_activity TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    );
    INSERT INTO roles (id, name) VALUES (1, 'Attendee'), (2, 'Organizer'), (3, 'Admin')
    ON CONFLICT (id) DO NOTHING;
  `);
});

afterEach(async () => {
  await testDb?.close();
});

// Import after mock
import { authenticateToken, SESSION_TIMEOUT_MS } from '../src/middleware/auth.js';
import { sessionHeartbeat } from '../src/controllers/auth-controller.js';

const apiRoutesSource = readFileSync(
  new URL('../src/routes/api-routes.ts', import.meta.url),
  'utf8',
);

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Session Timeout — Server-side Validation (#82)', () => {
  const EMAIL = 'alice@example.com';
  const PASSWORD = 'Valid1Pass!';

  it('allows requests when session is active (last_activity within timeout)', async () => {
    const userId = await seedUser(EMAIL, PASSWORD);
    const token = makeAccessToken(userId, EMAIL, 1);
    await insertSession(userId, token); // last_activity = now

    const req = makeReq(token);
    const res = makeRes();
    let nextCalled = false;

    await authenticateToken(
      req,
      res as unknown as import('express').Response,
      (() => {
        nextCalled = true;
      }) as unknown as import('express').NextFunction,
    );

    expect(nextCalled).toBe(true);
    expect((req as unknown as Record<string, unknown>).user).toBeDefined();
  });

  it('rejects requests when session has been inactive beyond timeout', async () => {
    const userId = await seedUser(EMAIL, PASSWORD);
    const token = makeAccessToken(userId, EMAIL, 1);

    // Set last_activity to 31 minutes ago
    const expired = new Date(Date.now() - 31 * 60 * 1000).toISOString();
    await insertSession(userId, token, expired);

    const req = makeReq(token);
    const res = makeRes();
    let nextCalled = false;

    await authenticateToken(
      req,
      res as unknown as import('express').Response,
      (() => {
        nextCalled = true;
      }) as unknown as import('express').NextFunction,
    );

    expect(nextCalled).toBe(false);
    expect(res.statusCode).toBe(401);
    const body = res.body as Record<string, string>;
    expect(body.code).toBe('SESSION_TIMEOUT');
    expect(body.error).toMatch(/inactivity/i);
  });

  it('deletes expired session from database', async () => {
    const userId = await seedUser(EMAIL, PASSWORD);
    const token = makeAccessToken(userId, EMAIL, 1);
    const expired = new Date(Date.now() - 31 * 60 * 1000).toISOString();
    const sessionId = await insertSession(userId, token, expired);

    const req = makeReq(token);
    const res = makeRes();
    await authenticateToken(
      req,
      res as unknown as import('express').Response,
      (() => {}) as unknown as import('express').NextFunction,
    );

    const session = await testDb.get('SELECT id FROM sessions WHERE id = ?', [sessionId]);
    expect(session).toBeUndefined();
  });

  it('updates last_activity on every authenticated request', async () => {
    const userId = await seedUser(EMAIL, PASSWORD);
    const token = makeAccessToken(userId, EMAIL, 1);

    // Set last_activity to 10 minutes ago (still valid)
    const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const sessionId = await insertSession(userId, token, tenMinAgo);

    const req = makeReq(token);
    const res = makeRes();
    await authenticateToken(
      req,
      res as unknown as import('express').Response,
      (() => {}) as unknown as import('express').NextFunction,
    );

    const session = await testDb.get<{ last_activity: string }>(
      'SELECT last_activity FROM sessions WHERE id = ?',
      [sessionId],
    );
    expect(session).toBeDefined();

    // last_activity should be updated to approximately now
    const updated = new Date(session!.last_activity).getTime();
    expect(Date.now() - updated).toBeLessThan(5000); // within 5s
  });

  it('SESSION_TIMEOUT_MS defaults to 30 minutes', () => {
    // The env var is not set in tests, so we should get the default
    expect(SESSION_TIMEOUT_MS).toBe(30 * 60 * 1000);
  });

  it('heartbeat endpoint updates last_activity and returns timeout config', async () => {
    const userId = await seedUser(EMAIL, PASSWORD);
    const token = makeAccessToken(userId, EMAIL, 1);
    const sessionId = await insertSession(userId, token);

    const req = makeReq(token, {}, { id: userId, email: EMAIL, role_id: 1 });
    const res = makeRes();
    await sessionHeartbeat(req, res as unknown as import('express').Response);

    expect(res.statusCode).toBe(200);
    const body = res.body as Record<string, unknown>;
    expect(body.sessionTimeoutMs).toBe(SESSION_TIMEOUT_MS);
    expect(body.message).toMatch(/activity/i);

    // Verify DB was updated
    const session = await testDb.get<{ last_activity: string }>(
      'SELECT last_activity FROM sessions WHERE id = ?',
      [sessionId],
    );
    const updated = new Date(session!.last_activity).getTime();
    expect(Date.now() - updated).toBeLessThan(5000);
  });

  it('returns 401 when session token is not in database', async () => {
    await seedUser(EMAIL, PASSWORD);
    // Create a valid JWT but don't insert into sessions
    const token = makeAccessToken(1, EMAIL, 1);

    const req = makeReq(token);
    const res = makeRes();
    let nextCalled = false;

    await authenticateToken(
      req,
      res as unknown as import('express').Response,
      (() => {
        nextCalled = true;
      }) as unknown as import('express').NextFunction,
    );

    expect(nextCalled).toBe(false);
    expect(res.statusCode).toBe(401);
  });

  it('heartbeat route is registered at /auth/session/heartbeat', () => {
    expect(apiRoutesSource).toContain(
      "router.post('/auth/session/heartbeat', authenticateToken, authController.sessionHeartbeat);",
    );
  });
});
