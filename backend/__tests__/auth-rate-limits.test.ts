import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createAuthLimiter } from '../src/middleware/rate-limit.js';

function buildApp() {
  const app = express();
  app.use(express.json());

  app.post('/auth/login', createAuthLimiter(), (_req, res) => {
    res.status(200).json({ ok: true });
  });

  app.post('/auth/register', createAuthLimiter(), (_req, res) => {
    res.status(200).json({ ok: true });
  });

  app.post('/auth/forgot-password', createAuthLimiter(), (_req, res) => {
    res.status(200).json({ ok: true });
  });

  return app;
}

async function expectRateLimitAfterTenRequests(path: '/auth/login' | '/auth/register' | '/auth/forgot-password') {
  const app = buildApp();

  for (let index = 0; index < 10; index += 1) {
    const response = await request(app).post(path).send({ email: 'user@test.com', password: 'Pass1234' });
    expect(response.status).toBe(200);
  }

  const limitedResponse = await request(app).post(path).send({ email: 'user@test.com', password: 'Pass1234' });
  expect(limitedResponse.status).toBe(429);
  expect(limitedResponse.body).toEqual({ error: 'Too many auth requests. Please try again later.' });
}

describe('Auth endpoint rate limits (#248)', () => {
  it('returns 429 for /auth/login after 10 requests in 15 minutes', async () => {
    await expectRateLimitAfterTenRequests('/auth/login');
  });

  it('returns 429 for /auth/register after 10 requests in 15 minutes', async () => {
    await expectRateLimitAfterTenRequests('/auth/register');
  });

  it('returns 429 for /auth/forgot-password after 10 requests in 15 minutes', async () => {
    await expectRateLimitAfterTenRequests('/auth/forgot-password');
  });
});