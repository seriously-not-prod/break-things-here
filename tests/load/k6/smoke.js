/**
 * k6 Smoke Test — PR Gate
 *
 * Lightweight variant for running on every PR.
 * Configuration: 10 VUs for 30 seconds.
 * Validates that core endpoints are functional and meet basic SLA.
 *
 * Run:
 *   k6 run tests/load/k6/smoke.js
 */

import { check, sleep } from 'k6';
import http from 'k6/http';
import { BASE_URL, TEST_USER, authenticate, authHeaders, trackRequest } from './helpers.js';

export const options = {
  scenarios: {
    smoke: {
      executor: 'constant-vus',
      vus: 10,
      duration: '30s',
    },
  },
  thresholds: {
    // Smoke test uses same p95 < 500ms threshold
    http_req_duration: ['p(95)<500'],
    http_req_failed: ['rate<0.01'],
    sla_pass_p95_500ms: ['rate>0.95'],
  },
};

export function setup() {
  const token = authenticate();
  if (!token) {
    console.error('[setup] Authentication failed');
    return { token: null, eventId: 1 };
  }

  const headers = authHeaders(token);
  const eventsRes = http.get(`${BASE_URL}/api/events`, { headers });
  let eventId = 1;
  try {
    const events = JSON.parse(eventsRes.body);
    if (Array.isArray(events) && events.length > 0) {
      eventId = events[0].id;
    }
  } catch {
    // Default
  }

  return { token, eventId };
}

export default function (data) {
  const { token, eventId } = data;

  // 1. Health check
  const healthRes = http.get(`${BASE_URL}/health`, {
    tags: { scenario: 'smoke_health' },
  });
  check(healthRes, {
    'health: status 200': (r) => r.status === 200,
  });
  trackRequest(healthRes, 'smoke_health');
  sleep(0.2);

  // 2. Login
  const loginRes = http.post(
    `${BASE_URL}/api/auth/login`,
    JSON.stringify({ email: TEST_USER.email, password: TEST_USER.password }),
    {
      headers: { 'Content-Type': 'application/json' },
      tags: { scenario: 'smoke_login' },
    },
  );
  check(loginRes, {
    'login: status 200': (r) => r.status === 200,
  });
  trackRequest(loginRes, 'smoke_login');
  sleep(0.3);

  if (!token) return;

  const headers = authHeaders(token);

  // 3. Events list
  const eventsRes = http.get(`${BASE_URL}/api/events`, {
    headers,
    tags: { scenario: 'smoke_events' },
  });
  check(eventsRes, {
    'events: status 200': (r) => r.status === 200,
    'events: < 500ms': (r) => r.timings.duration < 500,
  });
  trackRequest(eventsRes, 'smoke_events');
  sleep(0.3);

  // 4. RSVP submission
  const vuId = __VU;
  const iterationId = __ITER;
  const rsvpRes = http.post(
    `${BASE_URL}/api/events/${eventId}/rsvp`,
    JSON.stringify({
      name: `Smoke Guest ${vuId}`,
      email: `smoke-vu${vuId}-i${iterationId}@test.local`,
      status: 'confirmed',
    }),
    {
      headers: { 'Content-Type': 'application/json' },
      tags: { scenario: 'smoke_rsvp' },
    },
  );
  check(rsvpRes, {
    'rsvp: status 2xx': (r) => r.status >= 200 && r.status < 300,
  });
  trackRequest(rsvpRes, 'smoke_rsvp');
  sleep(0.5);

  // 5. Profile
  const profileRes = http.get(`${BASE_URL}/api/auth/me`, {
    headers,
    tags: { scenario: 'smoke_profile' },
  });
  check(profileRes, {
    'profile: status 200': (r) => r.status === 200,
  });
  trackRequest(profileRes, 'smoke_profile');
  sleep(0.5);
}
