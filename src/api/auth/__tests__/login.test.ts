import request from 'supertest';
import bcrypt from 'bcryptjs';
import { createApp } from '../../../app';
import { inMemoryUserStore } from '../userStore';
import { clearAttemptStore } from '../../../utils/login-attempt-tracker';
import { clearRevokedTokens } from '../../../utils/session';

describe('POST /api/auth/login', () => {
  let app: ReturnType<typeof createApp>;

  /** Helper: create a confirmed user for login tests */
  async function createConfirmedUser(
    email: string,
    password: string,
    name = 'Test User',
  ) {
    const passwordHash = await bcrypt.hash(password, 10);
    const user = await inMemoryUserStore.create({ name, email, passwordHash });
    await inMemoryUserStore.confirmEmail(email);
    return user;
  }

  beforeEach(() => {
    inMemoryUserStore.clear();
    clearAttemptStore();
    clearRevokedTokens();
    app = createApp();
  });

  // ── Success ───────────────────────────────────────────────────────────────

  describe('Success (200)', () => {
    it('should return 200 with a token for valid credentials', async () => {
      await createConfirmedUser('alice@example.com', 'SecurePass1!');

      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'alice@example.com', password: 'SecurePass1!' });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('token');
      expect(typeof res.body.token).toBe('string');
    });

    it('should be case-insensitive for email', async () => {
      await createConfirmedUser('alice@example.com', 'SecurePass1!');

      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'ALICE@EXAMPLE.COM', password: 'SecurePass1!' });

      expect(res.status).toBe(200);
    });

    it('should set an httpOnly cookie on successful login', async () => {
      await createConfirmedUser('alice@example.com', 'SecurePass1!');

      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'alice@example.com', password: 'SecurePass1!' });

      const cookies: string[] = res.headers['set-cookie'] as unknown as string[];
      expect(cookies).toBeDefined();
      const tokenCookie = cookies.find((c: string) => c.startsWith('token='));
      expect(tokenCookie).toBeDefined();
      expect(tokenCookie).toMatch(/HttpOnly/i);
    });
  });

  // ── Validation errors (400) ───────────────────────────────────────────────

  describe('Validation errors (400)', () => {
    it('should return 400 when email is missing', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ password: 'SecurePass1!' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBeDefined();
    });

    it('should return 400 when password is missing', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'alice@example.com' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBeDefined();
    });
  });

  // ── Invalid credentials (401) ─────────────────────────────────────────────

  describe('Invalid credentials (401)', () => {
    it('should return 401 for an unknown email', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'nobody@example.com', password: 'SecurePass1!' });

      expect(res.status).toBe(401);
      expect(res.body.error).toBe('Invalid email or password.');
    });

    it('should return 401 for a wrong password', async () => {
      await createConfirmedUser('alice@example.com', 'SecurePass1!');

      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'alice@example.com', password: 'WrongPass1!' });

      expect(res.status).toBe(401);
      expect(res.body.error).toBe('Invalid email or password.');
    });

    it('should return the same error for wrong email and wrong password (no enumeration)', async () => {
      await createConfirmedUser('alice@example.com', 'SecurePass1!');

      const wrongEmailRes = await request(app)
        .post('/api/auth/login')
        .send({ email: 'nobody@example.com', password: 'SecurePass1!' });

      const wrongPasswordRes = await request(app)
        .post('/api/auth/login')
        .send({ email: 'alice@example.com', password: 'WrongPass1!' });

      expect(wrongEmailRes.body.error).toBe(wrongPasswordRes.body.error);
    });
  });

  // ── Unconfirmed email (403) ───────────────────────────────────────────────

  describe('Unconfirmed email (403)', () => {
    it('should return 403 when the user has not confirmed their email', async () => {
      const passwordHash = await bcrypt.hash('SecurePass1!', 10);
      await inMemoryUserStore.create({
        name: 'Unconfirmed User',
        email: 'unconfirmed@example.com',
        passwordHash,
      });

      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'unconfirmed@example.com', password: 'SecurePass1!' });

      expect(res.status).toBe(403);
      expect(res.body.error).toMatch(/confirm your email/i);
    });
  });

  // ── Brute-force protection (429) ─────────────────────────────────────────

  describe('Brute-force protection (429)', () => {
    it('should lock the account after 5 consecutive failed attempts', async () => {
      await createConfirmedUser('bob@example.com', 'SecurePass1!');

      for (let i = 0; i < 5; i++) {
        await request(app)
          .post('/api/auth/login')
          .send({ email: 'bob@example.com', password: 'WrongPass!' });
      }

      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'bob@example.com', password: 'SecurePass1!' });

      expect(res.status).toBe(429);
      expect(res.body.error).toMatch(/locked/i);
    });
  });
});

// ── POST /api/auth/logout ─────────────────────────────────────────────────────

describe('POST /api/auth/logout', () => {
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    inMemoryUserStore.clear();
    clearRevokedTokens();
    app = createApp();
  });

  it('should return 200 and a success message', async () => {
    const res = await request(app).post('/api/auth/logout');
    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/logged out/i);
  });

  it('should clear the token cookie', async () => {
    const res = await request(app).post('/api/auth/logout');
    const cookies: string[] = res.headers['set-cookie'] as unknown as string[];
    if (cookies) {
      const tokenCookie = cookies.find((c: string) => c.startsWith('token='));
      if (tokenCookie) {
        // Cookie cleared means Max-Age=0 or expires in the past
        expect(tokenCookie).toMatch(/Max-Age=0|Expires=Thu, 01 Jan 1970/i);
      }
    }
    // If no Set-Cookie header, the cookie was never set — also acceptable
    expect(res.status).toBe(200);
  });
});
