/**
 * Tests: AI Performance and Reliability SLOs — Issue #962
 *
 * Covers the `ai-slo` module in full:
 *
 * evaluateAiSlos
 * - Returns allCompliant true when all metrics are within targets
 * - Returns allCompliant false when success rate is below target
 * - Returns allCompliant false when rate-limit ratio exceeds threshold
 * - Returns allCompliant false when timeout ratio exceeds threshold
 * - Handles zero total requests (no SLO violations)
 * - Produces a check entry for each SLO dimension (success-rate, rate-limit-ratio, timeout-ratio)
 * - Sets evaluatedAt to a current ISO timestamp
 *
 * computeRetryBackoffMs
 * - Returns base delay for first retry attempt
 * - Doubles delay for second retry attempt (exponential back-off)
 * - Caps delay at AI_RETRY_BACKOFF_MAX_MS
 */

import { describe, expect, it } from 'vitest';
import {
  evaluateAiSlos,
  computeRetryBackoffMs,
  AI_SLO_SUCCESS_RATE_TARGET,
  AI_SLO_RATE_LIMIT_ALERT_RATIO,
  AI_RETRY_BACKOFF_BASE_MS,
  AI_RETRY_BACKOFF_MAX_MS,
  AI_SLO_LATENCY_P50_MS,
  AI_SLO_LATENCY_P90_MS,
  AI_SLO_LATENCY_P99_MS,
  AI_REQUEST_TIMEOUT_MS,
  AI_RETRY_MAX_ATTEMPTS,
  AI_RATE_LIMIT_BACKOFF_MS,
} from '../src/lib/ai-slo.js';

// ── evaluateAiSlos ────────────────────────────────────────────────────────────

describe('evaluateAiSlos', () => {
  it('returns allCompliant true when all metrics are within SLO targets', () => {
    const result = evaluateAiSlos(100, 96, 2, 2);
    expect(result.allCompliant).toBe(true);
    expect(result.checks).toHaveLength(3);
    expect(result.checks.every((c) => c.compliant)).toBe(true);
  });

  it('returns allCompliant false when success rate is below target', () => {
    // 90 out of 100 = 90%, below 95% target
    const result = evaluateAiSlos(100, 90, 3, 2);
    expect(result.allCompliant).toBe(false);
    const successCheck = result.checks.find((c) => c.slo === 'success-rate');
    expect(successCheck).toBeDefined();
    expect(successCheck!.compliant).toBe(false);
    expect(successCheck!.target).toBe(AI_SLO_SUCCESS_RATE_TARGET);
    expect(successCheck!.measured).toBeCloseTo(0.9);
  });

  it('returns allCompliant false when rate-limit ratio exceeds threshold', () => {
    // 15 rate-limited out of 100 = 15%, exceeds 10% threshold
    const result = evaluateAiSlos(100, 95, 15, 0);
    expect(result.allCompliant).toBe(false);
    const rateLimitCheck = result.checks.find((c) => c.slo === 'rate-limit-ratio');
    expect(rateLimitCheck).toBeDefined();
    expect(rateLimitCheck!.compliant).toBe(false);
    expect(rateLimitCheck!.target).toBe(AI_SLO_RATE_LIMIT_ALERT_RATIO);
    expect(rateLimitCheck!.measured).toBeCloseTo(0.15);
  });

  it('returns allCompliant false when timeout ratio exceeds threshold', () => {
    // 6 timed out out of 100 = 6%, exceeds 5% threshold
    const result = evaluateAiSlos(100, 94, 0, 6);
    expect(result.allCompliant).toBe(false);
    const timeoutCheck = result.checks.find((c) => c.slo === 'timeout-ratio');
    expect(timeoutCheck).toBeDefined();
    expect(timeoutCheck!.compliant).toBe(false);
    expect(timeoutCheck!.measured).toBeCloseTo(0.06);
  });

  it('returns allCompliant true when total is zero (no requests yet)', () => {
    const result = evaluateAiSlos(0, 0, 0, 0);
    expect(result.allCompliant).toBe(true);
    expect(result.checks.every((c) => c.compliant)).toBe(true);
  });

  it('produces exactly three check entries with correct slo names', () => {
    const result = evaluateAiSlos(100, 96, 2, 1);
    const names = result.checks.map((c) => c.slo);
    expect(names).toContain('success-rate');
    expect(names).toContain('rate-limit-ratio');
    expect(names).toContain('timeout-ratio');
    expect(names).toHaveLength(3);
  });

  it('sets evaluatedAt to a valid ISO timestamp', () => {
    const before = new Date().toISOString();
    const result = evaluateAiSlos(10, 10, 0, 0);
    const after = new Date().toISOString();
    expect(result.evaluatedAt >= before).toBe(true);
    expect(result.evaluatedAt <= after).toBe(true);
  });

  it('each check result includes target, measured, and message fields', () => {
    const result = evaluateAiSlos(100, 96, 2, 1);
    for (const check of result.checks) {
      expect(typeof check.target).toBe('number');
      expect(typeof check.measured).toBe('number');
      expect(typeof check.message).toBe('string');
      expect(check.message.length).toBeGreaterThan(0);
    }
  });
});

// ── computeRetryBackoffMs ─────────────────────────────────────────────────────

describe('computeRetryBackoffMs', () => {
  it('returns the base delay for the first retry attempt', () => {
    expect(computeRetryBackoffMs(1)).toBe(AI_RETRY_BACKOFF_BASE_MS);
  });

  it('doubles the delay for the second retry attempt', () => {
    expect(computeRetryBackoffMs(2)).toBe(AI_RETRY_BACKOFF_BASE_MS * 2);
  });

  it('caps the delay at AI_RETRY_BACKOFF_MAX_MS for large attempt numbers', () => {
    // At attempt 100 the uncapped value would be huge; must be capped.
    expect(computeRetryBackoffMs(100)).toBe(AI_RETRY_BACKOFF_MAX_MS);
  });

  it('never returns a value above AI_RETRY_BACKOFF_MAX_MS', () => {
    for (let attempt = 1; attempt <= 20; attempt++) {
      expect(computeRetryBackoffMs(attempt)).toBeLessThanOrEqual(AI_RETRY_BACKOFF_MAX_MS);
    }
  });
});

// ── SLO constant values ───────────────────────────────────────────────────────

describe('SLO constants', () => {
  it('latency targets are ordered p50 < p90 < p99', () => {
    expect(AI_SLO_LATENCY_P50_MS).toBeLessThan(AI_SLO_LATENCY_P90_MS);
    expect(AI_SLO_LATENCY_P90_MS).toBeLessThan(AI_SLO_LATENCY_P99_MS);
  });

  it('success rate target is between 0 and 1 exclusive', () => {
    expect(AI_SLO_SUCCESS_RATE_TARGET).toBeGreaterThan(0);
    expect(AI_SLO_SUCCESS_RATE_TARGET).toBeLessThan(1);
  });

  it('rate limit alert ratio is between 0 and 1 exclusive', () => {
    expect(AI_SLO_RATE_LIMIT_ALERT_RATIO).toBeGreaterThan(0);
    expect(AI_SLO_RATE_LIMIT_ALERT_RATIO).toBeLessThan(1);
  });

  it('request timeout is a positive number', () => {
    expect(AI_REQUEST_TIMEOUT_MS).toBeGreaterThan(0);
  });

  it('retry max attempts is a positive integer', () => {
    expect(Number.isInteger(AI_RETRY_MAX_ATTEMPTS)).toBe(true);
    expect(AI_RETRY_MAX_ATTEMPTS).toBeGreaterThan(0);
  });

  it('rate limit backoff is positive and greater than retry base backoff', () => {
    expect(AI_RATE_LIMIT_BACKOFF_MS).toBeGreaterThan(AI_RETRY_BACKOFF_BASE_MS);
  });
});
