/**
 * Tests: AI Observability and Audit Events — Issue #958
 *
 * Covers the `ai-observability` module in full:
 *
 * recordAiRequestMetrics
 * - Increments global success counter on success outcome
 * - Increments global failure counter on failure outcome
 * - Increments global rateLimited counter on rate_limited outcome
 * - Increments global timedOut counter on timed_out outcome
 * - Accumulates latency correctly (totalMs, minMs, maxMs, avgMs)
 * - Records per-workflow breakdown counters
 * - Records per-provider breakdown counters
 * - Defaults provider key to "unknown" when provider is empty
 *
 * resetAiMetrics
 * - Resets all counters and latency stats to zero
 * - Updates lastResetAt timestamp
 *
 * getAiMetricsSnapshot
 * - Returns zeroed snapshot when no requests have been recorded
 * - Returns correct counters after mixed outcomes
 * - Returns deep copy (mutations do not affect internal state)
 * - Computes avgMs, minMs, maxMs correctly
 *
 * computeAiHealthSignal
 * - Returns "healthy" when no requests have been recorded
 * - Returns "healthy" when success rate >= 90%
 * - Returns "degraded" when success rate is between 50% and 90%
 * - Returns "unhealthy" when success rate < 50%
 *
 * buildSafeErrorMessage
 * - Identifies rate-limit errors
 * - Identifies timeout errors
 * - Identifies auth errors
 * - Identifies server errors
 * - Identifies network errors
 * - Returns generic fallback for unrecognised Error messages
 * - Returns generic fallback for non-Error values
 *
 * classifyAiOutcome
 * - Returns "success" for 2xx HTTP status
 * - Returns "rate_limited" for HTTP 429
 * - Returns "failure" for other HTTP error statuses
 * - Returns "timed_out" when no httpStatus and error message contains "timed out"
 * - Returns "rate_limited" when no httpStatus and error message contains "rate limit"
 * - Returns "failure" for generic Error without httpStatus
 *
 * logAiAuditEvent
 * - Calls db.run with the correct SQL and parameters
 * - Swallows database errors without propagating
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  recordAiRequestMetrics,
  resetAiMetrics,
  getAiMetricsSnapshot,
  computeAiHealthSignal,
  buildSafeErrorMessage,
  classifyAiOutcome,
  logAiAuditEvent,
  type AiRequestRecord,
} from '../src/lib/ai-observability.js';

// ── Mock the database module ──────────────────────────────────────────────────

vi.mock('../src/db/database.js', () => ({
  getDatabase: vi.fn(),
}));

import { getDatabase } from '../src/db/database.js';
const mockGetDatabase = vi.mocked(getDatabase);

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeRecord(overrides: Partial<AiRequestRecord> = {}): AiRequestRecord {
  return {
    userId: 1,
    workflowType: 'grounded',
    entityId: 42,
    provider: 'azure',
    durationMs: 300,
    outcome: 'success',
    ...overrides,
  };
}

// ── recordAiRequestMetrics ────────────────────────────────────────────────────

describe('recordAiRequestMetrics', () => {
  beforeEach(() => resetAiMetrics());

  it('increments global success counter on success outcome', () => {
    recordAiRequestMetrics(makeRecord({ outcome: 'success' }));
    const snap = getAiMetricsSnapshot();
    expect(snap.counters.success).toBe(1);
    expect(snap.counters.total).toBe(1);
  });

  it('increments global failure counter on failure outcome', () => {
    recordAiRequestMetrics(makeRecord({ outcome: 'failure' }));
    const snap = getAiMetricsSnapshot();
    expect(snap.counters.failure).toBe(1);
    expect(snap.counters.total).toBe(1);
  });

  it('increments global rateLimited counter on rate_limited outcome', () => {
    recordAiRequestMetrics(makeRecord({ outcome: 'rate_limited' }));
    const snap = getAiMetricsSnapshot();
    expect(snap.counters.rateLimited).toBe(1);
    expect(snap.counters.total).toBe(1);
  });

  it('increments global timedOut counter on timed_out outcome', () => {
    recordAiRequestMetrics(makeRecord({ outcome: 'timed_out' }));
    const snap = getAiMetricsSnapshot();
    expect(snap.counters.timedOut).toBe(1);
    expect(snap.counters.total).toBe(1);
  });

  it('accumulates latency correctly across multiple requests', () => {
    recordAiRequestMetrics(makeRecord({ durationMs: 100 }));
    recordAiRequestMetrics(makeRecord({ durationMs: 200 }));
    recordAiRequestMetrics(makeRecord({ durationMs: 300 }));
    const snap = getAiMetricsSnapshot();
    expect(snap.latency.totalMs).toBe(600);
    expect(snap.latency.minMs).toBe(100);
    expect(snap.latency.maxMs).toBe(300);
    expect(snap.latency.avgMs).toBe(200);
  });

  it('records per-workflow breakdown counters', () => {
    recordAiRequestMetrics(makeRecord({ workflowType: 'budget-insight', outcome: 'success' }));
    recordAiRequestMetrics(makeRecord({ workflowType: 'budget-insight', outcome: 'failure' }));
    recordAiRequestMetrics(makeRecord({ workflowType: 'grounded', outcome: 'success' }));
    const snap = getAiMetricsSnapshot();
    expect(snap.byWorkflow['budget-insight']?.total).toBe(2);
    expect(snap.byWorkflow['budget-insight']?.success).toBe(1);
    expect(snap.byWorkflow['budget-insight']?.failure).toBe(1);
    expect(snap.byWorkflow['grounded']?.total).toBe(1);
  });

  it('records per-provider breakdown counters', () => {
    recordAiRequestMetrics(makeRecord({ provider: 'azure', outcome: 'success' }));
    recordAiRequestMetrics(makeRecord({ provider: 'openai', outcome: 'failure' }));
    const snap = getAiMetricsSnapshot();
    expect(snap.byProvider['azure']?.success).toBe(1);
    expect(snap.byProvider['openai']?.failure).toBe(1);
  });

  it('defaults provider key to "unknown" when provider is empty string', () => {
    recordAiRequestMetrics(makeRecord({ provider: '' }));
    const snap = getAiMetricsSnapshot();
    expect(snap.byProvider['unknown']).toBeDefined();
    expect(snap.byProvider['unknown']?.total).toBe(1);
  });
});

// ── resetAiMetrics ────────────────────────────────────────────────────────────

describe('resetAiMetrics', () => {
  it('resets all counters and latency stats to zero', () => {
    recordAiRequestMetrics(makeRecord({ durationMs: 500, outcome: 'failure' }));
    resetAiMetrics();
    const snap = getAiMetricsSnapshot();
    expect(snap.counters.total).toBe(0);
    expect(snap.counters.success).toBe(0);
    expect(snap.counters.failure).toBe(0);
    expect(snap.counters.rateLimited).toBe(0);
    expect(snap.counters.timedOut).toBe(0);
    expect(snap.latency.totalMs).toBe(0);
    expect(snap.latency.minMs).toBe(0);
    expect(snap.latency.maxMs).toBe(0);
    expect(snap.latency.avgMs).toBe(0);
  });

  it('updates lastResetAt to approximately now', () => {
    const before = new Date();
    resetAiMetrics();
    const snap = getAiMetricsSnapshot();
    const after = new Date();
    const resetAt = new Date(snap.lastResetAt);
    expect(resetAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
    expect(resetAt.getTime()).toBeLessThanOrEqual(after.getTime());
  });
});

// ── getAiMetricsSnapshot ──────────────────────────────────────────────────────

describe('getAiMetricsSnapshot', () => {
  beforeEach(() => resetAiMetrics());

  it('returns zeroed snapshot when no requests have been recorded', () => {
    const snap = getAiMetricsSnapshot();
    expect(snap.counters.total).toBe(0);
    expect(snap.latency.avgMs).toBe(0);
    expect(snap.latency.minMs).toBe(0);
    expect(Object.keys(snap.byWorkflow)).toHaveLength(0);
    expect(Object.keys(snap.byProvider)).toHaveLength(0);
  });

  it('returns correct counters after mixed outcomes', () => {
    recordAiRequestMetrics(makeRecord({ outcome: 'success' }));
    recordAiRequestMetrics(makeRecord({ outcome: 'failure' }));
    recordAiRequestMetrics(makeRecord({ outcome: 'rate_limited' }));
    const snap = getAiMetricsSnapshot();
    expect(snap.counters).toEqual({
      total: 3,
      success: 1,
      failure: 1,
      rateLimited: 1,
      timedOut: 0,
    });
  });

  it('returns a deep copy so mutations do not affect internal state', () => {
    recordAiRequestMetrics(makeRecord());
    const snap = getAiMetricsSnapshot();
    snap.counters.total = 9999;
    snap.byWorkflow['grounded']!.total = 9999;
    const snap2 = getAiMetricsSnapshot();
    expect(snap2.counters.total).toBe(1);
    expect(snap2.byWorkflow['grounded']?.total).toBe(1);
  });
});

// ── computeAiHealthSignal ─────────────────────────────────────────────────────

describe('computeAiHealthSignal', () => {
  beforeEach(() => resetAiMetrics());

  it('returns "healthy" when no requests have been recorded', () => {
    const snap = getAiMetricsSnapshot();
    expect(computeAiHealthSignal(snap)).toBe('healthy');
  });

  it('returns "healthy" when success rate is exactly 90%', () => {
    for (let i = 0; i < 9; i++) recordAiRequestMetrics(makeRecord({ outcome: 'success' }));
    recordAiRequestMetrics(makeRecord({ outcome: 'failure' }));
    const snap = getAiMetricsSnapshot();
    expect(computeAiHealthSignal(snap)).toBe('healthy');
  });

  it('returns "healthy" when success rate is 100%', () => {
    recordAiRequestMetrics(makeRecord({ outcome: 'success' }));
    const snap = getAiMetricsSnapshot();
    expect(computeAiHealthSignal(snap)).toBe('healthy');
  });

  it('returns "degraded" when success rate is between 50% and 90%', () => {
    for (let i = 0; i < 7; i++) recordAiRequestMetrics(makeRecord({ outcome: 'success' }));
    for (let i = 0; i < 3; i++) recordAiRequestMetrics(makeRecord({ outcome: 'failure' }));
    const snap = getAiMetricsSnapshot();
    expect(computeAiHealthSignal(snap)).toBe('degraded');
  });

  it('returns "unhealthy" when success rate is below 50%', () => {
    for (let i = 0; i < 3; i++) recordAiRequestMetrics(makeRecord({ outcome: 'success' }));
    for (let i = 0; i < 7; i++) recordAiRequestMetrics(makeRecord({ outcome: 'failure' }));
    const snap = getAiMetricsSnapshot();
    expect(computeAiHealthSignal(snap)).toBe('unhealthy');
  });
});

// ── buildSafeErrorMessage ─────────────────────────────────────────────────────

describe('buildSafeErrorMessage', () => {
  it('identifies rate-limit errors', () => {
    expect(buildSafeErrorMessage(new Error('Rate limit exceeded (429)'), 'azure')).toMatch(
      /rate limited/i,
    );
  });

  it('identifies timeout errors', () => {
    expect(buildSafeErrorMessage(new Error('request timed out after 30000ms'), 'azure')).toMatch(
      /timed out/i,
    );
  });

  it('identifies auth errors (401)', () => {
    expect(buildSafeErrorMessage(new Error('401 Unauthorized'), 'openai')).toMatch(
      /authentication error/i,
    );
  });

  it('identifies server errors (500)', () => {
    expect(buildSafeErrorMessage(new Error('500 Internal Server Error'), 'azure')).toMatch(
      /server error/i,
    );
  });

  it('identifies network errors', () => {
    expect(buildSafeErrorMessage(new Error('ECONNREFUSED'), 'azure')).toMatch(/network error/i);
  });

  it('returns generic fallback for unrecognised Error messages', () => {
    const result = buildSafeErrorMessage(new Error('some obscure internal detail'), 'azure');
    expect(result).toMatch(/provider error/i);
    expect(result).not.toContain('obscure internal detail');
  });

  it('returns generic fallback for non-Error values', () => {
    expect(buildSafeErrorMessage('string error', 'azure')).toMatch(/unknown error/i);
    expect(buildSafeErrorMessage(null, 'azure')).toMatch(/unknown error/i);
    expect(buildSafeErrorMessage(undefined, 'azure')).toMatch(/unknown error/i);
  });
});

// ── classifyAiOutcome ─────────────────────────────────────────────────────────

describe('classifyAiOutcome', () => {
  it('returns "success" for HTTP 200', () => {
    expect(classifyAiOutcome(200, undefined)).toBe('success');
  });

  it('returns "success" for HTTP 201', () => {
    expect(classifyAiOutcome(201, undefined)).toBe('success');
  });

  it('returns "rate_limited" for HTTP 429', () => {
    expect(classifyAiOutcome(429, undefined)).toBe('rate_limited');
  });

  it('returns "failure" for other HTTP error status codes', () => {
    expect(classifyAiOutcome(500, undefined)).toBe('failure');
    expect(classifyAiOutcome(503, undefined)).toBe('failure');
    expect(classifyAiOutcome(400, undefined)).toBe('failure');
  });

  it('returns "timed_out" when no httpStatus and error message contains "timed out"', () => {
    expect(classifyAiOutcome(undefined, new Error('timed out after 30s'))).toBe('timed_out');
  });

  it('returns "rate_limited" when no httpStatus and error contains "rate limit"', () => {
    expect(classifyAiOutcome(undefined, new Error('rate limit hit'))).toBe('rate_limited');
  });

  it('returns "failure" for generic Error without httpStatus', () => {
    expect(classifyAiOutcome(undefined, new Error('something went wrong'))).toBe('failure');
  });

  it('returns "failure" for undefined error and no httpStatus', () => {
    expect(classifyAiOutcome(undefined, undefined)).toBe('failure');
  });
});

// ── logAiAuditEvent ───────────────────────────────────────────────────────────

describe('logAiAuditEvent', () => {
  const mockRun = vi.fn();

  beforeEach(() => {
    mockRun.mockReset();
    mockGetDatabase.mockReturnValue({ run: mockRun } as ReturnType<typeof getDatabase>);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('calls db.run with the correct SQL and parameters', async () => {
    mockRun.mockResolvedValue(undefined);
    const record: AiRequestRecord = {
      userId: 7,
      workflowType: 'grounded',
      entityId: 99,
      provider: 'azure',
      durationMs: 450,
      outcome: 'success',
      httpStatus: 200,
      safeErrorMessage: undefined,
      retryCount: 0,
    };
    await logAiAuditEvent(record);
    expect(mockRun).toHaveBeenCalledOnce();
    const [sql, params] = mockRun.mock.calls[0] as [string, unknown[]];
    expect(sql).toMatch(/INSERT INTO ai_audit_events/i);
    expect(params[0]).toBe(7);          // user_id
    expect(params[1]).toBe('grounded'); // workflow_type
    expect(params[2]).toBe(99);         // entity_id
    expect(params[3]).toBe('azure');    // provider
    expect(params[4]).toBe(450);        // duration_ms
    expect(params[5]).toBe('success');  // outcome
    expect(params[6]).toBe(200);        // http_status
    expect(params[7]).toBeNull();       // safe_error_message
    expect(params[8]).toBe(0);          // retry_count
  });

  it('uses null for userId when undefined', async () => {
    mockRun.mockResolvedValue(undefined);
    await logAiAuditEvent(makeRecord({ userId: undefined }));
    const [, params] = mockRun.mock.calls[0] as [string, unknown[]];
    expect(params[0]).toBeNull();
  });

  it('swallows database errors without propagating', async () => {
    mockRun.mockRejectedValue(new Error('DB connection lost'));
    await expect(logAiAuditEvent(makeRecord())).resolves.toBeUndefined();
  });
});
