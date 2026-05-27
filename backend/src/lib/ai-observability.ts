/**
 * AI Observability and Audit Events — Issue #958
 *
 * Provides reusable, production-safe observability for every AI workflow:
 *
 * - In-memory metrics counters: success / failure / latency / rate-limit
 * - Structured audit event logging to `ai_audit_events` (user-triggered actions)
 * - Privacy-safe logging: no PII or sensitive data in log records
 * - Failure and retry visibility: tracks provider errors with retry context
 * - AI health signal export: aggregated snapshot of in-process counters
 *
 * Design principles:
 * - All I/O functions are best-effort: database errors are silently swallowed
 *   so a logging failure never impacts an in-flight AI request.
 * - PII is never written to any table. Only safe metadata (workflow type,
 *   entity ID, provider, outcome) is persisted.
 * - Counter state is process-scoped (in-memory) and resets on restart.
 *   For cross-process aggregation, query `ai_request_logs` directly.
 *
 * ## Metrics snapshot shape (from `getAiMetricsSnapshot`)
 * ```json
 * {
 *   "counters": {
 *     "total": 42,
 *     "success": 38,
 *     "failure": 3,
 *     "rateLimited": 1,
 *     "timedOut": 0
 *   },
 *   "latency": {
 *     "totalMs": 18200,
 *     "avgMs": 433,
 *     "minMs": 120,
 *     "maxMs": 1850
 *   },
 *   "byWorkflow": { "grounded": { "total": 20, "success": 19, "failure": 1 } },
 *   "byProvider": { "azure": { "total": 35, "success": 32, "failure": 3 } },
 *   "lastResetAt": "2026-05-27T00:00:00.000Z"
 * }
 * ```
 */

import { getDatabase } from '../db/database.js';

// ── Types ─────────────────────────────────────────────────────────────────────

/** Outcome classification for an AI request. */
export type AiRequestOutcome = 'success' | 'failure' | 'rate_limited' | 'timed_out';

/**
 * Payload describing a completed AI request, passed to
 * `recordAiRequestMetrics` and `logAiAuditEvent`.
 *
 * No PII fields — only safe operational metadata.
 */
export interface AiRequestRecord {
  /** Authenticated user ID from the JWT, if available. */
  userId: number | undefined;
  /** Logical workflow identifier, e.g. `"grounded"`, `"budget-insight"`. */
  workflowType: string;
  /** Primary entity (event) ID the request was scoped to, or null. */
  entityId: number | null;
  /** AI provider used: `"azure"`, `"openai"`, or `"none"`. */
  provider: string;
  /** Wall-clock duration from request start to response in milliseconds. */
  durationMs: number;
  /** Outcome of the request. */
  outcome: AiRequestOutcome;
  /** HTTP status code returned by the provider, when available. */
  httpStatus?: number;
  /**
   * Safe (non-PII) error description, e.g. `"rate limited by provider"`.
   * Must NOT contain user data, stack traces, or credentials.
   */
  safeErrorMessage?: string;
  /** Number of retry attempts made before this outcome, if any. */
  retryCount?: number;
}

/** Per-dimension breakdown counters. */
interface DimensionCounters {
  total: number;
  success: number;
  failure: number;
  rateLimited: number;
  timedOut: number;
}

/** Latency statistics accumulated across all requests. */
interface LatencyStats {
  totalMs: number;
  avgMs: number;
  minMs: number;
  maxMs: number;
}

/** Shape of the metrics snapshot returned by `getAiMetricsSnapshot`. */
export interface AiMetricsSnapshot {
  counters: DimensionCounters;
  latency: LatencyStats;
  byWorkflow: Record<string, DimensionCounters>;
  byProvider: Record<string, DimensionCounters>;
  /** ISO timestamp of when the in-memory counters were last reset. */
  lastResetAt: string;
}

// ── In-memory counter store ───────────────────────────────────────────────────

/** Mutable in-process counter state (reset on process restart). */
interface MetricsState {
  total: number;
  success: number;
  failure: number;
  rateLimited: number;
  timedOut: number;
  latencyTotalMs: number;
  latencyMinMs: number;
  latencyMaxMs: number;
  latencySampleCount: number;
  byWorkflow: Record<string, DimensionCounters>;
  byProvider: Record<string, DimensionCounters>;
  lastResetAt: Date;
}

/** Singleton metrics state for this process. */
const _state: MetricsState = {
  total: 0,
  success: 0,
  failure: 0,
  rateLimited: 0,
  timedOut: 0,
  latencyTotalMs: 0,
  latencyMinMs: Infinity,
  latencyMaxMs: 0,
  latencySampleCount: 0,
  byWorkflow: {},
  byProvider: {},
  lastResetAt: new Date(),
};

/**
 * Resets all in-memory counters to zero.
 *
 * Intended for use in tests (via import) and for future operational tooling
 * (e.g. periodic counter rotation).  Not exposed via HTTP.
 */
export function resetAiMetrics(): void {
  _state.total = 0;
  _state.success = 0;
  _state.failure = 0;
  _state.rateLimited = 0;
  _state.timedOut = 0;
  _state.latencyTotalMs = 0;
  _state.latencyMinMs = Infinity;
  _state.latencyMaxMs = 0;
  _state.latencySampleCount = 0;
  _state.byWorkflow = {};
  _state.byProvider = {};
  _state.lastResetAt = new Date();
}

/** Returns or creates a zeroed `DimensionCounters` for a dimension key. */
function ensureDimension(
  map: Record<string, DimensionCounters>,
  key: string,
): DimensionCounters {
  if (!map[key]) {
    map[key] = { total: 0, success: 0, failure: 0, rateLimited: 0, timedOut: 0 };
  }
  // Non-null assertion is safe: we just assigned the value above.
  return map[key]!;
}

/** Increments the appropriate field on a `DimensionCounters` object. */
function incrementDimension(counters: DimensionCounters, outcome: AiRequestOutcome): void {
  counters.total += 1;
  if (outcome === 'success') counters.success += 1;
  else if (outcome === 'rate_limited') counters.rateLimited += 1;
  else if (outcome === 'timed_out') counters.timedOut += 1;
  else counters.failure += 1;
}

// ── Public metrics API ────────────────────────────────────────────────────────

/**
 * Records an AI request outcome in the in-memory metrics counters.
 *
 * This function is synchronous and side-effect-free with respect to I/O;
 * it only mutates the module-level `_state` object.  Call it for every
 * AI request regardless of outcome (success, failure, rate-limit, timeout).
 *
 * @param record - Safe operational metadata for the completed request.
 */
export function recordAiRequestMetrics(record: AiRequestRecord): void {
  const { workflowType, provider, outcome, durationMs } = record;

  // ── Global counters ───────────────────────────────────────────────────────
  _state.total += 1;
  if (outcome === 'success') _state.success += 1;
  else if (outcome === 'rate_limited') _state.rateLimited += 1;
  else if (outcome === 'timed_out') _state.timedOut += 1;
  else _state.failure += 1;

  // ── Latency accumulation ──────────────────────────────────────────────────
  _state.latencyTotalMs += durationMs;
  _state.latencySampleCount += 1;
  if (durationMs < _state.latencyMinMs) _state.latencyMinMs = durationMs;
  if (durationMs > _state.latencyMaxMs) _state.latencyMaxMs = durationMs;

  // ── Per-workflow breakdown ────────────────────────────────────────────────
  incrementDimension(ensureDimension(_state.byWorkflow, workflowType), outcome);

  // ── Per-provider breakdown ────────────────────────────────────────────────
  const providerKey = provider || 'unknown';
  incrementDimension(ensureDimension(_state.byProvider, providerKey), outcome);
}

/**
 * Returns an immutable snapshot of the current in-memory metrics counters.
 *
 * Safe to expose via a health/metrics HTTP endpoint.  Values reflect only
 * the current process lifetime; restart will reset all counters to zero.
 */
export function getAiMetricsSnapshot(): AiMetricsSnapshot {
  const sampleCount = _state.latencySampleCount;
  const avgMs = sampleCount > 0 ? Math.round(_state.latencyTotalMs / sampleCount) : 0;
  const minMs = sampleCount > 0 ? _state.latencyMinMs : 0;
  const maxMs = _state.latencyMaxMs;

  return {
    counters: {
      total: _state.total,
      success: _state.success,
      failure: _state.failure,
      rateLimited: _state.rateLimited,
      timedOut: _state.timedOut,
    },
    latency: {
      totalMs: _state.latencyTotalMs,
      avgMs,
      minMs,
      maxMs,
    },
    // Deep-copy dimension maps so callers cannot mutate internal state.
    byWorkflow: JSON.parse(JSON.stringify(_state.byWorkflow)) as Record<
      string,
      DimensionCounters
    >,
    byProvider: JSON.parse(JSON.stringify(_state.byProvider)) as Record<
      string,
      DimensionCounters
    >,
    lastResetAt: _state.lastResetAt.toISOString(),
  };
}

// ── Audit event logging ───────────────────────────────────────────────────────

/**
 * Persists a structured audit record to `ai_audit_events` for every
 * user-triggered AI action.
 *
 * Privacy guarantees:
 * - Only safe metadata is written (workflow type, entity ID, outcome, provider,
 *   duration, retry count, HTTP status, safe error description).
 * - User IDs are stored as FK references only — no names, emails, or other
 *   PII fields are written.
 * - `safeErrorMessage` must be pre-sanitised by the caller; this function
 *   does NOT perform additional redaction.
 *
 * Failures are silently swallowed so a database error never impacts the
 * in-flight AI request (same pattern as `logAiSafetyEvent` and `logAiRequest`).
 *
 * @param record - Safe operational metadata for the completed AI action.
 */
export async function logAiAuditEvent(record: AiRequestRecord): Promise<void> {
  try {
    const db = getDatabase();
    await db.run(
      `INSERT INTO ai_audit_events
         (user_id, workflow_type, entity_id, provider, duration_ms, outcome,
          http_status, safe_error_message, retry_count, occurred_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())`,
      [
        record.userId ?? null,
        record.workflowType,
        record.entityId,
        record.provider,
        record.durationMs,
        record.outcome,
        record.httpStatus ?? null,
        record.safeErrorMessage ?? null,
        record.retryCount ?? 0,
      ],
    );
  } catch {
    // Best-effort: do not propagate database errors to the caller.
  }
}

// ── Health signal helpers ─────────────────────────────────────────────────────

/**
 * Returns a simple health signal string based on the current success ratio.
 *
 * Thresholds:
 * - `"healthy"` — success rate ≥ 90 % (or no requests yet)
 * - `"degraded"` — success rate ≥ 50 %
 * - `"unhealthy"` — success rate < 50 %
 */
export function computeAiHealthSignal(snapshot: AiMetricsSnapshot): 'healthy' | 'degraded' | 'unhealthy' {
  const { total, success } = snapshot.counters;
  if (total === 0) return 'healthy';
  const ratio = success / total;
  if (ratio >= 0.9) return 'healthy';
  if (ratio >= 0.5) return 'degraded';
  return 'unhealthy';
}

/**
 * Derives a safe, structured error description from an AI provider error.
 *
 * Strips stack traces, credentials, and any free-text that might contain PII.
 * Returns a string safe to pass as `safeErrorMessage` in `AiRequestRecord`.
 *
 * @param err      - The caught error (any type at runtime).
 * @param provider - The AI provider name for contextual labelling.
 */
export function buildSafeErrorMessage(err: unknown, provider: string): string {
  if (err instanceof Error) {
    const msg = err.message;

    if (/rate.?limit|429|too many requests/i.test(msg)) {
      return `rate limited by ${provider} provider`;
    }
    if (/timeout|timed out/i.test(msg)) {
      return `request timed out on ${provider} provider`;
    }
    if (/unauthorized|401|403|forbidden/i.test(msg)) {
      return `authentication error on ${provider} provider`;
    }
    if (/5[0-9]{2}|server error|internal error/i.test(msg)) {
      return `server error from ${provider} provider`;
    }
    if (/network|econnrefused|enotfound|getaddrinfo/i.test(msg)) {
      return `network error reaching ${provider} provider`;
    }
    // Fallback: emit a safe generic message, never the raw error text.
    return `provider error on ${provider} workflow`;
  }
  return `unknown error on ${provider} provider`;
}

/**
 * Derives the `AiRequestOutcome` from an HTTP status code returned by a
 * provider, or from a caught error when no HTTP status is available.
 *
 * @param httpStatus - HTTP status from the provider response (optional).
 * @param err        - Caught error, used when `httpStatus` is absent.
 */
export function classifyAiOutcome(
  httpStatus: number | undefined,
  err: unknown,
): AiRequestOutcome {
  if (httpStatus !== undefined) {
    if (httpStatus === 429) return 'rate_limited';
    if (httpStatus >= 200 && httpStatus < 300) return 'success';
    return 'failure';
  }
  if (err instanceof Error) {
    if (/timeout|timed out/i.test(err.message)) return 'timed_out';
    if (/rate.?limit|429/i.test(err.message)) return 'rate_limited';
  }
  return 'failure';
}
