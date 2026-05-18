/**
 * Tracking-token utilities for the email open-pixel and click-redirect endpoints.
 *
 * Tokens are HMAC-signed so unauthenticated tracking endpoints cannot be
 * enumerated by guessing communication_log ids. The shared secret is sourced
 * from `TRACKING_TOKEN_SECRET` (set in production); we fall back to an
 * ephemeral per-startup secret to keep dev/test working without configuration.
 *
 * Token grammar (URL-safe):
 *   <kind>.<payload-b64url>.<sig-b64url>
 *
 *   kind        = "o" (open) | "c" (click)
 *   payload     = JSON for click ({ logId, url }), bare logId integer for open
 *   sig         = base64url( HMAC-SHA256( secret, kind + "." + payload ) )
 */

import { createHmac, randomBytes } from 'crypto';

let cachedSecret: string | null = null;
function getSecret(): string {
  const fromEnv = process.env.TRACKING_TOKEN_SECRET?.trim();
  if (fromEnv) return fromEnv;
  if (!cachedSecret) {
    cachedSecret = randomBytes(32).toString('hex');
    console.warn(
      '[SECURITY] TRACKING_TOKEN_SECRET not set — using ephemeral per-startup secret. ' +
        'Set TRACKING_TOKEN_SECRET to keep tracking links valid across restarts.',
    );
  }
  return cachedSecret;
}

function b64urlEncode(input: string | Buffer): string {
  const buf = typeof input === 'string' ? Buffer.from(input, 'utf8') : input;
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlDecode(input: string): string {
  const padded = input.replace(/-/g, '+').replace(/_/g, '/');
  const padLen = (4 - (padded.length % 4)) % 4;
  return Buffer.from(padded + '='.repeat(padLen), 'base64').toString('utf8');
}

function sign(kind: 'o' | 'c', payload: string): string {
  return b64urlEncode(createHmac('sha256', getSecret()).update(`${kind}.${payload}`).digest());
}

function constantTimeEquals(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function buildOpenToken(communicationLogId: number): string {
  const payload = b64urlEncode(String(communicationLogId));
  return `o.${payload}.${sign('o', payload)}`;
}

export function buildClickToken(communicationLogId: number, targetUrl: string): string {
  const payload = b64urlEncode(JSON.stringify({ logId: communicationLogId, url: targetUrl }));
  return `c.${payload}.${sign('c', payload)}`;
}

export interface VerifiedOpenToken {
  kind: 'open';
  communicationLogId: number;
}

export interface VerifiedClickToken {
  kind: 'click';
  communicationLogId: number;
  targetUrl: string;
}

export type VerifiedToken = VerifiedOpenToken | VerifiedClickToken;

/** Returns the parsed payload, or null if the token is malformed or fails HMAC. */
export function verifyTrackingToken(token: string): VerifiedToken | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [kind, payload, sig] = parts;
  if (kind !== 'o' && kind !== 'c') return null;

  const expected = sign(kind, payload);
  if (!constantTimeEquals(expected, sig)) return null;

  try {
    const decoded = b64urlDecode(payload);
    if (kind === 'o') {
      const id = Number(decoded);
      if (!Number.isInteger(id) || id <= 0) return null;
      return { kind: 'open', communicationLogId: id };
    }
    const obj = JSON.parse(decoded) as { logId?: unknown; url?: unknown };
    if (
      typeof obj.logId !== 'number' ||
      !Number.isInteger(obj.logId) ||
      obj.logId <= 0 ||
      typeof obj.url !== 'string' ||
      obj.url.length === 0
    ) {
      return null;
    }
    return { kind: 'click', communicationLogId: obj.logId, targetUrl: obj.url };
  } catch {
    return null;
  }
}

/**
 * Reject obviously-unsafe redirect targets. The click endpoint will only
 * forward to URLs that look absolute http(s) — no `javascript:`, no `data:`,
 * no relative paths that could resolve back to the tracking host.
 */
export function isSafeRedirectTarget(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}
