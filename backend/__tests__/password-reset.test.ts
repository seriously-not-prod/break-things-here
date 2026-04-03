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

import { resetPassword, generateResetToken, forgotPassword } from '../src/controllers/password-reset-controller.js';

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

// ─── forgotPassword – input validation ──────────────────────────────────────

describe('forgotPassword – input validation', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 400 when email is missing', async () => {
    const req = makeReq({});
    const res = makeRes();
    await forgotPassword(req, res as never);
    expect(res.statusCode).toBe(400);
    expect((res.body as { message: string }).message).toMatch(/email.*required/i);
  });

  it('returns 400 when email is not a string', async () => {
    const req = makeReq({ email: 12345 });
    const res = makeRes();
    await forgotPassword(req, res as never);
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 for invalid email format', async () => {
    const req = makeReq({ email: 'not-an-email' });
    const res = makeRes();
    await forgotPassword(req, res as never);
    expect(res.statusCode).toBe(400);
    expect((res.body as { message: string }).message).toMatch(/valid email/i);
  });

  it('normalizes email (trims whitespace and lowercases) before processing', async () => {
    // Should pass validation after normalization
    mockDbGet
      .mockResolvedValueOnce(undefined) // no rate limit entry
      .mockResolvedValueOnce(undefined); // user not found
    mockDbRun.mockResolvedValue({});
    const req = makeReq({ email: '  USER@EXAMPLE.COM  ' });
    const res = makeRes();
    await forgotPassword(req, res as never);
    expect(res.statusCode).toBe(200);
    const insertCall = mockDbRun.mock.calls.find(
      (call: unknown[]) =>
        typeof call[0] === 'string' &&
        (call[0] as string).includes('INSERT INTO password_reset_tokens')
    );
    expect(insertCall).toBeDefined();
    expect((insertCall![1] as unknown[])[1]).toBe('user@example.com');
  });
});

// ─── forgotPassword – rate limiting ─────────────────────────────────────────

describe('forgotPassword – rate limiting (AC #77)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 200 with generic message when rate limit is exceeded', async () => {
    mockDbGet.mockResolvedValueOnce({
      request_count: 3,
      window_start: new Date(Date.now() - 10_000).toISOString(), // 10 s ago, within 1 h window
    });
    mockDbRun.mockResolvedValue({});
    const req = makeReq({ email: 'test@example.com' });
    const res = makeRes();
    await forgotPassword(req, res as never);
    expect(res.statusCode).toBe(200);
    expect((res.body as { message: string }).message).toMatch(/if an account exists/i);
  });

  it('does NOT store a new token when rate limit is exceeded', async () => {
    mockDbGet.mockResolvedValueOnce({
      request_count: 3,
      window_start: new Date(Date.now() - 10_000).toISOString(),
    });
    mockDbRun.mockResolvedValue({});
    const req = makeReq({ email: 'test@example.com' });
    const res = makeRes();
    await forgotPassword(req, res as never);
    const tokenInsert = mockDbRun.mock.calls.find(
      (call: unknown[]) =>
        typeof call[0] === 'string' &&
        (call[0] as string).includes('INSERT INTO password_reset_tokens')
    );
    expect(tokenInsert).toBeUndefined();
  });

  it('increments request_count within the rate-limit window', async () => {
    mockDbGet
      .mockResolvedValueOnce({
        request_count: 1,
        window_start: new Date(Date.now() - 10_000).toISOString(),
      })
      .mockResolvedValueOnce(undefined); // user not found
    mockDbRun.mockResolvedValue({});
    const req = makeReq({ email: 'test@example.com' });
    const res = makeRes();
    await forgotPassword(req, res as never);
    const incrementCall = mockDbRun.mock.calls.find(
      (call: unknown[]) =>
        typeof call[0] === 'string' &&
        (call[0] as string).includes('request_count = request_count + 1')
    );
    expect(incrementCall).toBeDefined();
  });

  it('creates a new rate-limit entry on first request for an email', async () => {
    mockDbGet
      .mockResolvedValueOnce(undefined) // no rate-limit entry
      .mockResolvedValueOnce(undefined); // user not found
    mockDbRun.mockResolvedValue({});
    const req = makeReq({ email: 'new@example.com' });
    const res = makeRes();
    await forgotPassword(req, res as never);
    const insertRateLimit = mockDbRun.mock.calls.find(
      (call: unknown[]) =>
        typeof call[0] === 'string' &&
        (call[0] as string).includes('INSERT INTO password_reset_rate_limit')
    );
    expect(insertRateLimit).toBeDefined();
  });

  it('resets the rate-limit counter when the window has expired', async () => {
    mockDbGet
      .mockResolvedValueOnce({
        request_count: 5,
        window_start: new Date(Date.now() - 2 * 60 * 60 * 1_000).toISOString(), // 2 h ago
      })
      .mockResolvedValueOnce(undefined); // user not found
    mockDbRun.mockResolvedValue({});
    const req = makeReq({ email: 'test@example.com' });
    const res = makeRes();
    await forgotPassword(req, res as never);
    const resetCall = mockDbRun.mock.calls.find(
      (call: unknown[]) =>
        typeof call[0] === 'string' &&
        (call[0] as string).includes('SET request_count = 1, window_start = CURRENT_TIMESTAMP')
    );
    expect(resetCall).toBeDefined();
  });
});

// ─── forgotPassword – token storage and enumeration prevention ──────────────

describe('forgotPassword – token storage and enumeration prevention', () => {
  beforeEach(() => vi.clearAllMocks());

  it('stores a token in the database for a valid request (user exists)', async () => {
    mockDbGet
      .mockResolvedValueOnce(undefined) // no rate-limit entry
      .mockResolvedValueOnce({ id: 42 }); // user found
    mockDbRun.mockResolvedValue({});
    const req = makeReq({ email: 'user@example.com' });
    const res = makeRes();
    await forgotPassword(req, res as never);
    const insertToken = mockDbRun.mock.calls.find(
      (call: unknown[]) =>
        typeof call[0] === 'string' &&
        (call[0] as string).includes('INSERT INTO password_reset_tokens')
    );
    expect(insertToken).toBeDefined();
  });

  it('stores a token in the database even when user does not exist', async () => {
    mockDbGet
      .mockResolvedValueOnce(undefined) // no rate-limit entry
      .mockResolvedValueOnce(undefined); // user not found
    mockDbRun.mockResolvedValue({});
    const req = makeReq({ email: 'ghost@example.com' });
    const res = makeRes();
    await forgotPassword(req, res as never);
    const insertToken = mockDbRun.mock.calls.find(
      (call: unknown[]) =>
        typeof call[0] === 'string' &&
        (call[0] as string).includes('INSERT INTO password_reset_tokens')
    );
    expect(insertToken).toBeDefined();
  });

  it('returns 200 with identical message whether user exists or not', async () => {
    // User does not exist
    mockDbGet
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined);
    mockDbRun.mockResolvedValue({});
    const res1 = makeRes();
    await forgotPassword(makeReq({ email: 'ghost@example.com' }), res1 as never);

    vi.clearAllMocks();

    // User exists
    mockDbGet
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({ id: 1 });
    mockDbRun.mockResolvedValue({});
    const res2 = makeRes();
    await forgotPassword(makeReq({ email: 'real@example.com' }), res2 as never);

    expect(res1.statusCode).toBe(200);
    expect(res2.statusCode).toBe(200);
    expect((res1.body as { message: string }).message).toBe(
      (res2.body as { message: string }).message
    );
  });

  it('stored token is a 64-character hex string', async () => {
    let capturedToken = '';
    mockDbGet
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({ id: 42 });
    mockDbRun.mockImplementation(async (sql: string, params: unknown[]) => {
      if (typeof sql === 'string' && sql.includes('INSERT INTO password_reset_tokens')) {
        capturedToken = params[2] as string;
      }
      return { lastID: 1, changes: 1 };
    });
    const req = makeReq({ email: 'user@example.com' });
    const res = makeRes();
    await forgotPassword(req, res as never);
    expect(capturedToken).toMatch(/^[0-9a-f]{64}$/);
  });
});

// ─── Integration: Full password reset flow ───────────────────────────────────

describe('integration – full password reset flow (request → store token → verify → update)', () => {
  it('completes end-to-end: forgotPassword stores a token that resetPassword can consume', async () => {
    vi.clearAllMocks();

    // ── Step 1: forgotPassword ────────────────────────────────────────────────
    let storedToken = '';
    mockDbGet
      .mockResolvedValueOnce(undefined) // no rate-limit entry
      .mockResolvedValueOnce({ id: 42 }); // user found
    mockDbRun.mockImplementation(async (sql: string, params: unknown[]) => {
      if (typeof sql === 'string' && sql.includes('INSERT INTO password_reset_tokens')) {
        storedToken = params[2] as string; // third param is the token
      }
      return { lastID: 1, changes: 1 };
    });

    const forgotReq = makeReq({ email: 'user@example.com' });
    const forgotRes = makeRes();
    await forgotPassword(forgotReq, forgotRes as never);

    expect(forgotRes.statusCode).toBe(200);
    expect(storedToken).toMatch(/^[0-9a-f]{64}$/); // token was generated and captured

    // ── Step 2: resetPassword uses the token ──────────────────────────────────
    vi.clearAllMocks();
    const FUTURE = new Date(Date.now() + 3_600_000).toISOString();
    mockDbGet.mockResolvedValueOnce({
      id: 10,
      user_id: 42,
      email: 'user@example.com',
      expires_at: FUTURE,
      used: 0,
    });
    mockDbRun.mockResolvedValue({ lastID: 1, changes: 1 });

    const resetReq = makeReq({ token: storedToken, newPassword: 'NewPassword1!' });
    const resetRes = makeRes();
    await resetPassword(resetReq, resetRes as never);

    expect(resetRes.statusCode).toBe(200);
    expect((resetRes.body as { message: string }).message).toMatch(/reset successfully/i);

    // Verify password update and session invalidation were called
    const updatePasswordCall = mockDbRun.mock.calls.find(
      (call: unknown[]) =>
        typeof call[0] === 'string' &&
        (call[0] as string).includes('UPDATE users SET password_hash')
    );
    expect(updatePasswordCall).toBeDefined();

    const sessionInvalidationCall = mockDbRun.mock.calls.find(
      (call: unknown[]) =>
        typeof call[0] === 'string' &&
        (call[0] as string).includes('DELETE FROM sessions')
    );
    expect(sessionInvalidationCall).toBeDefined();
  });
});
