# AI Subsystem Runbook

Issues: #962 (Story), #945 (Theme), #958 (Observability)

Review date: 2026-05-28

---

## Purpose

This runbook documents detection, diagnosis, and remediation procedures for
operational incidents affecting the Festival Event Planner AI subsystem.
For SLO targets and alert thresholds referenced throughout this document
see [ai-slos.md](ai-slos.md).

For broader system-level disaster recovery see [dr-runbook.md](dr-runbook.md).

---

## Quick Reference

| Symptom                                      | Most likely cause       | Jump to                     |
| -------------------------------------------- | ----------------------- | --------------------------- |
| `healthSignal: "degraded"` on /api/ai/health | Elevated error rate     | [§ Degraded Health Signal]  |
| `healthSignal: "unhealthy"`                  | Provider outage / creds | [§ Unhealthy Health Signal] |
| All AI endpoints return 503                  | No provider configured  | [§ Provider Not Configured] |
| Latency avg > 3 000 ms                       | Provider slowness       | [§ Latency Degradation]     |
| Rate-limit ratio > 10 %                      | Quota exhausted         | [§ Rate Limiting]           |
| Timeout ratio > 5 %                          | Network or model load   | [§ Timeouts]                |
| Unexpected AI output                         | Prompt injection        | [§ Safety Violations]       |

---

## AI Health Endpoint

```
GET /api/ai/health
Authorization: Bearer <token>
```

**Response shape:**

```jsonc
{
  "status": "healthy", // "healthy" | "degraded" | "unhealthy"
  "counters": {
    "total": 0,
    "success": 0,
    "failure": 0,
    "rateLimited": 0,
    "timedOut": 0,
  },
  "latency": {
    "totalMs": 0,
    "avgMs": 0,
    "minMs": 0,
    "maxMs": 0,
  },
  "byWorkflow": {},
  "byProvider": {},
  "lastResetAt": "2026-01-01T00:00:00.000Z",
}
```

> Counters reset on process restart. For sustained history query
> `ai_request_logs` directly (see [§ Database Queries]).

---

## Incident Procedures

### § Degraded Health Signal

**Trigger:** `healthSignal` returns `"degraded"` (success rate 90–95 %).

**Steps:**

1. Retrieve the health snapshot:
   ```bash
   curl -s -H "Authorization: Bearer $TOKEN" https://<host>/api/ai/health | jq .
   ```
2. Check the `byWorkflow` map for the failing workflow(s).
3. Check the `byProvider` map to identify if one provider is disproportionately
   failing.
4. Query recent failures in the database:
   ```sql
   SELECT workflow_type, provider, safe_error_message, COUNT(*) AS cnt
   FROM ai_request_logs
   WHERE outcome != 'success'
     AND occurred_at >= NOW() - INTERVAL '30 minutes'
   GROUP BY workflow_type, provider, safe_error_message
   ORDER BY cnt DESC;
   ```
5. If failures are concentrated in one workflow, check for recent deployments
   that modified that workflow's prompt or parser.
6. If failures span all workflows, escalate to [§ Unhealthy Health Signal].

**Resolution criteria:** `healthSignal` returns `"healthy"` for 10+ consecutive
minutes.

---

### § Unhealthy Health Signal

**Trigger:** `healthSignal` returns `"unhealthy"` (success rate < 90 %).

**Steps:**

1. Check provider connectivity:
   - Azure OpenAI: review Azure Service Health dashboard.
   - OpenAI: check https://status.openai.com/.
2. Verify credentials are present and not expired:
   ```bash
   # Check that AI env vars are set (do not print values):
   printenv | grep -E "^(AZURE_OPENAI|OPENAI_API)" | sed 's/=.*/=<set>/'
   ```
3. Review `ai_safety_events` for unusual injection / output rejection spikes:
   ```sql
   SELECT event_type, COUNT(*) AS cnt
   FROM ai_safety_events
   WHERE occurred_at >= NOW() - INTERVAL '30 minutes'
   GROUP BY event_type
   ORDER BY cnt DESC;
   ```
4. If provider is confirmed down: the backend returns graceful `503` responses.
   No action required beyond monitoring provider recovery.
5. If credentials are expired: rotate via environment variable / secret manager
   and redeploy. Follow the secret-rotation procedure in
   [docs/security/jwt-secrets.md](../security/jwt-secrets.md).
6. If no provider issue is found, review recent commits to the AI controller for
   regressions.

**Escalation:** If the provider is operational and credentials are valid but the
error rate remains > 10 % for > 30 minutes, escalate to on-call engineering.

---

### § Provider Not Configured

**Trigger:** All `/api/ai/*` endpoints return `503 No AI provider configured`.

**Cause:** Neither `AZURE_OPENAI_API_KEY` nor `OPENAI_API_KEY` is set in the
running environment.

**Steps:**

1. Confirm the environment variable is missing:
   ```bash
   printenv | grep -E "^(AZURE_OPENAI|OPENAI_API)" | wc -l
   # Expected: > 0 when at least one provider is configured
   ```
2. Set the appropriate environment variable for the target environment.
3. Restart the backend service for the new variable to take effect.
4. Verify recovery via `GET /api/ai/health`.

---

### § Latency Degradation

**Trigger:** `latency.avgMs` on the health endpoint exceeds the p90 target
(3 000 ms) or a database query shows p90 > 8 000 ms.

**Steps:**

1. Check provider status pages for slowness advisories.
2. Identify the slowest workflows:
   ```sql
   SELECT workflow_type, AVG(duration_ms)::int AS avg_ms,
          MAX(duration_ms) AS max_ms, COUNT(*) AS cnt
   FROM ai_request_logs
   WHERE occurred_at >= NOW() - INTERVAL '1 hour'
   GROUP BY workflow_type
   ORDER BY avg_ms DESC;
   ```
3. For workflows with large prompts (grounded, budget-insight, vendor-recommendation)
   consider reducing context payload size.
4. If the provider is slow globally, consider switching to the fallback provider:
   - Primary: Azure OpenAI (uses `AZURE_OPENAI_*` env vars)
   - Fallback: OpenAI (uses `OPENAI_API_KEY`)
   - Failover is automatic; to force OpenAI-only temporarily unset
     `AZURE_OPENAI_API_KEY` and restart.
5. If p99 latency exceeds `AI_SLO_LATENCY_P99_MS` (8 000 ms) for > 5 minutes,
   treat as a Warning-severity incident.

---

### § Rate Limiting

**Trigger:** Rate-limit ratio (`counters.rateLimited / counters.total`) exceeds
10 % (`AI_SLO_RATE_LIMIT_ALERT_RATIO`).

**Steps:**

1. Identify the rate-limited provider:
   ```sql
   SELECT provider, COUNT(*) AS rate_limited_cnt
   FROM ai_request_logs
   WHERE outcome = 'rate_limited'
     AND occurred_at >= NOW() - INTERVAL '30 minutes'
   GROUP BY provider;
   ```
2. Check provider quotas in their respective dashboards.
3. If only one provider is being rate-limited, the backend will automatically
   fall back to the other provider. Confirm fallback is functioning by checking
   `byProvider` in the health snapshot.
4. If both providers are rate-limited:
   - Implement request queuing / throttling at the gateway layer.
   - Consider requesting a quota increase from the provider.
5. Per the retry policy in `ai-slo.ts`, rate-limited requests are **not**
   automatically retried; the 60-second cool-down (`AI_RATE_LIMIT_BACKOFF_MS`)
   must elapse before the next attempt.

---

### § Timeouts

**Trigger:** Timeout ratio (`counters.timedOut / counters.total`) exceeds 5 %.

**Steps:**

1. Check whether provider latency is elevated (see [§ Latency Degradation]).
2. Identify the timed-out workflows:
   ```sql
   SELECT workflow_type, COUNT(*) AS cnt
   FROM ai_request_logs
   WHERE outcome = 'timed_out'
     AND occurred_at >= NOW() - INTERVAL '30 minutes'
   GROUP BY workflow_type
   ORDER BY cnt DESC;
   ```
3. For workflows with consistently large prompts, review whether context
   payloads can be trimmed.
4. The hard timeout is `AI_REQUEST_TIMEOUT_MS` (30 000 ms). **Do not reduce
   this value** without first investigating prompt size; the timeout is set
   conservatively to accommodate GPT-4o-class models under load.
5. If the provider confirms it is not responding within 30 seconds, open a
   support ticket with the provider.

---

### § Safety Violations

**Trigger:** `ai_safety_events` shows unusual counts of `injection_blocked` or
`output_rejected` events.

**Steps:**

1. Query recent safety events for patterns:
   ```sql
   SELECT event_type, workflow_type, threat_categories, detail, COUNT(*) AS cnt
   FROM ai_safety_events
   WHERE occurred_at >= NOW() - INTERVAL '1 hour'
   GROUP BY event_type, workflow_type, threat_categories, detail
   ORDER BY cnt DESC
   LIMIT 20;
   ```
2. If a specific user is generating many injection attempts review their recent
   actions in `ai_audit_events`.
3. If output is being rejected at an unusually high rate, investigate whether a
   recent model update changed output formatting in a way that fails the safety
   validator.
4. Do not disable safety controls to resolve high rejection rates. Instead,
   adjust the output validator in `ai-safety.ts` after careful review.

---

## Monitoring and Alerting Guidance

### Recommended Alert Rules

Configure the following alerts in your monitoring platform (Datadog, Grafana,
CloudWatch, etc.) against metrics derived from `GET /api/ai/health` or from
`ai_request_logs`:

| Alert name                    | Condition                                             | Severity |
| ----------------------------- | ----------------------------------------------------- | -------- |
| `ai.success_rate.warning`     | Success rate < 95 % for 5+ consecutive minutes        | Warning  |
| `ai.success_rate.critical`    | Success rate < 90 % for 2+ consecutive minutes        | Critical |
| `ai.latency.p90.warning`      | Query p90 latency > 3 000 ms for 5+ min window        | Warning  |
| `ai.latency.p99.critical`     | Query p99 latency > 8 000 ms for 5+ min window        | Critical |
| `ai.rate_limit.warning`       | Rate-limit ratio > 10 % over rolling 100 requests     | Warning  |
| `ai.rate_limit.critical`      | Rate-limit ratio > 25 % over rolling 100 requests     | Critical |
| `ai.timeout.warning`          | Timeout ratio > 5 % over rolling 100 requests         | Warning  |
| `ai.timeout.critical`         | Timeout ratio > 10 % over rolling 100 requests        | Critical |
| `ai.health.unhealthy`         | `healthSignal = "unhealthy"` for 2+ consecutive polls | Critical |
| `ai.provider.none_configured` | All AI endpoints returning 503 for 5+ minutes         | Critical |

### Polling Intervals

- `GET /api/ai/health`: poll every **60 seconds** for health signal evaluation.
- `ai_request_logs` percentile queries: run every **5 minutes** for latency SLO
  compliance checks.
- `ai_safety_events` anomaly queries: run every **15 minutes**.

---

## Database Queries Reference

### Recent failure breakdown

```sql
SELECT
  workflow_type,
  provider,
  outcome,
  safe_error_message,
  COUNT(*) AS cnt,
  AVG(duration_ms)::int AS avg_ms
FROM ai_request_logs
WHERE occurred_at >= NOW() - INTERVAL '1 hour'
  AND outcome != 'success'
GROUP BY workflow_type, provider, outcome, safe_error_message
ORDER BY cnt DESC;
```

### Latency percentiles (last hour)

```sql
SELECT
  percentile_cont(0.50) WITHIN GROUP (ORDER BY duration_ms)::int AS p50_ms,
  percentile_cont(0.90) WITHIN GROUP (ORDER BY duration_ms)::int AS p90_ms,
  percentile_cont(0.99) WITHIN GROUP (ORDER BY duration_ms)::int AS p99_ms,
  COUNT(*) AS total
FROM ai_request_logs
WHERE occurred_at >= NOW() - INTERVAL '1 hour';
```

### SLO compliance snapshot (last 100 requests)

```sql
WITH latest AS (
  SELECT outcome
  FROM ai_request_logs
  ORDER BY occurred_at DESC
  LIMIT 100
)
SELECT
  COUNT(*) AS total,
  COUNT(*) FILTER (WHERE outcome = 'success')      AS success,
  COUNT(*) FILTER (WHERE outcome = 'rate_limited') AS rate_limited,
  COUNT(*) FILTER (WHERE outcome = 'timed_out')    AS timed_out,
  ROUND(COUNT(*) FILTER (WHERE outcome = 'success')::numeric / COUNT(*) * 100, 1)
    AS success_rate_pct
FROM latest;
```

### Retry effectiveness

```sql
SELECT
  retry_count,
  outcome,
  COUNT(*) AS cnt,
  AVG(duration_ms)::int AS avg_ms
FROM ai_request_logs
WHERE occurred_at >= NOW() - INTERVAL '24 hours'
  AND retry_count > 0
GROUP BY retry_count, outcome
ORDER BY retry_count, outcome;
```

---

## Escalation Path

| Level | Contact                           | When                                             |
| ----- | --------------------------------- | ------------------------------------------------ |
| L1    | On-call engineer                  | Warning alerts that don't self-resolve in 15 min |
| L2    | Senior engineer / AI lead         | Critical alerts, suspected security incidents    |
| L3    | Provider support (Azure / OpenAI) | Confirmed provider-side outage or quota issues   |

---

## Related Documentation

- [AI SLOs](ai-slos.md) — SLO definitions and numeric targets
- [DR Runbook](dr-runbook.md) — system-wide disaster recovery
- [Entra Outage Runbook](entra-outage.md) — authentication outage procedures
- `backend/src/lib/ai-slo.ts` — SLO constants and `evaluateAiSlos` helper
- `backend/src/lib/ai-observability.ts` — metrics counters and health signal
- `backend/src/lib/ai-safety.ts` — timeout and injection controls
