/**
 * k6 Scenario — Dashboard
 *
 * Simulates authenticated users accessing the dashboard endpoints:
 *  - GET /api/events (events listing)
 *  - GET /api/auth/me (user profile)
 *  - GET /health (health check)
 *
 * Thresholds:
 *  - p95 < 500 ms
 *  - Error rate < 1%
 */

import { check, sleep } from 'k6';
import http from 'k6/http';
import { BASE_URL, authenticate, authHeaders, trackRequest } from './helpers.js';

export const options = {
  scenarios: {
    dashboard: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '30s', target: 25 },
        { duration: '1m', target: 100 },
        { duration: '3m', target: 100 },
        { duration: '30s', target: 0 },
      ],
      gracefulRampDown: '10s',
    },
  },
  thresholds: {
    http_req_duration: ['p(95)<500'],
    http_req_failed: ['rate<0.01'],
    sla_pass_p95_500ms: ['rate>0.95'],
  },
};

export function setup() {
  const token = authenticate();
  if (!token) {
    console.error('[setup] Failed to authenticate — tests will skip auth requests');
  }
  return { token };
}

export default function (data) {
  const { token } = data;

  // Health check — unauthenticated, fast baseline
  const healthRes = http.get(`${BASE_URL}/health`, {
    tags: { scenario: 'dashboard_health' },
  });
  check(healthRes, {
    'health: status 200': (r) => r.status === 200,
  });
  trackRequest(healthRes, 'dashboard_health');
  sleep(0.3);

  if (!token) return;

  const headers = authHeaders(token);

  // Events listing — primary dashboard data
  const eventsRes = http.get(`${BASE_URL}/api/events`, {
    headers,
    tags: { scenario: 'dashboard_events' },
  });
  check(eventsRes, {
    'events: status 200': (r) => r.status === 200,
    'events: is array': (r) => {
      try { return Array.isArray(JSON.parse(r.body)); } catch { return false; }
    },
    'events: response < 500ms': (r) => r.timings.duration < 500,
  });
  trackRequest(eventsRes, 'dashboard_events');
  sleep(0.5);

  // User profile
  const profileRes = http.get(`${BASE_URL}/api/auth/me`, {
    headers,
    tags: { scenario: 'dashboard_profile' },
  });
  check(profileRes, {
    'profile: status 200': (r) => r.status === 200,
  });
  trackRequest(profileRes, 'dashboard_profile');
  sleep(0.5);
}
