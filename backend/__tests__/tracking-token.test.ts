/**
 * Tracking token unit tests — covers HMAC verification, replay-style mutation,
 * and target-URL safety checks for #465 and #466.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import {
  buildClickToken,
  buildOpenToken,
  isSafeRedirectTarget,
  verifyTrackingToken,
} from '../src/utils/tracking-token';

beforeEach(() => {
  process.env.TRACKING_TOKEN_SECRET = 'test-secret-do-not-use-in-prod';
});

describe('tracking-token', () => {
  describe('open tokens', () => {
    it('round-trips a valid open token', () => {
      const token = buildOpenToken(42);
      const verified = verifyTrackingToken(token);
      expect(verified).toEqual({ kind: 'open', communicationLogId: 42 });
    });

    it('rejects a tampered open token', () => {
      const token = buildOpenToken(42);
      // Flip the final character of the signature.
      const tampered = token.slice(0, -1) + (token.endsWith('A') ? 'B' : 'A');
      expect(verifyTrackingToken(tampered)).toBeNull();
    });

    it('rejects an open token with a swapped payload', () => {
      const token = buildOpenToken(42);
      const otherPayload = buildOpenToken(43).split('.')[1];
      const parts = token.split('.');
      parts[1] = otherPayload;
      expect(verifyTrackingToken(parts.join('.'))).toBeNull();
    });
  });

  describe('click tokens', () => {
    it('round-trips a valid click token', () => {
      const token = buildClickToken(7, 'https://example.com/abc?x=1');
      const verified = verifyTrackingToken(token);
      expect(verified).toEqual({
        kind: 'click',
        communicationLogId: 7,
        targetUrl: 'https://example.com/abc?x=1',
      });
    });

    it('rejects a tampered click token', () => {
      const token = buildClickToken(7, 'https://example.com');
      const tampered = token.slice(0, -2) + 'aa';
      expect(verifyTrackingToken(tampered)).toBeNull();
    });

    it('rejects a malformed token shape', () => {
      expect(verifyTrackingToken('not.a.valid.token')).toBeNull();
      expect(verifyTrackingToken('only-one-segment')).toBeNull();
      expect(verifyTrackingToken('')).toBeNull();
    });

    it('rejects a click token with a non-http(s) target', () => {
      // The verifier itself does not enforce the protocol — that's
      // isSafeRedirectTarget's job. Confirm the helper rejects unsafe schemes.
      expect(isSafeRedirectTarget('javascript:alert(1)')).toBe(false);
      expect(isSafeRedirectTarget('data:text/html,<script>')).toBe(false);
      expect(isSafeRedirectTarget('/relative/path')).toBe(false);
      expect(isSafeRedirectTarget('https://example.com')).toBe(true);
      expect(isSafeRedirectTarget('http://localhost:3000/x')).toBe(true);
    });
  });

  describe('secret rotation', () => {
    it('a token signed with one secret fails to verify under another', () => {
      const token = buildOpenToken(99);
      process.env.TRACKING_TOKEN_SECRET = 'a-different-secret';
      expect(verifyTrackingToken(token)).toBeNull();
    });
  });
});
