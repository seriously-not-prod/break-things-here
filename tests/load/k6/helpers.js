/**
 * Shared helpers for k6 load test scenarios.
 * Provides authentication, request tracking, and configuration utilities.
 */

import http from 'k6/http';
import { Counter, Rate, Trend } from 'k6/metrics';

// ── Shared metrics ───────────────────────────────────────────────────────────
export const apiErrors = new Counter('api_errors');
export const slaPassed = new Rate('sla_pass_p95_500ms');
export const responseTime = new Trend('response_time_ms', true);

// ── Configuration ────────────────────────────────────────────────────────────
export const BASE_URL = __ENV.BASE_URL || 'http://localhost:4000';
export const FRONTEND_URL = __ENV.FRONTEND_URL || 'http://localhost:5173';

// ── Test credentials ─────────────────────────────────────────────────────────
export const TEST_USER = {
  email: __ENV.TEST_USER_EMAIL || 'admin@festival.local',
  password: __ENV.TEST_USER_PASSWORD || 'festivalAdmin2025',
};

/**
 * Authenticate and return a bearer token.
 * @returns {string|null} JWT token or null on failure
 */
export function authenticate() {
  const res = http.post(
    `${BASE_URL}/api/auth/login`,
    JSON.stringify({ email: TEST_USER.email, password: TEST_USER.password }),
    { headers: { 'Content-Type': 'application/json' } },
  );

  if (res.status !== 200) {
    console.warn(`[auth] Login failed: status=${res.status} body=${res.body}`);
    return null;
  }

  try {
    const body = JSON.parse(res.body);
    return body.token || body.accessToken || null;
  } catch (e) {
    console.warn(`[auth] Failed to parse response: ${e.message}`);
    return null;
  }
}

/**
 * Build standard auth headers for API requests.
 * @param {string} token - JWT bearer token
 * @returns {object} Headers object
 */
export function authHeaders(token) {
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };
}

/**
 * Track request outcome for SLA metrics.
 * @param {object} res - k6 HTTP response
 * @param {string} scenario - Scenario label for tagging
 * @returns {boolean} True if request was successful
 */
export function trackRequest(res, scenario) {
  const ok = res.status >= 200 && res.status < 400;
  const fast = ok && res.timings.duration < 500;
  if (!ok) apiErrors.add(1, { scenario });
  slaPassed.add(fast, { scenario });
  responseTime.add(res.timings.duration, { scenario });
  return ok;
}
