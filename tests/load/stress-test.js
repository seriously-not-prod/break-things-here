/**
 * k6 Stress Test — Festival & Event Planner API
 *
 * Tests system behavior beyond normal operating capacity.
 * Identifies the breaking point and recovery characteristics.
 *
 * Run:
 *   k6 run tests/load/stress-test.js
 */

import { check, sleep } from 'k6';
import http from 'k6/http';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:4000';

export const options = {
  scenarios: {
    stress: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '20s', target: 50 },
        { duration: '30s', target: 100 },
        { duration: '30s', target: 200 }, // 2x normal load
        { duration: '30s', target: 300 }, // 3x normal load
        { duration: '20s', target: 0 }, // ramp down — check recovery
      ],
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.10'], // 10% error rate allowed under stress
    http_req_duration: ['p(95)<2000'], // 2s under stress (degraded but functional)
  },
};

export function setup() {
  const res = http.post(
    `${BASE_URL}/api/auth/login`,
    JSON.stringify({ email: 'admin@festival.local', password: 'festivalAdmin2025' }),
    { headers: { 'Content-Type': 'application/json' } },
  );
  const body = res.status === 200 ? JSON.parse(res.body) : {};
  return { token: body.token || body.accessToken || null };
}

export default function main(data) {
  const headers = data.token
    ? { Authorization: `Bearer ${data.token}`, 'Content-Type': 'application/json' }
    : { 'Content-Type': 'application/json' };

  const res = http.get(`${BASE_URL}/health`);
  check(res, { 'health ok': (r) => r.status === 200 });

  if (data.token) {
    const eventsRes = http.get(`${BASE_URL}/api/events`, { headers });
    check(eventsRes, { 'events ok': (r) => r.status === 200 });
  }

  sleep(0.1);
}
