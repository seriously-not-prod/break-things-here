/**
 * AI Performance and Reliability SLOs — Issue #962
 *
 * Single source of truth for all AI Service Level Objective targets, retry
 * policies, and alerting thresholds.  These constants are consumed by:
 *
 * - `ai-observability.ts`  — runtime SLO evaluation and health signals
 * - Alerting rules / monitoring dashboards (see docs/operations/ai-slos.md)
 * - Runbook response thresholds (see docs/operations/ai-runbook.md)
 *
 * ## Design principles
 * - All numeric values are named constants; no magic numbers in callers.
 * - SLO targets are aligned with the observability counters in #958.
 * - Retry and back-off values match the provider timeout in `ai-safety.ts`.
 */

// ── Latency SLOs ──────────────────────────────────────────────────────────────

/**
 * Target p50 end-to-end AI request latency (milliseconds).
 * Measured from the moment the backend dispatches the provider request until
 * the full response body is received and parsed.
 */
export const AI_SLO_LATENCY_P50_MS = 1_500;

/**
 * Target p90 end-to-end AI request latency (milliseconds).
 * Sustained breaches of this value indicate provider degradation or
 * unusually large prompts and should trigger a degraded-health signal.
 */
export const AI_SLO_LATENCY_P90_MS = 3_000;

/**
 * Target p99 end-to-end AI request latency (milliseconds).
 * Values above this threshold for more than 1 % of requests should trigger
 * a PagerDuty / alerting rule (see docs/operations/ai-slos.md §Alerts).
 */
export const AI_SLO_LATENCY_P99_MS = 8_000;

// ── Availability and Success-Rate SLOs ────────────────────────────────────────

/**
 * Target request success rate (0–1 fraction).
 * Over any rolling 100-request window, the ratio of successful AI responses
 * must not fall below this value.
 *
 * 0.95 = 95 % success rate SLO.
 */
export const AI_SLO_SUCCESS_RATE_TARGET = 0.95;

/**
 * Degraded-state success-rate threshold (0–1 fraction).
 * A success rate between this value and `AI_SLO_SUCCESS_RATE_TARGET` places
 * the AI subsystem into "degraded" status; callers may still proceed but
 * should surface a warning.
 *
 * 0.90 = 90 % threshold → degraded below 95 %, unhealthy below 90 %.
 */
export const AI_SLO_SUCCESS_RATE_DEGRADED_THRESHOLD = 0.9;

/**
 * Monthly AI endpoint availability target (0–1 fraction).
 * Captures the proportion of time the AI endpoint responds (with any outcome,
 * including graceful 503 "no provider configured") relative to total wall time.
 *
 * 0.999 = 99.9 % availability (~43 min downtime / month).
 */
export const AI_SLO_AVAILABILITY_TARGET = 0.999;

// ── Timeout Policy ────────────────────────────────────────────────────────────

/**
 * Hard wall-clock timeout for a single AI provider HTTP request (milliseconds).
 * If the provider does not return a complete response within this window the
 * request is aborted and classified as `timed_out`.
 *
 * Aligned with the `AI_PROVIDER_TIMEOUT_MS` constant in `ai-safety.ts`.
 */
export const AI_REQUEST_TIMEOUT_MS = 30_000;

// ── Retry Policy ──────────────────────────────────────────────────────────────

/**
 * Maximum number of automatic retry attempts after a transient failure
 * (network error, 5xx, or timeout).  Does NOT apply to 4xx errors, prompt
 * injection blocks, or deliberate 503 "no provider" responses.
 */
export const AI_RETRY_MAX_ATTEMPTS = 2;

/**
 * Base back-off delay before the first retry (milliseconds).
 * Subsequent retries use exponential back-off:
 *   delay = min(base * 2^(attempt-1), max)
 */
export const AI_RETRY_BACKOFF_BASE_MS = 500;

/**
 * Maximum back-off delay cap for any single retry (milliseconds).
 */
export const AI_RETRY_BACKOFF_MAX_MS = 5_000;

// ── Rate-Limit Policy ─────────────────────────────────────────────────────────

/**
 * Minimum cool-down period after receiving a 429 rate-limit response from a
 * provider before the next request is dispatched (milliseconds).
 * The back-off may be extended by a Retry-After header if present.
 */
export const AI_RATE_LIMIT_BACKOFF_MS = 60_000;

/**
 * Alert threshold for the rate-limited counter within the evaluation window.
 * If the ratio of rate-limited requests exceeds this fraction an alert fires.
 *
 * 0.10 = alert when > 10 % of requests in the window are rate-limited.
 */
export const AI_SLO_RATE_LIMIT_ALERT_RATIO = 0.1;

// ── SLO Evaluation Window ─────────────────────────────────────────────────────

/**
 * Rolling request count over which success-rate and rate-limit SLOs are
 * evaluated.  The in-memory counters in `ai-observability.ts` accumulate
 * since the last process restart; this window is applied as a minimum sample
 * size before SLO compliance is considered meaningful.
 */
export const AI_SLO_MIN_SAMPLE_WINDOW = 100;

// ── SLO Evaluation Helpers ────────────────────────────────────────────────────

/**
 * Describes the result of a single SLO compliance check.
 */
export interface SloCheckResult {
  /** Name of the SLO that was evaluated. */
  slo: string;
  /** Whether the measured value meets the target. */
  compliant: boolean;
  /** The target value for the SLO. */
  target: number;
  /** The measured value at evaluation time. */
  measured: number;
  /** Human-readable description of the check outcome. */
  message: string;
}

/**
 * Aggregated result of all SLO checks for a metrics snapshot.
 */
export interface SloEvaluationResult {
  /** `true` only when every individual SLO is compliant. */
  allCompliant: boolean;
  /** Individual check results, one per SLO dimension. */
  checks: SloCheckResult[];
  /** ISO timestamp when the evaluation was run. */
  evaluatedAt: string;
}

/**
 * Evaluates success-rate and rate-limit SLOs against the provided counter
 * values.  Latency percentile evaluation is intentionally omitted here
 * because the in-memory store tracks only min/avg/max, not a full histogram;
 * see `docs/operations/ai-slos.md §Latency` for measurement guidance.
 *
 * @param total       - Total requests in the observation window.
 * @param success     - Count of successful requests.
 * @param rateLimited - Count of rate-limited requests.
 * @param timedOut    - Count of timed-out requests.
 */
export function evaluateAiSlos(
  total: number,
  success: number,
  rateLimited: number,
  timedOut: number,
): SloEvaluationResult {
  const checks: SloCheckResult[] = [];

  // ── Success-rate SLO ────────────────────────────────────────────────────
  const successRate = total > 0 ? success / total : 1;
  checks.push({
    slo: 'success-rate',
    compliant: successRate >= AI_SLO_SUCCESS_RATE_TARGET,
    target: AI_SLO_SUCCESS_RATE_TARGET,
    measured: successRate,
    message:
      successRate >= AI_SLO_SUCCESS_RATE_TARGET
        ? `Success rate ${(successRate * 100).toFixed(1)} % meets the ${AI_SLO_SUCCESS_RATE_TARGET * 100} % target`
        : `Success rate ${(successRate * 100).toFixed(1)} % is below the ${AI_SLO_SUCCESS_RATE_TARGET * 100} % target`,
  });

  // ── Rate-limit SLO ──────────────────────────────────────────────────────
  const rateLimitRatio = total > 0 ? rateLimited / total : 0;
  checks.push({
    slo: 'rate-limit-ratio',
    compliant: rateLimitRatio <= AI_SLO_RATE_LIMIT_ALERT_RATIO,
    target: AI_SLO_RATE_LIMIT_ALERT_RATIO,
    measured: rateLimitRatio,
    message:
      rateLimitRatio <= AI_SLO_RATE_LIMIT_ALERT_RATIO
        ? `Rate-limit ratio ${(rateLimitRatio * 100).toFixed(1)} % is within the ${AI_SLO_RATE_LIMIT_ALERT_RATIO * 100} % threshold`
        : `Rate-limit ratio ${(rateLimitRatio * 100).toFixed(1)} % exceeds the ${AI_SLO_RATE_LIMIT_ALERT_RATIO * 100} % threshold`,
  });

  // ── Timeout SLO ─────────────────────────────────────────────────────────
  const timeoutRatio = total > 0 ? timedOut / total : 0;
  const timeoutAlertRatio = 0.05; // alert when > 5 % of requests time out
  checks.push({
    slo: 'timeout-ratio',
    compliant: timeoutRatio <= timeoutAlertRatio,
    target: timeoutAlertRatio,
    measured: timeoutRatio,
    message:
      timeoutRatio <= timeoutAlertRatio
        ? `Timeout ratio ${(timeoutRatio * 100).toFixed(1)} % is within the ${timeoutAlertRatio * 100} % threshold`
        : `Timeout ratio ${(timeoutRatio * 100).toFixed(1)} % exceeds the ${timeoutAlertRatio * 100} % threshold`,
  });

  const allCompliant = checks.every((c) => c.compliant);

  return {
    allCompliant,
    checks,
    evaluatedAt: new Date().toISOString(),
  };
}

/**
 * Computes the exponential back-off delay for a given retry attempt.
 *
 * @param attempt - 1-based attempt number (1 = first retry).
 * @returns Delay in milliseconds, capped at `AI_RETRY_BACKOFF_MAX_MS`.
 */
export function computeRetryBackoffMs(attempt: number): number {
  const delay = AI_RETRY_BACKOFF_BASE_MS * Math.pow(2, attempt - 1);
  return Math.min(delay, AI_RETRY_BACKOFF_MAX_MS);
}
