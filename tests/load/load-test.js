/**
 * k6 Load Test — Festival & Event Planner API
 *
 * NFR §5.1 targets:
 *  - Page load time < 2 seconds on 4G
 *  - API response time < 500ms for 95th percentile
 *  - Support 100+ concurrent users without degradation
 *
 * Run:
 *   k6 run tests/load/load-test.js
 *   k6 run --vus 100 --duration 60s tests/load/load-test.js
 *   k6 run --env BASE_URL=http://localhost:4000 tests/load/load-test.js
 */

import { check, sleep } from 'k6';
import http from 'k6/http';
import { Counter, Rate, Trend } from 'k6/metrics';

// ── Custom metrics ───────────────────────────────────────────────────────────
const apiErrors = new Counter('api_errors');
const sla_pass = new Rate('sla_pass_500ms');
const responseTime = new Trend('response_time_ms', true);

// ── Configuration ────────────────────────────────────────────────────────────
const BASE_URL = __ENV.BASE_URL || 'http://localhost:4000';
const FRONTEND_URL = __ENV.FRONTEND_URL || 'http://localhost:8081';

export const options = {
  scenarios: {
    // Ramp up to 100 concurrent users, hold, then ramp down
    concurrent_users: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '30s', target: 25 },  // ramp up to 25
        { duration: '30s', target: 100 }, // ramp up to 100 (spec: 100+ concurrent)
        { duration: '60s', target: 100 }, // hold at 100
        { duration: '20s', target: 0 },   // ramp down
      ],
      gracefulRampDown: '15s',
    },
  },
  thresholds: {
    // NFR §5.1: 95th percentile API response < 500ms
    http_req_duration: ['p(95)<500'],
    // NFR §5.1: 99th percentile < 2000ms (page load target)
    'http_req_duration{type:health}': ['p(99)<2000'],
    'http_req_duration{type:events_list}': ['p(95)<500'],
    'http_req_duration{type:auth}': ['p(95)<500'],
    // Error rate < 1%
    http_req_failed: ['rate<0.01'],
    // Custom SLA metric
    sla_pass_500ms: ['rate>0.95'],
  },
};

// ── Helpers ──────────────────────────────────────────────────────────────────
function authHeaders(token) {
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };
}

function trackRequest(res, scenario) {
  const ok = res.status >= 200 && res.status < 400;
  const fast = res.timings.duration < 500;
  if (!ok) apiErrors.add(1, { scenario });
  sla_pass.add(fast, { scenario });
  responseTime.add(res.timings.duration, { scenario });
  return ok;
}

// ── Test lifecycle ────────────────────────────────────────────────────────────
export function setup() {
  // Obtain an auth token once and reuse across VUs (reduces auth load)
  const res = http.post(
    `${BASE_URL}/api/auth/login`,
    JSON.stringify({ email: 'admin@festival.local', password: 'festivalAdmin2025' }),
    { headers: { 'Content-Type': 'application/json' } },
  );

  if (res.status !== 200) {
    console.warn(`[setup] Login failed with status ${res.status}: ${res.body}`);
    return { token: null };
  }

  const body = JSON.parse(res.body);
  return { token: body.token || body.accessToken || null };
}

// ── Main VU scenario ─────────────────────────────────────────────────────────
export default function main(data) {
  const token = data.token;

  // 1. Health check — should always be fast
  const healthRes = http.get(`${BASE_URL}/health`, { tags: { type: 'health' } });
  check(healthRes, {
    'health: status 200': (r) => r.status === 200,
    'health: has status field': (r) => JSON.parse(r.body).status !== undefined,
  });
  trackRequest(healthRes, 'health');

  sleep(0.2);

  if (!token) {
    console.warn('[VU] No token available; skipping authenticated requests');
    return;
  }

  const headers = authHeaders(token);

  // 2. List events — core API endpoint
  const eventsRes = http.get(`${BASE_URL}/api/events`, {
    headers,
    tags: { type: 'events_list' },
  });
  const eventsOk = check(eventsRes, {
    'events: status 200': (r) => r.status === 200,
    'events: is array': (r) => {
      try { return Array.isArray(JSON.parse(r.body)); } catch { return false; }
    },
    'events: response < 500ms': (r) => r.timings.duration < 500,
  });
  trackRequest(eventsRes, 'events_list');

  sleep(0.3);

  // 3. Current user profile
  const profileRes = http.get(`${BASE_URL}/api/auth/me`, {
    headers,
    tags: { type: 'auth' },
  });
  check(profileRes, {
    'profile: status 200': (r) => r.status === 200,
  });
  trackRequest(profileRes, 'auth');

  sleep(0.3);

  // 4. CSRF token endpoint
  const csrfRes = http.get(`${BASE_URL}/api/csrf-token`, { headers });
  check(csrfRes, {
    'csrf: status 200': (r) => r.status === 200,
    'csrf: has token': (r) => {
      try { return Boolean(JSON.parse(r.body).csrfToken); } catch { return false; }
    },
  });
  trackRequest(csrfRes, 'csrf');

  sleep(0.5);
}

// ── Teardown ─────────────────────────────────────────────────────────────────
export function teardown(data) {
  if (data.token) {
    http.post(
      `${BASE_URL}/api/auth/logout`,
      null,
      { headers: authHeaders(data.token) },
    );
  }
}
