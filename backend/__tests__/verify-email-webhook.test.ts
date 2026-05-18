import crypto from 'crypto';
import express from 'express';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { verifyEmailWebhookSignature } from '../src/middleware/verify-email-webhook.js';

const SIG_HEADER = 'X-Amz-SNS-Signature';
const DATE_HEADER = 'X-Amz-Date';
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

// HMAC over `<dateHeader>.<rawBody>` — matches the middleware's payload form.
function sign(dateHeader: string, body: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(`${dateHeader}.${body}`).digest('hex');
}

function isoNow(): string {
  return new Date().toISOString();
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
      .set(SIG_HEADER, 'a'.repeat(64))
      .set(DATE_HEADER, isoNow())
      .send({ event: 'bounce', email: 'x@y.com' });
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/not configured/i);
  });

  it('rejects when signature header is missing', async () => {
    process.env.EMAIL_WEBHOOK_SECRET = SECRET;
    const app = buildApp();
    const res = await request(app)
      .post('/webhooks/email/bounce')
      .set(DATE_HEADER, isoNow())
      .send({ event: 'bounce', email: 'x@y.com' });
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/missing signature/i);
  });

  it('rejects when date header is missing', async () => {
    process.env.EMAIL_WEBHOOK_SECRET = SECRET;
    const app = buildApp();
    const res = await request(app)
      .post('/webhooks/email/bounce')
      .set(SIG_HEADER, 'a'.repeat(64))
      .send({ event: 'bounce', email: 'x@y.com' });
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/missing timestamp/i);
  });

  it('rejects when date header is unparseable', async () => {
    process.env.EMAIL_WEBHOOK_SECRET = SECRET;
    const app = buildApp();
    const res = await request(app)
      .post('/webhooks/email/bounce')
      .set(SIG_HEADER, 'a'.repeat(64))
      .set(DATE_HEADER, 'not-a-date')
      .send({ event: 'bounce', email: 'x@y.com' });
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/invalid timestamp/i);
  });

  it('rejects a stale (>5 min old) request even when otherwise signed correctly', async () => {
    process.env.EMAIL_WEBHOOK_SECRET = SECRET;
    const app = buildApp();
    const stale = new Date(Date.now() - 6 * 60 * 1000).toISOString();
    const body = { event: 'bounce', email: 'x@y.com' };
    const raw = JSON.stringify(body);
    const res = await request(app)
      .post('/webhooks/email/bounce')
      .set('Content-Type', 'application/json')
      .set(SIG_HEADER, sign(stale, raw, SECRET))
      .set(DATE_HEADER, stale)
      .send(raw);
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/stale|future/i);
  });

  it('rejects when signature is wrong', async () => {
    process.env.EMAIL_WEBHOOK_SECRET = SECRET;
    const app = buildApp();
    const date = isoNow();
    const body = { event: 'bounce', email: 'x@y.com' };
    const res = await request(app)
      .post('/webhooks/email/bounce')
      .set(SIG_HEADER, sign(date, JSON.stringify(body), 'different-secret'))
      .set(DATE_HEADER, date)
      .send(body);
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/invalid signature/i);
  });

  it('accepts a request signed with the configured secret', async () => {
    process.env.EMAIL_WEBHOOK_SECRET = SECRET;
    const app = buildApp();
    const date = isoNow();
    const raw = JSON.stringify({ event: 'bounce', email: 'x@y.com' });
    const res = await request(app)
      .post('/webhooks/email/bounce')
      .set('Content-Type', 'application/json')
      .set(SIG_HEADER, sign(date, raw, SECRET))
      .set(DATE_HEADER, date)
      .send(raw);
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it('rejects a malformed (non-hex) signature header', async () => {
    process.env.EMAIL_WEBHOOK_SECRET = SECRET;
    const app = buildApp();
    const res = await request(app)
      .post('/webhooks/email/bounce')
      .set(SIG_HEADER, 'not-a-hex-string-at-all')
      .set(DATE_HEADER, isoNow())
      .send({ event: 'bounce', email: 'x@y.com' });
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/invalid signature/i);
  });

  it('rejects a signature header of the wrong length (not 64 hex chars)', async () => {
    process.env.EMAIL_WEBHOOK_SECRET = SECRET;
    const app = buildApp();
    const res = await request(app)
      .post('/webhooks/email/bounce')
      .set(SIG_HEADER, 'deadbeef') // valid hex but too short
      .set(DATE_HEADER, isoNow())
      .send({ event: 'bounce', email: 'x@y.com' });
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/invalid signature/i);
  });

  it('rejects when the body has been tampered with after signing', async () => {
    process.env.EMAIL_WEBHOOK_SECRET = SECRET;
    const app = buildApp();
    const date = isoNow();
    const original = { event: 'bounce', email: 'x@y.com' };
    const signature = sign(date, JSON.stringify(original), SECRET);
    const tampered = { event: 'bounce', email: 'attacker@evil.com' };
    const res = await request(app)
      .post('/webhooks/email/bounce')
      .set(SIG_HEADER, signature)
      .set(DATE_HEADER, date)
      .send(tampered);
    expect(res.status).toBe(401);
  });

  it('rejects replay of a valid signature with a fresh date header', async () => {
    // Captured: signature bound to original date. Attacker rewrites the date
    // header to bypass the staleness check; the HMAC binds the timestamp so
    // the signature must no longer match.
    process.env.EMAIL_WEBHOOK_SECRET = SECRET;
    const app = buildApp();
    const originalDate = new Date(Date.now() - 60 * 1000).toISOString();
    const raw = JSON.stringify({ event: 'bounce', email: 'x@y.com' });
    const goodSig = sign(originalDate, raw, SECRET);
    const res = await request(app)
      .post('/webhooks/email/bounce')
      .set('Content-Type', 'application/json')
      .set(SIG_HEADER, goodSig)
      .set(DATE_HEADER, isoNow()) // rewritten — staleness check would pass
      .send(raw);
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/invalid signature/i);
  });
});
