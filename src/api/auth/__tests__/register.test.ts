import request from 'supertest';
import { createApp } from '../../../app';
import { inMemoryUserStore } from '../userStore';

describe('POST /api/auth/register', () => {
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    inMemoryUserStore.clear();
    app = createApp();
  });

  // ── Success path ──────────────────────────────────────────────────────────

  describe('Success (201)', () => {
    it('should return 201 with success message on valid input', async () => {
      const res = await request(app).post('/api/auth/register').send({
        name: 'Alice Smith',
        email: 'alice@example.com',
        password: 'SecurePass1!',
      });

      expect(res.status).toBe(201);
      expect(res.body).toEqual({ message: 'Registration successful' });
    });

    it('should store the user with a hashed (not plain-text) password', async () => {
      const plainPassword = 'MyPassword123';

      await request(app).post('/api/auth/register').send({
        name: 'Bob Jones',
        email: 'bob@example.com',
        password: plainPassword,
      });

      const user = await inMemoryUserStore.findByEmail('bob@example.com');
      expect(user).not.toBeNull();
      expect(user!.passwordHash).not.toBe(plainPassword);
      expect(user!.passwordHash).toMatch(/^\$2[ab]\$\d{2}\$/);
    });

    it('should normalise email to lower-case before storing', async () => {
      await request(app).post('/api/auth/register').send({
        name: 'Carol White',
        email: 'Carol@Example.COM',
        password: 'SecurePass1!',
      });

      const user = await inMemoryUserStore.findByEmail('carol@example.com');
      expect(user).not.toBeNull();
      expect(user!.email).toBe('carol@example.com');
    });
  });

  // ── Validation errors (400) ───────────────────────────────────────────────

  describe('Validation errors (400)', () => {
    it('should return 400 when name is missing', async () => {
      const res = await request(app).post('/api/auth/register').send({
        email: 'test@example.com',
        password: 'SecurePass1!',
      });

      expect(res.status).toBe(400);
      expect(res.body.errors).toEqual(
        expect.arrayContaining([expect.objectContaining({ field: 'name' })]),
      );
    });

    it('should return 400 when name is empty whitespace', async () => {
      const res = await request(app).post('/api/auth/register').send({
        name: '   ',
        email: 'test@example.com',
        password: 'SecurePass1!',
      });

      expect(res.status).toBe(400);
      expect(res.body.errors).toEqual(
        expect.arrayContaining([expect.objectContaining({ field: 'name' })]),
      );
    });

    it('should return 400 when email is missing', async () => {
      const res = await request(app).post('/api/auth/register').send({
        name: 'Test User',
        password: 'SecurePass1!',
      });

      expect(res.status).toBe(400);
      expect(res.body.errors).toEqual(
        expect.arrayContaining([expect.objectContaining({ field: 'email' })]),
      );
    });

    it('should return 400 when email is not a valid format', async () => {
      const res = await request(app).post('/api/auth/register').send({
        name: 'Test User',
        email: 'not-an-email',
        password: 'SecurePass1!',
      });

      expect(res.status).toBe(400);
      expect(res.body.errors).toEqual(
        expect.arrayContaining([expect.objectContaining({ field: 'email' })]),
      );
    });

    it('should return 400 when password is too short', async () => {
      const res = await request(app).post('/api/auth/register').send({
        name: 'Test User',
        email: 'test@example.com',
        password: 'short',
      });

      expect(res.status).toBe(400);
      expect(res.body.errors).toEqual(
        expect.arrayContaining([expect.objectContaining({ field: 'password' })]),
      );
    });

    it('should return 400 with all field errors when body is empty', async () => {
      const res = await request(app).post('/api/auth/register').send({});

      expect(res.status).toBe(400);
      expect(res.body.errors).toHaveLength(3);
    });
  });

  // ── Duplicate email (409) ─────────────────────────────────────────────────

  describe('Duplicate email (409)', () => {
    it('should return 409 when email is already registered', async () => {
      await request(app).post('/api/auth/register').send({
        name: 'First User',
        email: 'existing@example.com',
        password: 'SecurePass1!',
      });

      const res = await request(app).post('/api/auth/register').send({
        name: 'Second User',
        email: 'existing@example.com',
        password: 'AnotherPass1!',
      });

      expect(res.status).toBe(409);
      expect(res.body.errors).toEqual(
        expect.arrayContaining([expect.objectContaining({ field: 'email' })]),
      );
    });

    it('should be case-insensitive for duplicate email check', async () => {
      await request(app).post('/api/auth/register').send({
        name: 'First User',
        email: 'User@Example.com',
        password: 'SecurePass1!',
      });

      const res = await request(app).post('/api/auth/register').send({
        name: 'Second User',
        email: 'user@example.com',
        password: 'AnotherPass1!',
      });

      expect(res.status).toBe(409);
    });

    it('should not expose whether the email is in use via the error message', async () => {
      await request(app).post('/api/auth/register').send({
        name: 'First User',
        email: 'secret@example.com',
        password: 'SecurePass1!',
      });

      const res = await request(app).post('/api/auth/register').send({
        name: 'Attacker',
        email: 'secret@example.com',
        password: 'AnotherPass1!',
      });

      // Message must not leak that the account exists ("already registered", "account found", etc.)
      const message: string = res.body.errors[0].message as string;
      expect(message.toLowerCase()).not.toContain('registered');
      expect(message.toLowerCase()).not.toContain('account');
      expect(message.toLowerCase()).not.toContain('exists');
    });
  });
});
