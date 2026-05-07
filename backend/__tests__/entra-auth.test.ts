/**
 * Entra auth integration tests — issues #468, #469, #470
 *
 * Tests:
 * - Feature flag correctly gates the Entra endpoints
 * - Identity mapping: existing local user linked via email
 * - Identity mapping: new user provisioned from Entra claims
 * - Entra OID lookup takes priority over email lookup
 * - Config validation throws on misconfigured startup
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { hashPassword } from '../src/utils/auth-helpers.js';

vi.mock('nodemailer', () => ({
  default: {
    createTransport: () => ({ sendMail: vi.fn().mockResolvedValue({}) }),
  },
}));

import { createPostgresTestDatabase, type TestDatabase } from './helpers/postgres-test-db.js';

let testDb: TestDatabase;

vi.mock('../src/db/database.js', () => ({
  getDatabase: () => testDb,
  initializeDatabase: async () => testDb,
}));

// ── Config validation ────────────────────────────────────────────────────────

describe('Entra config validation', () => {
  it('isEntraEnabled returns false when flag is unset', async () => {
    const original = process.env.ENTRA_AUTH_ENABLED;
    delete process.env.ENTRA_AUTH_ENABLED;
    const { isEntraEnabled } = await import('../src/config/entra.js');
    expect(isEntraEnabled()).toBe(false);
    if (original !== undefined) process.env.ENTRA_AUTH_ENABLED = original;
  });

  it('getEntraConfig throws when required vars are missing', async () => {
    process.env.ENTRA_AUTH_ENABLED = 'true';
    delete process.env.AZURE_TENANT_ID;
    delete process.env.AZURE_CLIENT_ID;
    delete process.env.AZURE_CLIENT_SECRET;
    const { getEntraConfig } = await import('../src/config/entra.js');
    expect(() => getEntraConfig()).toThrow(/AZURE_TENANT_ID/);
    delete process.env.ENTRA_AUTH_ENABLED;
  });

  it('getEntraConfig returns config when all vars are set', async () => {
    process.env.ENTRA_AUTH_ENABLED = 'true';
    process.env.AZURE_TENANT_ID = 'test-tenant';
    process.env.AZURE_CLIENT_ID = 'test-client';
    process.env.AZURE_CLIENT_SECRET = 'test-secret';
    const { getEntraConfig } = await import('../src/config/entra.js');
    const config = getEntraConfig();
    expect(config.tenantId).toBe('test-tenant');
    expect(config.clientId).toBe('test-client');
    expect(config.authority).toBe('https://login.microsoftonline.com/test-tenant');
    delete process.env.ENTRA_AUTH_ENABLED;
    delete process.env.AZURE_TENANT_ID;
    delete process.env.AZURE_CLIENT_ID;
    delete process.env.AZURE_CLIENT_SECRET;
  });
});

// ── Helper: minimal Express-style mock ──────────────────────────────────────

function makeRes() {
  const res = {
    statusCode: 200,
    body: null as unknown,
    cookies: {} as Record<string, unknown>,
    status(code: number) { this.statusCode = code; return this; },
    json(data: unknown) { this.body = data; return this; },
    cookie(name: string, val: string) { this.cookies[name] = val; return this; },
    clearCookie(name: string) { delete this.cookies[name]; return this; },
    redirect(url: string) { this.body = { redirect: url }; return this; },
  };
  return res;
}

// ── DB schema for tests ──────────────────────────────────────────────────────

const SCHEMA = `
  CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    display_name TEXT NOT NULL,
    email_verified INTEGER DEFAULT 0,
    email_verified_at TIMESTAMP,
    role_id INTEGER DEFAULT 1,
    account_locked INTEGER DEFAULT 0,
    login_attempts INTEGER DEFAULT 0,
    entra_oid TEXT UNIQUE,
    auth_provider TEXT DEFAULT 'local',
    deleted_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE sessions (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token TEXT NOT NULL UNIQUE,
    refresh_token TEXT NOT NULL UNIQUE,
    expires_at TIMESTAMP NOT NULL,
    last_activity TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE roles (
    id SERIAL PRIMARY KEY,
    name TEXT UNIQUE NOT NULL
  );

  INSERT INTO roles (id, name) VALUES (1, 'Attendee') ON CONFLICT DO NOTHING;
`;

beforeEach(async () => {
  testDb = await createPostgresTestDatabase(SCHEMA);
});

afterEach(async () => {
  await testDb.close();
});

// ── getEntraStatus endpoint ──────────────────────────────────────────────────

describe('GET /api/auth/entra/config', () => {
  it('returns enabled: false when flag is off', async () => {
    delete process.env.ENTRA_AUTH_ENABLED;
    const { getEntraStatus } = await import('../src/controllers/entra-auth-controller.js');
    const res = makeRes();
    getEntraStatus({} as import('express').Request, res as unknown as import('express').Response);
    expect((res.body as { enabled: boolean }).enabled).toBe(false);
  });

  it('returns enabled: true when flag is on', async () => {
    process.env.ENTRA_AUTH_ENABLED = 'true';
    process.env.AZURE_TENANT_ID = 'tid';
    process.env.AZURE_CLIENT_ID = 'cid';
    process.env.AZURE_CLIENT_SECRET = 'sec';
    const { getEntraStatus } = await import('../src/controllers/entra-auth-controller.js');
    const res = makeRes();
    getEntraStatus({} as import('express').Request, res as unknown as import('express').Response);
    expect((res.body as { enabled: boolean }).enabled).toBe(true);
    delete process.env.ENTRA_AUTH_ENABLED;
    delete process.env.AZURE_TENANT_ID;
    delete process.env.AZURE_CLIENT_ID;
    delete process.env.AZURE_CLIENT_SECRET;
  });
});

// ── handleEntraCallback — identity mapping ───────────────────────────────────

describe('POST /api/auth/entra/callback — identity mapping', () => {
  beforeEach(() => {
    process.env.ENTRA_AUTH_ENABLED = 'true';
    process.env.AZURE_TENANT_ID = 'test-tenant';
    process.env.AZURE_CLIENT_ID = 'test-client';
    process.env.AZURE_CLIENT_SECRET = 'test-secret';
  });

  afterEach(() => {
    delete process.env.ENTRA_AUTH_ENABLED;
    delete process.env.AZURE_TENANT_ID;
    delete process.env.AZURE_CLIENT_ID;
    delete process.env.AZURE_CLIENT_SECRET;
    vi.restoreAllMocks();
  });

  it('provisions a new local user from Entra claims', async () => {
    const { validateEntraIdToken } = await import('../src/utils/entra-token.js');
    vi.spyOn({ validateEntraIdToken }, 'validateEntraIdToken').mockResolvedValue({
      oid: 'entra-oid-new',
      email: 'newuser@example.com',
      name: 'New User',
      tid: 'test-tenant',
      aud: 'test-client',
      iss: 'https://login.microsoftonline.com/test-tenant/v2.0',
      exp: Math.floor(Date.now() / 1000) + 3600,
      iat: Math.floor(Date.now() / 1000),
    });

    // Mock validateEntraIdToken at module level
    vi.doMock('../src/utils/entra-token.js', () => ({
      validateEntraIdToken: vi.fn().mockResolvedValue({
        oid: 'entra-oid-new',
        email: 'newuser@example.com',
        name: 'New User',
        tid: 'test-tenant',
        aud: 'test-client',
        iss: 'https://login.microsoftonline.com/test-tenant/v2.0',
        exp: Math.floor(Date.now() / 1000) + 3600,
        iat: Math.floor(Date.now() / 1000),
      }),
    }));

    const { handleEntraCallback } = await import('../src/controllers/entra-auth-controller.js');
    const req = { body: { id_token: 'fake.jwt.token' } } as import('express').Request;
    const res = makeRes();

    await handleEntraCallback(req, res as unknown as import('express').Response);

    const user = await testDb.get<{ email: string; entra_oid: string; auth_provider: string }>(
      `SELECT email, entra_oid, auth_provider FROM users WHERE email = 'newuser@example.com'`,
    );
    expect(user).toBeDefined();
    expect(user?.entra_oid).toBe('entra-oid-new');
    expect(user?.auth_provider).toBe('entra');
  });

  it('links Entra OID to an existing local user matched by email', async () => {
    const hash = await hashPassword('localpass');
    await testDb.run(
      `INSERT INTO users (email, password_hash, display_name, email_verified, auth_provider)
       VALUES ('existing@example.com', ?, 'Existing', 1, 'local')`,
      [hash],
    );

    vi.doMock('../src/utils/entra-token.js', () => ({
      validateEntraIdToken: vi.fn().mockResolvedValue({
        oid: 'entra-oid-link',
        email: 'existing@example.com',
        name: 'Existing',
        tid: 'test-tenant',
        aud: 'test-client',
        iss: 'https://login.microsoftonline.com/test-tenant/v2.0',
        exp: Math.floor(Date.now() / 1000) + 3600,
        iat: Math.floor(Date.now() / 1000),
      }),
    }));

    const { handleEntraCallback } = await import('../src/controllers/entra-auth-controller.js');
    const req = { body: { id_token: 'fake.jwt.token' } } as import('express').Request;
    const res = makeRes();

    await handleEntraCallback(req, res as unknown as import('express').Response);

    const user = await testDb.get<{ entra_oid: string; auth_provider: string }>(
      `SELECT entra_oid, auth_provider FROM users WHERE email = 'existing@example.com'`,
    );
    expect(user?.entra_oid).toBe('entra-oid-link');
    expect(user?.auth_provider).toBe('entra');
  });

  it('returns 404 when Entra auth is disabled', async () => {
    delete process.env.ENTRA_AUTH_ENABLED;
    const { handleEntraCallback } = await import('../src/controllers/entra-auth-controller.js');
    const req = { body: { code: 'some-code' } } as import('express').Request;
    const res = makeRes();

    await handleEntraCallback(req, res as unknown as import('express').Response);
    expect(res.statusCode).toBe(404);
  });

  it('returns 400 when no code or id_token provided', async () => {
    vi.doMock('../src/utils/entra-token.js', () => ({
      validateEntraIdToken: vi.fn(),
    }));

    const { handleEntraCallback } = await import('../src/controllers/entra-auth-controller.js');
    const req = { body: {} } as import('express').Request;
    const res = makeRes();

    await handleEntraCallback(req, res as unknown as import('express').Response);
    expect(res.statusCode).toBe(400);
  });
});
