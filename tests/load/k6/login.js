/**
 * k6 Scenario — Login
 *
 * Tests the authentication endpoint under load.
 * Each VU performs a login request and validates the response.
 *
 * Thresholds:
 *  - p95 < 500 ms
 *  - Error rate < 1%
 */

import { check, sleep } from 'k6';
import http from 'k6/http';
import { BASE_URL, TEST_USER, trackRequest } from './helpers.js';

export const options = {
  scenarios: {
    login: {
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

export default function () {
  const payload = JSON.stringify({
    email: TEST_USER.email,
    password: TEST_USER.password,
  });

  const res = http.post(`${BASE_URL}/api/auth/login`, payload, {
    headers: { 'Content-Type': 'application/json' },
    tags: { scenario: 'login' },
  });

  check(res, {
    'login: status 200': (r) => r.status === 200,
    'login: returns token': (r) => {
      try {
        const body = JSON.parse(r.body);
        return Boolean(body.token || body.accessToken);
      } catch {
        return false;
      }
    },
    'login: response < 500ms': (r) => r.timings.duration < 500,
  });

  trackRequest(res, 'login');
  sleep(1);
}
