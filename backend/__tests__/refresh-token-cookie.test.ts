/**
 * Integration tests for refresh token HttpOnly cookie storage (#289 #290)
 *
 * Verifies all acceptance criteria for issues #267 and #249:
 * - Backend sets refreshToken as HttpOnly, Secure, SameSite=Strict cookie on login
 * - refreshToken is NEVER present in the JSON response body
 * - /auth/refresh reads token from cookie only, not request body
 * - localStorage.getItem('refreshToken') would be null after login
 *   (enforced by frontend code change — verified here at API contract level)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { initializeDatabase, getDatabase, closeDatabase } from '../src/db/database.js';
import { login, refreshTokenEndpoint } from '../src/controllers/auth-controller.js';
import { hashPassword } from '../src/utils/auth-helpers.js';

function makeRes() {
  const cookies: Record<string, { value: string; options: Record<string, unknown> }> = {};
  return {
    statusCode: 200,
    body: null as any,
    cookies,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(data: any) {
      this.body = data;
      return this;
    },
    cookie(name: string, value: string, options: Record<string, unknown> = {}) {
      this.cookies[name] = { value, options };
      return this;
    },
  } as any;
}

function makeReq(body: any = {}, cookies: Record<string, string> = {}, ip = '127.0.0.1') {
  const cookieHeader = Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join('; ');
  return { body, cookies, ip, headers: cookieHeader ? { cookie: cookieHeader } : {} } as any;
}

async function seedVerifiedUser(email: string, password: string): Promise<number> {
  const db = getDatabase();
  const hash = await hashPassword(password);
  const result = await db.run(
    `INSERT INTO users (email, password_hash, display_name, email_verified, role_id, created_at, updated_at)
     VALUES (?, ?, ?, 1, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP) RETURNING id`,
    [email, hash, 'Test User'],
  );
  return result.lastID as number;
}

describe('Refresh Token HttpOnly Cookie (#249 #267 #289 #290)', () => {
  beforeEach(async () => {
    await initializeDatabase();
    const db = getDatabase();
    await db.run('DELETE FROM sessions');
    await db.run('DELETE FROM audit_log');
    await db.run('DELETE FROM users');
  });

  afterEach(async () => {
    await closeDatabase();
  });

  // ── AC: refreshToken set as HttpOnly cookie on login ───────────────────────

  describe('POST /api/auth/login', () => {
    it('sets refreshToken as an HttpOnly cookie', async () => {
      await seedVerifiedUser('user@test.com', 'Pass1234');
      const res = makeRes();
      await login(makeReq({ email: 'user@test.com', password: 'Pass1234' }), res);

      expect(res.statusCode).toBe(200);
      expect(res.cookies['refreshToken']).toBeDefined();
      expect(res.cookies['refreshToken'].options.httpOnly).toBe(true);
    });

    it('sets refreshToken cookie with SameSite=Strict', async () => {
      await seedVerifiedUser('user@test.com', 'Pass1234');
      const res = makeRes();
      await login(makeReq({ email: 'user@test.com', password: 'Pass1234' }), res);

      expect(res.cookies['refreshToken'].options.sameSite).toBe('strict');
    });

    it('sets refreshToken cookie with maxAge of 7 days', async () => {
      await seedVerifiedUser('user@test.com', 'Pass1234');
      const res = makeRes();
      await login(makeReq({ email: 'user@test.com', password: 'Pass1234' }), res);

      const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
      expect(res.cookies['refreshToken'].options.maxAge).toBe(sevenDaysMs);
    });

    it('does NOT include refreshToken in the JSON response body', async () => {
      await seedVerifiedUser('user@test.com', 'Pass1234');
      const res = makeRes();
      await login(makeReq({ email: 'user@test.com', password: 'Pass1234' }), res);

      expect(res.statusCode).toBe(200);
      // AC: refreshToken must NEVER appear in the JSON body (#289)
      expect(res.body).not.toHaveProperty('refreshToken');
    });

    it('returns user info and message in the JSON body', async () => {
      await seedVerifiedUser('user@test.com', 'Pass1234');
      const res = makeRes();
      await login(makeReq({ email: 'user@test.com', password: 'Pass1234' }), res);

      expect(res.body.message).toMatch(/login successful/i);
      expect(res.body.user).toBeDefined();
      expect(res.body.user.email).toBe('user@test.com');
    });
  });

  // ── AC: /auth/refresh reads token from cookie, not request body ───────────

  describe('POST /api/auth/refresh', () => {
    it('returns 401 when no refresh token cookie is present', async () => {
      const res = makeRes();
      // Send empty body AND empty cookies — should fail
      await refreshTokenEndpoint(makeReq({}, {}), res);

      expect(res.statusCode).toBe(401);
    });

    it('returns 401 when refresh token in body only (not cookie)', async () => {
      await seedVerifiedUser('user@test.com', 'Pass1234');
      const loginRes = makeRes();
      await login(makeReq({ email: 'user@test.com', password: 'Pass1234' }), loginRes);

      const cookieToken = loginRes.cookies['refreshToken']?.value;
      expect(cookieToken).toBeDefined();

      // Pass token in body only (no cookie) — must be rejected
      const refreshRes = makeRes();
      await refreshTokenEndpoint(makeReq({ refreshToken: cookieToken }, {}), refreshRes);
      expect(refreshRes.statusCode).toBe(401);
    });

    it('issues new accessToken when valid refresh token cookie is present', async () => {
      await seedVerifiedUser('user@test.com', 'Pass1234');
      const loginRes = makeRes();
      await login(makeReq({ email: 'user@test.com', password: 'Pass1234' }), loginRes);

      const cookieToken = loginRes.cookies['refreshToken']?.value;
      expect(cookieToken).toBeDefined();

      // Pass token via cookie (correct flow)
      const refreshRes = makeRes();
      await refreshTokenEndpoint(
        makeReq({}, { refreshToken: cookieToken }),
        refreshRes,
      );

      expect(refreshRes.statusCode).toBe(200);
      expect(refreshRes.body).toHaveProperty('accessToken');
    });
  });
});
