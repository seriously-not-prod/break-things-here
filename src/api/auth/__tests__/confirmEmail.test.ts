import request from 'supertest';
import { createApp } from '../../../app';
import { inMemoryUserStore } from '../userStore';
import { generateConfirmationToken, clearTokenStore } from '../../../utils/confirmation-token';
import { createConfirmEmailRouter } from '../confirmEmail';
import express from 'express';

describe('GET /api/auth/confirm-email', () => {
  beforeEach(() => {
    inMemoryUserStore.clear();
    clearTokenStore();
  });

  async function registerUser(email: string): Promise<void> {
    const app = createApp();
    await request(app)
      .post('/api/auth/register')
      .send({ name: 'Test User', email, password: 'securePass1' });
  }

  it('should return 200 and confirm the account for a valid token', async () => {
    await registerUser('user@example.com');
    const token = generateConfirmationToken('user@example.com');
    const app = createApp();

    const res = await request(app).get(`/api/auth/confirm-email?token=${token}`);

    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/confirmed successfully/i);
  });

  it('should mark the user as confirmed in the store', async () => {
    await registerUser('user@example.com');
    const token = generateConfirmationToken('user@example.com');
    const app = createApp();

    await request(app).get(`/api/auth/confirm-email?token=${token}`);

    const user = await inMemoryUserStore.findByEmail('user@example.com');
    expect(user?.emailConfirmed).toBe(true);
  });

  it('should return 400 for a missing token', async () => {
    const app = createApp();
    const res = await request(app).get('/api/auth/confirm-email');

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/token is required/i);
  });

  it('should return 400 for an unknown/invalid token', async () => {
    const app = createApp();
    const res = await request(app).get('/api/auth/confirm-email?token=notarealtoken');

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/invalid|unknown/i);
  });

  it('should return 400 for an expired token', async () => {
    await registerUser('user@example.com');

    // Generate a token and then manually expire it by overriding the date
    const token = generateConfirmationToken('user@example.com');
    vi.useFakeTimers();
    vi.advanceTimersByTime(25 * 60 * 60 * 1000); // 25 hours

    const app = createApp();
    const res = await request(app).get(`/api/auth/confirm-email?token=${token}`);

    vi.useRealTimers();
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/expired/i);
  });

  it('should return 400 for an already-used token (single-use enforcement)', async () => {
    await registerUser('user@example.com');
    const token = generateConfirmationToken('user@example.com');
    const app = createApp();

    // First use — succeeds
    await request(app).get(`/api/auth/confirm-email?token=${token}`);

    // Second use — should fail
    const res = await request(app).get(`/api/auth/confirm-email?token=${token}`);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/already been used/i);
  });

  it('should return 200 with an "already confirmed" message for already-confirmed accounts', async () => {
    await registerUser('user@example.com');

    // Confirm via a first token
    const token1 = generateConfirmationToken('user@example.com');
    const app = createApp();
    await request(app).get(`/api/auth/confirm-email?token=${token1}`);

    // Now try a second fresh token for the same user
    const token2 = generateConfirmationToken('user@example.com');
    const res = await request(app).get(`/api/auth/confirm-email?token=${token2}`);

    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/already been confirmed/i);
  });

  it('should return 400 when token belongs to a non-existent user', async () => {
    // Generate token for an email that is not in the user store
    const token = generateConfirmationToken('ghost@example.com');
    const app = createApp();

    const res = await request(app).get(`/api/auth/confirm-email?token=${token}`);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/invalid|unknown/i);
  });

  it('should support injected userStore for isolation', async () => {
    const mockStore = {
      ...inMemoryUserStore,
      confirmEmail: vi.fn().mockResolvedValue(true),
      findByEmail: vi.fn().mockResolvedValue({ emailConfirmed: false }),
    };
    const token = generateConfirmationToken('inject@example.com');

    const app = express();
    app.use(express.json());
    app.use('/api/auth', createConfirmEmailRouter(mockStore));

    const res = await request(app).get(`/api/auth/confirm-email?token=${token}`);
    expect(res.status).toBe(200);
    expect(mockStore.confirmEmail).toHaveBeenCalledWith('inject@example.com');
  });
});
