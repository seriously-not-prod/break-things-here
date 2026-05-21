/**
 * Integration tests for HTTP security headers via helmet (#266)
 *
 * Verifies the real backend app applies the expected security headers
 * and filters invalid production CSP origins before mounting routes.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/index.js';

describe('HTTP Security Headers — helmet middleware (#266)', () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalCorsAllowedOrigins = process.env.CORS_ALLOWED_ORIGINS;
  const originalEnforceHttps = process.env.ENFORCE_HTTPS;

  beforeEach(() => {
    process.env.NODE_ENV = 'test';
    delete process.env.CORS_ALLOWED_ORIGINS;
    delete process.env.ENFORCE_HTTPS;
  });

  afterEach(() => {
    if (originalNodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = originalNodeEnv;
    }

    if (originalCorsAllowedOrigins === undefined) {
      delete process.env.CORS_ALLOWED_ORIGINS;
    } else {
      process.env.CORS_ALLOWED_ORIGINS = originalCorsAllowedOrigins;
    }

    if (originalEnforceHttps === undefined) {
      delete process.env.ENFORCE_HTTPS;
    } else {
      process.env.ENFORCE_HTTPS = originalEnforceHttps;
    }
  });

  it('sets X-Content-Type-Options: nosniff', async () => {
    const res = await request(createApp()).get('/health');
    expect(res.status).toBe(200);
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });

  it('sets X-Frame-Options: SAMEORIGIN', async () => {
    const res = await request(createApp()).get('/health');
    expect(res.headers['x-frame-options']).toBe('SAMEORIGIN');
  });

  it('sets X-DNS-Prefetch-Control: off', async () => {
    const res = await request(createApp()).get('/health');
    expect(res.headers['x-dns-prefetch-control']).toBe('off');
  });

  it('sets Content-Security-Policy header from the real app', async () => {
    const res = await request(createApp()).get('/health');
    expect(res.headers['content-security-policy']).toBeDefined();
    const csp = res.headers['content-security-policy'] as string;
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain(
      "connect-src 'self' http://localhost:3000 http://localhost:4173 http://localhost:5173 http://localhost:5174",
    );
  });

  it('filters blank production origins out of CSP connect-src', async () => {
    process.env.NODE_ENV = 'production';
    process.env.CORS_ALLOWED_ORIGINS = ' https://one.example , , https://two.example ,, ';

    const res = await request(createApp()).get('/health').set('x-forwarded-proto', 'https');
    const csp = res.headers['content-security-policy'] as string;

    expect(csp).toContain("connect-src 'self' https://one.example https://two.example");
    expect(csp).not.toContain("connect-src 'self'  ");
    expect(csp).not.toContain(' ,');
  });

  it('sets Strict-Transport-Security header', async () => {
    const res = await request(createApp()).get('/health');
    expect(res.headers['strict-transport-security']).toBeDefined();
    expect(res.headers['strict-transport-security']).toContain('max-age=');
    expect(res.headers['strict-transport-security']).toContain('includeSubDomains');
    expect(res.headers['strict-transport-security']).toContain('preload');
  });

  it('applies explicit 5-minute cache policy to API GET responses', async () => {
    const res = await request(createApp()).get('/api/auth/entra/config');
    expect(res.headers['cache-control']).toContain('max-age=300');
    expect(res.headers['cache-control']).toContain('private');
    expect(res.headers.vary).toContain('Authorization');
  });

  it('enforces HTTPS in production when ENFORCE_HTTPS=true', async () => {
    process.env.NODE_ENV = 'production';
    process.env.ENFORCE_HTTPS = 'true';

    const res = await request(createApp()).get('/health');

    expect(res.status).toBe(308);
    expect(res.headers.location).toContain('https://');
  });

  it('disables X-XSS-Protection (helmet modern best practice)', async () => {
    const res = await request(createApp()).get('/health');
    expect(res.headers['x-xss-protection']).toBe('0');
  });

  it('removes X-Powered-By header', async () => {
    const res = await request(createApp()).get('/health');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });
});
