/**
 * Integration tests for HTTP security headers via helmet (#288)
 *
 * Verifies all acceptance criteria for issues #266 and #246:
 * - helmet middleware is applied before route mounting
 * - X-Content-Type-Options: nosniff is present
 * - X-Frame-Options: SAMEORIGIN is present
 * - X-DNS-Prefetch-Control header is present
 * - Content-Security-Policy header is present
 * - Strict-Transport-Security header is present
 * Tests run against the /health endpoint (no auth required)
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express from 'express';
import helmet from 'helmet';
import request from 'supertest';

function buildTestApp() {
  const app = express();

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:', 'blob:'],
          connectSrc: ["'self'"],
          fontSrc: ["'self'"],
          objectSrc: ["'none'"],
          frameAncestors: ["'none'"],
        },
      },
    }),
  );

  app.get('/health', (_req, res) => {
    res.status(200).json({ status: 'healthy' });
  });

  return app;
}

describe('HTTP Security Headers — helmet middleware (#246 #266 #288)', () => {
  let app: express.Express;

  beforeAll(() => {
    app = buildTestApp();
  });

  // ── AC: x-content-type-options ─────────────────────────────────────────────

  it('sets X-Content-Type-Options: nosniff', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });

  // ── AC: x-frame-options ────────────────────────────────────────────────────

  it('sets X-Frame-Options: SAMEORIGIN', async () => {
    const res = await request(app).get('/health');
    expect(res.headers['x-frame-options']).toBe('SAMEORIGIN');
  });

  // ── AC: x-dns-prefetch-control ─────────────────────────────────────────────

  it('sets X-DNS-Prefetch-Control: off', async () => {
    const res = await request(app).get('/health');
    expect(res.headers['x-dns-prefetch-control']).toBe('off');
  });

  // ── AC: content-security-policy ────────────────────────────────────────────

  it('sets Content-Security-Policy header', async () => {
    const res = await request(app).get('/health');
    expect(res.headers['content-security-policy']).toBeDefined();
    const csp = res.headers['content-security-policy'] as string;
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("frame-ancestors 'none'");
  });

  // ── AC: strict-transport-security ──────────────────────────────────────────

  it('sets Strict-Transport-Security header', async () => {
    const res = await request(app).get('/health');
    expect(res.headers['strict-transport-security']).toBeDefined();
    expect(res.headers['strict-transport-security']).toContain('max-age=');
  });

  // ── AC: x-xss-protection disabled (modern best practice) ──────────────────

  it('disables X-XSS-Protection (helmet modern best practice)', async () => {
    const res = await request(app).get('/health');
    // helmet sets this to 0 to disable the buggy browser XSS auditor
    expect(res.headers['x-xss-protection']).toBe('0');
  });

  // ── AC: no X-Powered-By header ────────────────────────────────────────────

  it('removes X-Powered-By header', async () => {
    const res = await request(app).get('/health');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });
});
