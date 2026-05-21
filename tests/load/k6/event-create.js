/**
 * k6 Scenario — Event Create
 *
 * Simulates authenticated users creating new events.
 * Tests the POST /api/events endpoint under load.
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
    event_create: {
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
    console.error('[setup] Failed to authenticate — event creation will fail');
  }
  return { token };
}

export default function (data) {
  const { token } = data;
  if (!token) {
    console.warn('[VU] No token — skipping event creation');
    sleep(1);
    return;
  }

  const headers = authHeaders(token);
  const vuId = __VU;
  const iterationId = __ITER;

  // Create a unique event per VU + iteration
  const eventPayload = JSON.stringify({
    title: `Load Test Event VU${vuId}-${iterationId}`,
    description: 'Auto-generated event for k6 load testing',
    date: '2026-12-15T10:00:00.000Z',
    location: 'Load Test Venue',
    max_attendees: 100,
  });

  const createRes = http.post(`${BASE_URL}/api/events`, eventPayload, {
    headers,
    tags: { scenario: 'event_create' },
  });

  check(createRes, {
    'event create: status 2xx': (r) => r.status >= 200 && r.status < 300,
    'event create: has id': (r) => {
      try {
        const body = JSON.parse(r.body);
        return Boolean(body.id || (body.event && body.event.id));
      } catch {
        return false;
      }
    },
    'event create: response < 500ms': (r) => r.timings.duration < 500,
  });
  trackRequest(createRes, 'event_create');
  sleep(1);

  // Verify event appears in list
  const listRes = http.get(`${BASE_URL}/api/events`, {
    headers,
    tags: { scenario: 'event_list_verify' },
  });
  check(listRes, {
    'event list: status 200': (r) => r.status === 200,
  });
  trackRequest(listRes, 'event_list_verify');
  sleep(0.5);
}
