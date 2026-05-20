/**
 * k6 Full Load Test — Combined Scenario
 *
 * Runs all five scenarios concurrently to simulate realistic mixed workload:
 *  - Login
 *  - Dashboard browsing
 *  - RSVP submission
 *  - Event creation
 *  - Guest import
 *
 * Configuration: 100 VUs for 5 minutes
 * Thresholds: p95 < 500 ms, error rate < 1%
 *
 * Run:
 *   k6 run tests/load/k6/full-run.js
 *   k6 run --env BASE_URL=http://staging:4000 tests/load/k6/full-run.js
 */

import { check, sleep } from 'k6';
import http from 'k6/http';
import { BASE_URL, TEST_USER, authenticate, authHeaders, trackRequest } from './helpers.js';

export const options = {
  scenarios: {
    mixed_load: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '30s', target: 25 },
        { duration: '30s', target: 50 },
        { duration: '30s', target: 100 },
        { duration: '3m', target: 100 },   // Hold at 100 VUs for 3 min
        { duration: '30s', target: 0 },
      ],
      gracefulRampDown: '15s',
    },
  },
  thresholds: {
    // NFR: p95 response time < 500 ms
    http_req_duration: ['p(95)<500'],
    // NFR: error rate < 1%
    http_req_failed: ['rate<0.01'],
    // Custom SLA metric
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
    // Default event ID
  }

  return { token, eventId };
}

export default function (data) {
  const { token, eventId } = data;
  const vuId = __VU;
  const iterationId = __ITER;

  // Distribute VUs across scenarios based on VU ID to simulate mixed traffic
  const scenarioIndex = vuId % 5;

  switch (scenarioIndex) {
    case 0:
      scenarioLogin();
      break;
    case 1:
      scenarioDashboard(token);
      break;
    case 2:
      scenarioRsvp(eventId, vuId, iterationId);
      break;
    case 3:
      scenarioEventCreate(token, vuId, iterationId);
      break;
    case 4:
      scenarioGuestImport(token, eventId, vuId, iterationId);
      break;
  }
}

// ── Scenario: Login ──────────────────────────────────────────────────────────
function scenarioLogin() {
  const res = http.post(
    `${BASE_URL}/api/auth/login`,
    JSON.stringify({ email: TEST_USER.email, password: TEST_USER.password }),
    {
      headers: { 'Content-Type': 'application/json' },
      tags: { scenario: 'login' },
    },
  );
  check(res, {
    'login: status 200': (r) => r.status === 200,
    'login: response < 500ms': (r) => r.timings.duration < 500,
  });
  trackRequest(res, 'login');
  sleep(1);
}

// ── Scenario: Dashboard ──────────────────────────────────────────────────────
function scenarioDashboard(token) {
  if (!token) return sleep(1);

  const headers = authHeaders(token);

  const healthRes = http.get(`${BASE_URL}/health`, {
    tags: { scenario: 'dashboard_health' },
  });
  check(healthRes, { 'health: 200': (r) => r.status === 200 });
  trackRequest(healthRes, 'dashboard_health');
  sleep(0.3);

  const eventsRes = http.get(`${BASE_URL}/api/events`, {
    headers,
    tags: { scenario: 'dashboard_events' },
  });
  check(eventsRes, {
    'events: 200': (r) => r.status === 200,
    'events: < 500ms': (r) => r.timings.duration < 500,
  });
  trackRequest(eventsRes, 'dashboard_events');
  sleep(0.3);

  const profileRes = http.get(`${BASE_URL}/api/auth/me`, {
    headers,
    tags: { scenario: 'dashboard_profile' },
  });
  check(profileRes, { 'profile: 200': (r) => r.status === 200 });
  trackRequest(profileRes, 'dashboard_profile');
  sleep(0.5);
}

// ── Scenario: RSVP Submission ────────────────────────────────────────────────
function scenarioRsvp(eventId, vuId, iterationId) {
  const rsvpPayload = JSON.stringify({
    name: `Load Guest ${vuId}`,
    email: `loadguest-vu${vuId}-iter${iterationId}@example.com`,
    status: 'confirmed',
    dietary_requirements: 'none',
    plus_one: false,
  });

  const res = http.post(`${BASE_URL}/api/events/${eventId}/rsvp`, rsvpPayload, {
    headers: { 'Content-Type': 'application/json' },
    tags: { scenario: 'rsvp_submit' },
  });
  check(res, {
    'rsvp: status 2xx': (r) => r.status >= 200 && r.status < 300,
    'rsvp: < 500ms': (r) => r.timings.duration < 500,
  });
  trackRequest(res, 'rsvp_submit');
  sleep(1);
}

// ── Scenario: Event Create ───────────────────────────────────────────────────
function scenarioEventCreate(token, vuId, iterationId) {
  if (!token) return sleep(1);

  const headers = authHeaders(token);
  const payload = JSON.stringify({
    title: `Load Event VU${vuId}-${iterationId}`,
    description: 'k6 load test event',
    date: '2026-12-15T10:00:00.000Z',
    location: 'Test Venue',
    max_attendees: 50,
  });

  const res = http.post(`${BASE_URL}/api/events`, payload, {
    headers,
    tags: { scenario: 'event_create' },
  });
  check(res, {
    'event create: 2xx': (r) => r.status >= 200 && r.status < 300,
    'event create: < 500ms': (r) => r.timings.duration < 500,
  });
  trackRequest(res, 'event_create');
  sleep(1);
}

// ── Scenario: Guest Import ───────────────────────────────────────────────────
function scenarioGuestImport(token, eventId, vuId, iterationId) {
  if (!token) return sleep(1);

  const csv = [
    'name,email,dietary_requirements,plus_one',
    `Guest1 VU${vuId},g1-vu${vuId}-i${iterationId}@load.test,none,false`,
    `Guest2 VU${vuId},g2-vu${vuId}-i${iterationId}@load.test,vegetarian,true`,
    `Guest3 VU${vuId},g3-vu${vuId}-i${iterationId}@load.test,vegan,false`,
  ].join('\n');

  const res = http.post(
    `${BASE_URL}/api/events/${eventId}/guests/import`,
    { file: http.file(csv, 'guests.csv', 'text/csv') },
    {
      headers: { Authorization: `Bearer ${token}` },
      tags: { scenario: 'guest_import' },
    },
  );
  check(res, {
    'guest import: 2xx': (r) => r.status >= 200 && r.status < 300,
    'guest import: < 500ms': (r) => r.timings.duration < 500,
  });
  trackRequest(res, 'guest_import');
  sleep(1);
}
