import crypto from 'crypto';
import express from 'express';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { verifyEmailWebhookSignature } from '../src/middleware/verify-email-webhook.js';

const HEADER = 'X-Amz-SNS-Signature';
const SECRET = 'unit-test-secret-do-not-use-in-prod';

function buildApp(): express.Express {
  const app = express();
  app.use(
    express.json({
      verify: (req, _res, buf) => {
        (req as express.Request & { rawBody?: Buffer }).rawBody = buf;
      },
    }),
  );
  app.post('/webhooks/email/bounce', verifyEmailWebhookSignature, (_req, res) => {
    res.json({ ok: true });
  });
  return app;
}

function sign(body: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(body).digest('hex');
}

describe('verifyEmailWebhookSignature middleware', () => {
  let prevSecret: string | undefined;

  beforeEach(() => {
    prevSecret = process.env.EMAIL_WEBHOOK_SECRET;
  });

  afterEach(() => {
    if (prevSecret === undefined) delete process.env.EMAIL_WEBHOOK_SECRET;
    else process.env.EMAIL_WEBHOOK_SECRET = prevSecret;
  });

  it('rejects when EMAIL_WEBHOOK_SECRET is unset', async () => {
    delete process.env.EMAIL_WEBHOOK_SECRET;
    const app = buildApp();
    const res = await request(app)
      .post('/webhooks/email/bounce')
      .set(HEADER, 'whatever')
      .send({ event: 'bounce', email: 'x@y.com' });
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/not configured/i);
  });

  it('rejects when signature header is missing', async () => {
    process.env.EMAIL_WEBHOOK_SECRET = SECRET;
    const app = buildApp();
    const res = await request(app)
      .post('/webhooks/email/bounce')
      .send({ event: 'bounce', email: 'x@y.com' });
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/missing signature/i);
  });

  it('rejects when signature is wrong', async () => {
    process.env.EMAIL_WEBHOOK_SECRET = SECRET;
    const app = buildApp();
    const body = { event: 'bounce', email: 'x@y.com' };
    const res = await request(app)
      .post('/webhooks/email/bounce')
      .set(HEADER, sign(JSON.stringify(body), 'different-secret'))
      .send(body);
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/invalid signature/i);
  });

  it('accepts a request signed with the configured secret', async () => {
    process.env.EMAIL_WEBHOOK_SECRET = SECRET;
    const app = buildApp();
    const body = { event: 'bounce', email: 'x@y.com' };
    const raw = JSON.stringify(body);
    const res = await request(app)
      .post('/webhooks/email/bounce')
      .set('Content-Type', 'application/json')
      .set(HEADER, sign(raw, SECRET))
      .send(raw);
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it('rejects a malformed (non-hex) signature header', async () => {
    process.env.EMAIL_WEBHOOK_SECRET = SECRET;
    const app = buildApp();
    const res = await request(app)
      .post('/webhooks/email/bounce')
      .set(HEADER, 'not-a-hex-string-at-all')
      .send({ event: 'bounce', email: 'x@y.com' });
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/invalid signature/i);
  });

  it('rejects a signature header of the wrong length (not 64 hex chars)', async () => {
    process.env.EMAIL_WEBHOOK_SECRET = SECRET;
    const app = buildApp();
    const res = await request(app)
      .post('/webhooks/email/bounce')
      .set(HEADER, 'deadbeef') // valid hex but too short
      .send({ event: 'bounce', email: 'x@y.com' });
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/invalid signature/i);
  });

  it('rejects when the body has been tampered with after signing', async () => {
    process.env.EMAIL_WEBHOOK_SECRET = SECRET;
    const app = buildApp();
    const original = { event: 'bounce', email: 'x@y.com' };
    const signature = sign(JSON.stringify(original), SECRET);
    const tampered = { event: 'bounce', email: 'attacker@evil.com' };
    const res = await request(app)
      .post('/webhooks/email/bounce')
      .set(HEADER, signature)
      .send(tampered);
    expect(res.status).toBe(401);
  });
});
