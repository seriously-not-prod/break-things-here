import request from 'supertest';
import bcrypt from 'bcryptjs';
import { createApp } from '../../../app';
import { inMemoryUserStore } from '../userStore';
import {
  clearResetTokenStore,
  generatePasswordResetToken,
} from '../../../utils/password-reset-token';
import {
  clearAuditLog,
  getAuditLog,
  clearPasswordResetRateLimit,
} from '../password-reset';

describe('POST /api/auth/request-reset', () => {
  let app: ReturnType<typeof createApp>;

  async function registerUser(email: string): Promise<void> {
    const passwordHash = await bcrypt.hash('OldPass1!', 10);
    await inMemoryUserStore.create({ name: 'Test User', email, passwordHash });
  }

  beforeEach(() => {
    inMemoryUserStore.clear();
    clearResetTokenStore();
    clearAuditLog();
    clearPasswordResetRateLimit();
    app = createApp();
  });

  // ── Always 200 ────────────────────────────────────────────────────────────

  it('should return 200 for a registered email', async () => {
    await registerUser('user@example.com');

    const res = await request(app)
      .post('/api/auth/request-reset')
      .send({ email: 'user@example.com' });

    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/reset link has been sent/i);
  });

  it('should return 200 for an unregistered email (no enumeration)', async () => {
    const res = await request(app)
      .post('/api/auth/request-reset')
      .send({ email: 'nobody@example.com' });

    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/reset link has been sent/i);
  });

  it('should return the same message for registered and unregistered emails', async () => {
    await registerUser('user@example.com');

    const regRes = await request(app)
      .post('/api/auth/request-reset')
      .send({ email: 'user@example.com' });

    const unreqRes = await request(app)
      .post('/api/auth/request-reset')
      .send({ email: 'nobody@example.com' });

    expect(regRes.body.message).toBe(unreqRes.body.message);
  });

  // ── Validation (400) ──────────────────────────────────────────────────────

  it('should return 400 when email is missing', async () => {
    const res = await request(app).post('/api/auth/request-reset').send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
  });

  // ── Audit log ─────────────────────────────────────────────────────────────

  it('should write an audit entry when a reset is requested for a known email', async () => {
    await registerUser('audit@example.com');

    await request(app)
      .post('/api/auth/request-reset')
      .send({ email: 'audit@example.com' });

    const log = getAuditLog();
    expect(log.length).toBeGreaterThan(0);
    expect(log[0].action).toBe('REQUEST_RESET');
    expect(log[0].email).toBe('audit@example.com');
  });

  it('should write an audit entry when a reset is requested for an unknown email', async () => {
    await request(app)
      .post('/api/auth/request-reset')
      .send({ email: 'ghost@example.com' });

    const log = getAuditLog();
    expect(log.length).toBeGreaterThan(0);
    expect(log[0].action).toBe('REQUEST_RESET');
  });

  // ── Rate limiting ─────────────────────────────────────────────────────────

  it('should return 200 even when rate-limited (no enumeration via status code)', async () => {
    await registerUser('rate@example.com');

    // Exhaust the window (3 requests)
    for (let i = 0; i < 3; i++) {
      await request(app)
        .post('/api/auth/request-reset')
        .send({ email: 'rate@example.com' });
    }

    const res = await request(app)
      .post('/api/auth/request-reset')
      .send({ email: 'rate@example.com' });

    expect(res.status).toBe(200);
  });
});

// ── POST /api/auth/reset-password ─────────────────────────────────────────────

describe('POST /api/auth/reset-password', () => {
  let app: ReturnType<typeof createApp>;

  async function registerUser(email: string, password = 'OldPass1!'): Promise<void> {
    const passwordHash = await bcrypt.hash(password, 10);
    await inMemoryUserStore.create({ name: 'Test User', email, passwordHash });
  }

  beforeEach(() => {
    inMemoryUserStore.clear();
    clearResetTokenStore();
    clearAuditLog();
    app = createApp();
  });

  // ── Success (200) ─────────────────────────────────────────────────────────

  it('should return 200 and update the password for a valid token', async () => {
    await registerUser('user@example.com');
    const token = generatePasswordResetToken('user@example.com');

    const res = await request(app)
      .post('/api/auth/reset-password')
      .send({ token, newPassword: 'NewSecure1!' });

    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/password has been reset/i);
  });

  it('should store the new password hashed (not plain text)', async () => {
    await registerUser('user@example.com');
    const token = generatePasswordResetToken('user@example.com');

    await request(app)
      .post('/api/auth/reset-password')
      .send({ token, newPassword: 'NewSecure1!' });

    const user = await inMemoryUserStore.findByEmail('user@example.com');
    expect(user).not.toBeNull();
    expect(user!.passwordHash).not.toBe('NewSecure1!');
    expect(user!.passwordHash).toMatch(/^\$2[ab]\$\d{2}\$/);
  });

  it('should write a RESET_COMPLETE audit entry on success', async () => {
    await registerUser('user@example.com');
    const token = generatePasswordResetToken('user@example.com');

    await request(app)
      .post('/api/auth/reset-password')
      .send({ token, newPassword: 'NewSecure1!' });

    const log = getAuditLog();
    const completeEntry = log.find((e) => e.action === 'RESET_COMPLETE');
    expect(completeEntry).toBeDefined();
    expect(completeEntry?.email).toBe('user@example.com');
  });

  // ── Token validation errors (400) ─────────────────────────────────────────

  it('should return 400 when token is missing', async () => {
    const res = await request(app)
      .post('/api/auth/reset-password')
      .send({ newPassword: 'NewSecure1!' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/token is required/i);
  });

  it('should return 400 for an invalid token', async () => {
    const res = await request(app)
      .post('/api/auth/reset-password')
      .send({ token: 'notarealtoken', newPassword: 'NewSecure1!' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/invalid|unknown/i);
  });

  it('should return 400 for an expired token', async () => {
    await registerUser('user@example.com');
    const token = generatePasswordResetToken('user@example.com');

    vi.useFakeTimers();
    vi.advanceTimersByTime(2 * 60 * 60 * 1000); // 2 hours

    const res = await request(app)
      .post('/api/auth/reset-password')
      .send({ token, newPassword: 'NewSecure1!' });

    vi.useRealTimers();

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/expired/i);
  });

  it('should return 400 on second use of the same token (single-use)', async () => {
    await registerUser('user@example.com');
    const token = generatePasswordResetToken('user@example.com');

    await request(app)
      .post('/api/auth/reset-password')
      .send({ token, newPassword: 'NewSecure1!' });

    const res = await request(app)
      .post('/api/auth/reset-password')
      .send({ token, newPassword: 'AnotherPass1!' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/already been used/i);
  });

  // ── Password strength (400) ───────────────────────────────────────────────

  it('should return 400 when new password is too weak', async () => {
    await registerUser('user@example.com');
    const token = generatePasswordResetToken('user@example.com');

    const res = await request(app)
      .post('/api/auth/reset-password')
      .send({ token, newPassword: 'short' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
  });

  it('should return 400 when new password is missing', async () => {
    await registerUser('user@example.com');
    const token = generatePasswordResetToken('user@example.com');

    const res = await request(app)
      .post('/api/auth/reset-password')
      .send({ token });

    expect(res.status).toBe(400);
  });
});
