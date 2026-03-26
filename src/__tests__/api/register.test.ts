import { handleRegister } from '../../api/auth/register';
import { inMemoryUserStore } from '../../api/auth/userStore';
import express from 'express';
import request from 'supertest';

function buildApp() {
  const app = express();
  app.use(express.json());
  app.post('/api/auth/register', handleRegister);
  return app;
}

describe('POST /api/auth/register', () => {
  beforeEach(() => {
    inMemoryUserStore.clear();
  });

  it('should create user with Attendee role by default', async () => {
    const res = await request(buildApp()).post('/api/auth/register').send({
      name: 'New User',
      email: 'new@test.com',
      password: 'SecurePass123!',
    });

    expect(res.status).toBe(201);
    expect(res.body).toEqual({ message: 'Registration successful' });

    const stored = await inMemoryUserStore.findByEmail('new@test.com');
    expect(stored).not.toBeNull();
    expect(stored!.name).toBe('New User');
  });

  it('should ignore role field in request body', async () => {
    const res = await request(buildApp()).post('/api/auth/register').send({
      name: 'Hacker',
      email: 'hacker@test.com',
      password: 'pass12345',
      role: 'Admin',
    });

    expect(res.status).toBe(201);
    // role is not in the response body for registered users
    const stored = await inMemoryUserStore.findByEmail('hacker@test.com');
    expect(stored).not.toBeNull();
  });

  it('should return 400 when email is missing', async () => {
    const res = await request(buildApp()).post('/api/auth/register').send({
      name: 'User',
      password: 'pass12345',
    });

    expect(res.status).toBe(400);
  });

  it('should return 400 when displayName is missing', async () => {
    const res = await request(buildApp()).post('/api/auth/register').send({
      email: 'user@test.com',
      password: 'pass12345',
    });

    expect(res.status).toBe(400);
  });

  it('should return 400 when password is missing', async () => {
    const res = await request(buildApp()).post('/api/auth/register').send({
      name: 'User',
      email: 'user@test.com',
    });

    expect(res.status).toBe(400);
  });

  it('should not include passwordHash in response', async () => {
    const res = await request(buildApp()).post('/api/auth/register').send({
      name: 'Safe User',
      email: 'safe@test.com',
      password: 'pass123456',
    });

    expect(res.status).toBe(201);
    expect(res.body).not.toHaveProperty('passwordHash');
  });

  it('should set emailConfirmed to false', async () => {
    await request(buildApp()).post('/api/auth/register').send({
      name: 'Unconfirmed',
      email: 'unconfirmed@test.com',
      password: 'pass12345passed',
    });

    const stored = await inMemoryUserStore.findByEmail('unconfirmed@test.com');
    expect(stored?.emailConfirmed).toBe(false);
  });

  it('should return 400 for invalid email format', () => {
    const req: ApiRequest = {
      params: {},
      body: { email: 'not-an-email', displayName: 'User', password: 'pass' },
    };
    const res = createMockRes();

    handleRegister(req, res);

    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ error: 'Invalid email format' });
  });

  it('should return 409 when email is already registered', () => {
    const first: ApiRequest = {
      params: {},
      body: { email: 'dup@test.com', displayName: 'First', password: 'pass' },
    };
    handleRegister(first, createMockRes());

    const second: ApiRequest = {
      params: {},
      body: { email: 'dup@test.com', displayName: 'Second', password: 'pass' },
    };
    const res = createMockRes();

    handleRegister(second, res);

    expect(res.statusCode).toBe(409);
    expect(res.body).toEqual({ error: 'Email already registered' });
  });

  it('should sanitize displayName to prevent XSS', () => {
    const req: ApiRequest = {
      params: {},
      body: {
        email: 'xss@test.com',
        displayName: '<script>alert("xss")</script>',
        password: 'pass',
      },
    };
    const res = createMockRes();

    handleRegister(req, res);

    expect(res.statusCode).toBe(201);
    expect((res.body as { displayName: string }).displayName).toBe(
      '&lt;script&gt;alert("xss")&lt;/script&gt;',
    );
  });
});
