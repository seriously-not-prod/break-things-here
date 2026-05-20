# Load Test Baseline

> Baseline performance numbers for the Festival Event Planner API.
> Updated after each nightly full run passes all thresholds.

## NFR Targets

| Metric | Target | Source |
|--------|--------|--------|
| p95 response time | < 500 ms | NFR §5.1 |
| p99 response time | < 2000 ms | NFR §5.1 |
| Concurrent users | 100+ | NFR §5.1 |
| Error rate | < 1% | NFR §5.1 |

## Test Configuration

| Variant | VUs | Duration | Trigger |
|---------|-----|----------|---------|
| Smoke | 10 | 30 s | Every PR |
| Full | 100 | 5 min | Nightly (02:00 UTC) |

## Baseline Numbers (Initial)

> **Date**: 2026-05-20
> **Environment**: CI (ubuntu-latest, Postgres 16, Node.js 20)
> **Commit**: Initial baseline — to be updated after first nightly run

| Scenario | p50 | p90 | p95 | p99 | Error Rate |
|----------|-----|-----|-----|-----|------------|
| Login | — | — | — | — | — |
| Dashboard (health) | — | — | — | — | — |
| Dashboard (events) | — | — | — | — | — |
| Dashboard (profile) | — | — | — | — | — |
| RSVP submission | — | — | — | — | — |
| Event create | — | — | — | — | — |
| Guest import | — | — | — | — | — |
| **Combined (full-run)** | — | — | — | — | — |

## Thresholds

```
http_req_duration: p(95) < 500 ms
http_req_failed:   rate  < 0.01 (1%)
sla_pass_p95_500ms: rate > 0.95 (95% of requests under 500 ms)
```

## Scenarios Covered

1. **Login** (`tests/load/k6/login.js`) — Authentication endpoint throughput
2. **Dashboard** (`tests/load/k6/dashboard.js`) — Health + events list + profile
3. **RSVP Submission** (`tests/load/k6/rsvp-submission.js`) — Public RSVP + guest list read
4. **Event Create** (`tests/load/k6/event-create.js`) — Write-heavy event creation
5. **Guest Import** (`tests/load/k6/guest-import.js`) — CSV upload bulk import
6. **Full Run** (`tests/load/k6/full-run.js`) — Mixed workload combining all above
7. **Smoke** (`tests/load/k6/smoke.js`) — Lightweight PR gate (10 VU / 30s)

## How to Run Locally

```bash
# Install k6
brew install k6  # macOS
# or: sudo apt-get install k6  # Linux

# Smoke test (quick validation)
k6 run tests/load/k6/smoke.js

# Full run (100 VU, 5 min)
k6 run tests/load/k6/full-run.js

# Individual scenario
k6 run tests/load/k6/login.js

# Custom configuration
k6 run --env BASE_URL=http://staging:4000 tests/load/k6/full-run.js
```

## Notes

- Baseline numbers will be populated after the first successful nightly run
- The smoke variant is intentionally lightweight to avoid slowing down PR pipelines
- Guest import and RSVP tests use unique emails per VU/iteration to avoid constraint violations
- All tests authenticate once in `setup()` and share the token across VUs
