import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * Unit and integration tests for the password reset flow.
 * Covers Task #80 acceptance criteria.
 */

// --- Shared mocks for database ---
const mockDbGet = vi.fn();
const mockDbRun = vi.fn();
const mockDbAll = vi.fn();

vi.mock('../src/db/database.js', () => ({
  getDatabase: () => ({
    get: mockDbGet,
    run: mockDbRun,
    all: mockDbAll,
  }),
}));

vi.mock('bcryptjs', () => ({
  default: {
    hash: vi.fn().mockResolvedValue('$2b$12$hashedPasswordValue'),
    compare: vi.fn().mockResolvedValue(true),
  },
}));

import { resetPassword, generateResetToken } from '../src/controllers/password-reset-controller.js';

// Minimal Express req/res mocks
function makeReq(body: Record<string, unknown>, ip = '127.0.0.1') {
  return {
    body,
    ip,
    socket: { remoteAddress: ip },
  } as never;
}

function makeRes() {
  const res = {
    statusCode: 200,
    body: null as unknown,
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    json(data: unknown) {
      res.body = data;
      return res;
    },
  };
  return res;
}

// ─── generateResetToken ─────────────────────────────────────────────────────

describe('generateResetToken', () => {
  it('generates a 64-character hex string', () => {
    const token = generateResetToken();
    expect(token).toMatch(/^[0-9a-f]{64}$/);
  });

  it('generates unique tokens on successive calls', () => {
    const tokens = new Set(Array.from({ length: 50 }, () => generateResetToken()));
    expect(tokens.size).toBe(50);
  });
});

// ─── resetPassword ──────────────────────────────────────────────────────────

describe('resetPassword – input validation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 400 when token is missing', async () => {
    const req = makeReq({ newPassword: 'Password123!' });
    const res = makeRes();
    await resetPassword(req, res as never);
    expect(res.statusCode).toBe(400);
    expect((res.body as { message: string }).message).toMatch(/token is required/i);
  });

  it('returns 400 when newPassword is missing', async () => {
    const req = makeReq({ token: 'some-token' });
    const res = makeRes();
    await resetPassword(req, res as never);
    expect(res.statusCode).toBe(400);
    expect((res.body as { message: string }).message).toMatch(/password is required/i);
  });

  it('returns 400 for weak password (no uppercase)', async () => {
    const req = makeReq({ token: 'some-token', newPassword: 'password1!' });
    const res = makeRes();
    await resetPassword(req, res as never);
    expect(res.statusCode).toBe(400);
    expect((res.body as { message: string }).message).toMatch(/at least 8 characters/i);
  });

  it('returns 400 for weak password (too short)', async () => {
    const req = makeReq({ token: 'some-token', newPassword: 'P1!' });
    const res = makeRes();
    await resetPassword(req, res as never);
    expect(res.statusCode).toBe(400);
  });
});

describe('resetPassword – token validation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 400 when token does not exist in database', async () => {
    mockDbGet.mockResolvedValue(undefined);
    const req = makeReq({ token: 'invalid-token-xyz', newPassword: 'Password123!' });
    const res = makeRes();
    await resetPassword(req, res as never);
    expect(res.statusCode).toBe(400);
    expect((res.body as { message: string }).message).toMatch(/invalid or expired/i);
  });

  it('returns 400 when token has already been used', async () => {
    mockDbGet.mockResolvedValue({
      id: 1,
      user_id: 42,
      email: 'user@example.com',
      expires_at: new Date(Date.now() + 3600_000).toISOString(),
      used: 1,
    });
    const req = makeReq({ token: 'used-token', newPassword: 'Password123!' });
    const res = makeRes();
    await resetPassword(req, res as never);
    expect(res.statusCode).toBe(400);
    expect((res.body as { message: string }).message).toMatch(/already been used/i);
  });

  it('returns 400 when token is expired', async () => {
    mockDbGet.mockResolvedValue({
      id: 2,
      user_id: 42,
      email: 'user@example.com',
      expires_at: new Date(Date.now() - 1000).toISOString(), // 1 second in the past
      used: 0,
    });
    const req = makeReq({ token: 'expired-token', newPassword: 'Password123!' });
    const res = makeRes();
    await resetPassword(req, res as never);
    expect(res.statusCode).toBe(400);
    expect((res.body as { message: string }).message).toMatch(/expired/i);
  });
});

describe('resetPassword – successful reset', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  const FUTURE = new Date(Date.now() + 3600_000).toISOString();
  const VALID_TOKEN_RECORD = {
    id: 10,
    user_id: 42,
    email: 'user@example.com',
    expires_at: FUTURE,
    used: 0,
  };

  beforeEach(() => {
    mockDbGet.mockResolvedValue(VALID_TOKEN_RECORD);
    mockDbRun.mockResolvedValue({ lastID: 1, changes: 1 });
  });

  it('returns 200 on successful password reset', async () => {
    const req = makeReq({ token: 'valid-token', newPassword: 'Password123!' });
    const res = makeRes();
    await resetPassword(req, res as never);
    expect(res.statusCode).toBe(200);
    expect((res.body as { message: string }).message).toMatch(/reset successfully/i);
  });

  it('updates the user password with a hashed value', async () => {
    const req = makeReq({ token: 'valid-token', newPassword: 'Password123!' });
    const res = makeRes();
    await resetPassword(req, res as never);
    const updateCall = mockDbRun.mock.calls.find(
      (call: unknown[]) => typeof call[0] === 'string' && (call[0] as string).includes('UPDATE users SET password_hash')
    );
    expect(updateCall).toBeDefined();
    expect((updateCall![1] as unknown[])[0]).toBe('$2b$12$hashedPasswordValue');
  });

  it('invalidates all existing sessions for the user', async () => {
    const req = makeReq({ token: 'valid-token', newPassword: 'Password123!' });
    const res = makeRes();
    await resetPassword(req, res as never);
    const sessionDeleteCall = mockDbRun.mock.calls.find(
      (call: unknown[]) => typeof call[0] === 'string' && (call[0] as string).includes('DELETE FROM sessions')
    );
    expect(sessionDeleteCall).toBeDefined();
    expect((sessionDeleteCall![1] as unknown[])[0]).toBe(VALID_TOKEN_RECORD.user_id);
  });

  it('marks the token as used after successful reset', async () => {
    const req = makeReq({ token: 'valid-token', newPassword: 'Password123!' });
    const res = makeRes();
    await resetPassword(req, res as never);
    const markUsedCall = mockDbRun.mock.calls.find(
      (call: unknown[]) => typeof call[0] === 'string' && (call[0] as string).includes('UPDATE password_reset_tokens SET used = 1')
    );
    expect(markUsedCall).toBeDefined();
    expect((markUsedCall![1] as unknown[])[0]).toBe(VALID_TOKEN_RECORD.id);
  });
});

describe('resetPassword – user enumeration prevention', () => {
  it('returns the same 400 for non-existent and invalid tokens', async () => {
    mockDbGet.mockResolvedValue(undefined);
    const req1 = makeReq({ token: 'non-existent', newPassword: 'Password123!' });
    const res1 = makeRes();
    await resetPassword(req1, res1 as never);

    mockDbGet.mockResolvedValue({
      id: 5,
      user_id: 99,
      email: 'other@example.com',
      expires_at: new Date(Date.now() - 1).toISOString(),
      used: 0,
    });
    const req2 = makeReq({ token: 'expired', newPassword: 'Password123!' });
    const res2 = makeRes();
    await resetPassword(req2, res2 as never);

    // Both return 400 — same status
    expect(res1.statusCode).toBe(400);
    expect(res2.statusCode).toBe(400);
  });
});
