/**
 * k6 Scenario — Guest Import
 *
 * Simulates authenticated users importing guest lists via CSV upload.
 * Tests the bulk import endpoint under load.
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
    guest_import: {
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

  // Get first event for guest import
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

/**
 * Generate a small CSV payload for guest import.
 * Uses VU/iteration IDs to ensure unique emails per request.
 */
function generateGuestCsv(vuId, iterationId) {
  const rows = [
    'name,email,dietary_requirements,plus_one',
  ];

  // Generate 5 guests per import batch
  for (let i = 1; i <= 5; i++) {
    rows.push(
      `Guest ${i} VU${vuId},guest-vu${vuId}-iter${iterationId}-${i}@loadtest.example.com,none,false`,
    );
  }

  return rows.join('\n');
}

export default function (data) {
  const { token, eventId } = data;
  if (!token) {
    console.warn('[VU] No token — skipping guest import');
    sleep(1);
    return;
  }

  const vuId = __VU;
  const iterationId = __ITER;
  const csvContent = generateGuestCsv(vuId, iterationId);

  // Upload CSV as multipart form data
  const importRes = http.post(
    `${BASE_URL}/api/events/${eventId}/guests/import`,
    {
      file: http.file(csvContent, 'guests.csv', 'text/csv'),
    },
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
      tags: { scenario: 'guest_import' },
    },
  );

  check(importRes, {
    'guest import: status 2xx': (r) => r.status >= 200 && r.status < 300,
    'guest import: response < 500ms': (r) => r.timings.duration < 500,
  });
  trackRequest(importRes, 'guest_import');
  sleep(1);

  // Verify guest list after import
  const headers = authHeaders(token);
  const listRes = http.get(`${BASE_URL}/api/events/${eventId}/guests`, {
    headers,
    tags: { scenario: 'guest_list_verify' },
  });
  check(listRes, {
    'guest list: status 200': (r) => r.status === 200,
    'guest list: response < 500ms': (r) => r.timings.duration < 500,
  });
  trackRequest(listRes, 'guest_list_verify');
  sleep(0.5);
}
