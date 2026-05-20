/**
 * k6 Scenario — RSVP Submission
 *
 * Simulates guests submitting RSVP responses to an event.
 * Tests the public RSVP endpoint under load.
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
    rsvp: {
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
    console.error('[setup] Failed to authenticate');
    return { token: null, eventId: 1 };
  }

  // Fetch first available event to use for RSVP
  const headers = authHeaders(token);
  const eventsRes = http.get(`${BASE_URL}/api/events`, { headers });
  let eventId = 1;
  try {
    const events = JSON.parse(eventsRes.body);
    if (Array.isArray(events) && events.length > 0) {
      eventId = events[0].id;
    }
  } catch {
    // Fall back to event ID 1
  }

  return { token, eventId };
}

export default function (data) {
  const { token, eventId } = data;
  const vuId = __VU;
  const iterationId = __ITER;

  // Unique guest email per VU+iteration to avoid duplicate constraints
  const guestEmail = `loadtest-vu${vuId}-iter${iterationId}@example.com`;

  // Submit RSVP (public endpoint)
  const rsvpPayload = JSON.stringify({
    name: `Load Test Guest ${vuId}`,
    email: guestEmail,
    status: 'confirmed',
    dietary_requirements: 'none',
    plus_one: false,
  });

  const rsvpRes = http.post(
    `${BASE_URL}/api/events/${eventId}/rsvp`,
    rsvpPayload,
    {
      headers: { 'Content-Type': 'application/json' },
      tags: { scenario: 'rsvp_submit' },
    },
  );

  check(rsvpRes, {
    'rsvp: status 2xx': (r) => r.status >= 200 && r.status < 300,
    'rsvp: response < 500ms': (r) => r.timings.duration < 500,
  });
  trackRequest(rsvpRes, 'rsvp_submit');
  sleep(1);

  // Also test reading RSVP list (authenticated)
  if (token) {
    const headers = authHeaders(token);
    const listRes = http.get(`${BASE_URL}/api/events/${eventId}/guests`, {
      headers,
      tags: { scenario: 'rsvp_list' },
    });
    check(listRes, {
      'rsvp list: status 200': (r) => r.status === 200,
      'rsvp list: response < 500ms': (r) => r.timings.duration < 500,
    });
    trackRequest(listRes, 'rsvp_list');
  }

  sleep(0.5);
}
