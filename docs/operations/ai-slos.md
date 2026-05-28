# AI Performance and Reliability SLOs

Issues: #962 (Story), #945 (Theme), #958 (Observability)

Review date: 2026-05-28

---

## Purpose

This document defines the Service Level Objectives (SLOs) for all AI-assisted
operations in the Festival Event Planner. It serves as the authoritative
reference for:

- Engineering decisions on timeout, retry, and back-off configuration
- Alerting rule thresholds in monitoring tooling
- Incident classification and escalation triggers (see [ai-runbook.md](ai-runbook.md))
- Acceptance criteria validation for [#962][story]

All numeric constants defined here are implemented as typed exports in
`backend/src/lib/ai-slo.ts` so that application code, tests, and alerting rules
share a single source of truth.

---

## AI Endpoint Inventory

| Endpoint                             | Workflow type           | Description                              |
| ------------------------------------ | ----------------------- | ---------------------------------------- |
| `POST /api/ai/suggest`               | `suggest`               | General event suggestions                |
| `POST /api/ai/grounded`              | `grounded`              | Event-context-grounded suggestions       |
| `POST /api/ai/rsvp-draft`            | `rsvp-draft`            | Draft RSVP communication messages        |
| `POST /api/ai/task-breakdown`        | `task-breakdown`        | Break event tasks into sub-tasks         |
| `POST /api/ai/budget-insight`        | `budget-insight`        | Budget variance analysis                 |
| `POST /api/ai/vendor-recommendation` | `vendor-recommendation` | Vendor comparison advisory               |
| `POST /api/ai/conflict-resolution`   | `conflict-resolution`   | Timeline conflict resolution             |
| `POST /api/ai/analytics-narrative`   | `analytics-narrative`   | Analytics narrative summaries            |
| `GET  /api/ai/health`                | —                       | AI subsystem health and metrics snapshot |

---

## Latency SLOs

All latency measurements are end-to-end: from when the backend dispatches the
provider HTTP request until the full response body is parsed. Client-to-server
network time is excluded.

| Percentile | Target     | Constant                |
| ---------- | ---------- | ----------------------- |
| p50        | ≤ 1 500 ms | `AI_SLO_LATENCY_P50_MS` |
| p90        | ≤ 3 000 ms | `AI_SLO_LATENCY_P90_MS` |
| p99        | ≤ 8 000 ms | `AI_SLO_LATENCY_P99_MS` |

### Measurement

The in-memory counters exposed by `GET /api/ai/health` track `avgMs`, `minMs`,
and `maxMs` for the current process lifetime. For percentile accuracy over
sustained traffic use the `ai_request_logs` table:

```sql
SELECT
  percentile_cont(0.50) WITHIN GROUP (ORDER BY duration_ms) AS p50,
  percentile_cont(0.90) WITHIN GROUP (ORDER BY duration_ms) AS p90,
  percentile_cont(0.99) WITHIN GROUP (ORDER BY duration_ms) AS p99
FROM ai_request_logs
WHERE occurred_at >= NOW() - INTERVAL '1 hour';
```

### Alert Triggers

| Condition                                       | Severity |
| ----------------------------------------------- | -------- |
| `avgMs` consistently > p90 target               | Warning  |
| `maxMs` in last 15 min > p99 target             | Warning  |
| p90 query result > p99 target for 5+ min window | Critical |

---

## Success Rate SLO

| Metric                     | Target | Constant                                 |
| -------------------------- | ------ | ---------------------------------------- |
| Success rate (rolling 100) | ≥ 95 % | `AI_SLO_SUCCESS_RATE_TARGET`             |
| Degraded threshold         | ≥ 90 % | `AI_SLO_SUCCESS_RATE_DEGRADED_THRESHOLD` |

**Healthy**: success rate ≥ 95 %  
**Degraded**: 90 % ≤ success rate < 95 %  
**Unhealthy**: success rate < 90 %

The `GET /api/ai/health` endpoint reports `healthSignal: "healthy" | "degraded" |
"unhealthy"` derived from the in-memory counters.

### Alert Triggers

| Condition                                       | Severity |
| ----------------------------------------------- | -------- |
| Success rate < 95 % for ≥ 5 consecutive minutes | Warning  |
| Success rate < 90 % for ≥ 2 consecutive minutes | Critical |

---

## Availability SLO

| Metric                  | Target | Constant                     |
| ----------------------- | ------ | ---------------------------- |
| Monthly AI availability | 99.9 % | `AI_SLO_AVAILABILITY_TARGET` |

Availability is defined as the percentage of calendar time during which the AI
endpoint returns any response (including a graceful `503 No AI provider
configured` when credentials are absent). Unplanned downtime budget:
**≈ 43 minutes per calendar month**.

---

## Timeout Policy

| Parameter                | Value     | Constant                |
| ------------------------ | --------- | ----------------------- |
| Provider request timeout | 30 000 ms | `AI_REQUEST_TIMEOUT_MS` |

A request that does not receive a complete response within 30 seconds is
aborted. The outcome is recorded as `timed_out` in `ai_request_logs` and
counted in the `timedOut` in-memory counter.

The 30-second value is intentionally generous to accommodate large prompts
sent to GPT-4o-class models. If the p99 latency SLO is consistently breached,
investigate prompt size reduction before reducing the timeout.

### Timeout Alert

| Condition                                  | Severity |
| ------------------------------------------ | -------- |
| Timeout ratio > 5 % over rolling 100 reqs  | Warning  |
| Timeout ratio > 10 % over rolling 100 reqs | Critical |

---

## Retry Policy

| Parameter           | Value    | Constant                   |
| ------------------- | -------- | -------------------------- |
| Max retry attempts  | 2        | `AI_RETRY_MAX_ATTEMPTS`    |
| Base back-off delay | 500 ms   | `AI_RETRY_BACKOFF_BASE_MS` |
| Max back-off delay  | 5 000 ms | `AI_RETRY_BACKOFF_MAX_MS`  |

Retries are attempted **only** for transient failures:

- Network errors (`ECONNREFUSED`, `ENOTFOUND`, `ETIMEDOUT`)
- HTTP 5xx responses from the provider
- Request timeouts (outcome `timed_out`)

Retries are **not** attempted for:

- HTTP 4xx responses (bad request, unauthorized, forbidden)
- Rate-limit (429) responses — use the rate-limit back-off instead
- Prompt injection blocks (`ai-safety.ts` rejections)
- `503 No AI provider configured` responses

**Back-off schedule** (`computeRetryBackoffMs`):

| Attempt   | Delay    |
| --------- | -------- |
| 1st retry | 500 ms   |
| 2nd retry | 1 000 ms |

---

## Rate-Limit Policy

| Parameter               | Value     | Constant                        |
| ----------------------- | --------- | ------------------------------- |
| Cool-down after 429     | 60 000 ms | `AI_RATE_LIMIT_BACKOFF_MS`      |
| Alert threshold (ratio) | 10 %      | `AI_SLO_RATE_LIMIT_ALERT_RATIO` |

On receipt of a 429 response the backend records the outcome as `rate_limited`
and should enforce the 60-second cool-down before the next request to the same
provider. If a `Retry-After` header is present its value supersedes the
constant.

### Rate-Limit Alert

| Condition                                         | Severity |
| ------------------------------------------------- | -------- |
| Rate-limit ratio > 10 % over rolling 100 requests | Warning  |
| Rate-limit ratio > 25 % over rolling 100 requests | Critical |

---

## SLO Compliance Evaluation

The `evaluateAiSlos(total, success, rateLimited, timedOut)` function in
`backend/src/lib/ai-slo.ts` performs a point-in-time SLO compliance check and
returns a structured `SloEvaluationResult`.

Callers should pass counters from `getAiMetricsSnapshot()` (in-memory, fast,
current process only) for live checks, or counters derived from a database query
for cross-process / historical evaluation.

A minimum sample window of **100 requests** (`AI_SLO_MIN_SAMPLE_WINDOW`) is
required before the result is considered statistically meaningful; below this
threshold the check still runs but its result should be treated as indicative.

---

## Observability Alignment (#958)

SLO-relevant signals exposed by `GET /api/ai/health`:

| Signal                 | SLO dimension           | Relevant constant               |
| ---------------------- | ----------------------- | ------------------------------- |
| `counters.success`     | Success rate            | `AI_SLO_SUCCESS_RATE_TARGET`    |
| `counters.rateLimited` | Rate-limit ratio        | `AI_SLO_RATE_LIMIT_ALERT_RATIO` |
| `counters.timedOut`    | Timeout ratio           | `AI_REQUEST_TIMEOUT_MS`         |
| `latency.avgMs`        | Latency (proxy for p50) | `AI_SLO_LATENCY_P50_MS`         |
| `latency.maxMs`        | Latency (proxy for p99) | `AI_SLO_LATENCY_P99_MS`         |
| `healthSignal`         | Overall health          | Derived from success rate       |

For per-workflow and per-provider breakdowns use the `byWorkflow` and
`byProvider` maps in the snapshot.

Database tables populated by the observability layer:

| Table               | Contents                                   |
| ------------------- | ------------------------------------------ |
| `ai_request_logs`   | Every request: outcome, duration, provider |
| `ai_audit_events`   | User-triggered AI actions with retry count |
| `ai_safety_events`  | Injection detections and output rejections |
| `ai_privacy_events` | PII redaction and filter events            |

---

## Error Budget

With a 95 % success-rate SLO the monthly error budget is:

```
Error budget = (1 - 0.95) × total monthly requests
             = 0.05 × total monthly requests
```

Once the error budget is exhausted (i.e. success rate has been below 95 % for
the equivalent cumulative time) new feature deployments to the AI subsystem
should be paused until the budget is replenished.

---

## Related Documentation

- [AI Runbook](ai-runbook.md) — incident response and escalation procedures
- [DR Runbook](dr-runbook.md) — broader disaster-recovery procedures
- `backend/src/lib/ai-slo.ts` — SLO constants and evaluation helpers
- `backend/src/lib/ai-observability.ts` — runtime metrics and health signal (#958)
- `backend/src/lib/ai-safety.ts` — timeout and injection controls (#956)

[story]: https://github.com/seriously-not-prod/break-things-here/issues/962
