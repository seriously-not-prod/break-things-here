/**
 * Tracking endpoints for email open and click events (#465, #466).
 *
 * Both endpoints are intentionally **unauthenticated** because they are fired
 * by recipient mail clients and ad-hoc browsers. Replay-safety and authorization
 * are enforced by HMAC-signed tokens (see ../utils/tracking-token).
 *
 * Endpoints:
 *   GET /api/tracking/open/:token     – returns 1×1 transparent GIF, records open
 *   GET /api/tracking/click/:token    – records click, redirects to embedded URL
 *
 * Privacy notes:
 *   - Tokens carry only a numeric communication_log id (open) or that id plus
 *     the destination URL (click). No PII is encoded.
 *   - Failed token verification yields a generic 1×1 pixel / 404 — we never
 *     leak validation details that would help an attacker enumerate ids.
 */

import { Request, Response } from 'express';
import { getDatabase } from '../db/database.js';
import { verifyTrackingToken } from '../utils/tracking-token.js';

/**
 * Parse and re-serialize a redirect target so the value handed to
 * `res.redirect()` is the URL parser's own output rather than a raw token-
 * carried string. Returns null for unparseable input, non-http(s) schemes,
 * or empty hostnames (the URL parser otherwise accepts oddities like
 * `https://`).
 *
 * This restructure also acts as a CodeQL-recognized sanitizer for the
 * js/server-side-unvalidated-url-redirection rule on the click endpoint —
 * the URL is provably authored by an authenticated event organizer at email
 * send time (HMAC-signed token), but the dataflow analyzer cannot see that
 * across the signature check, so we additionally normalize through URL().
 */
function safeRedirectTarget(raw: string): string | null {
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    if (!parsed.hostname) return null;
    return parsed.href;
  } catch {
    return null;
  }
}

// Smallest valid GIF — a single transparent pixel.
const TRANSPARENT_GIF = Buffer.from(
  'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
  'base64',
);

function sendPixel(res: Response): void {
  res.set({
    'Content-Type': 'image/gif',
    'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
    Pragma: 'no-cache',
  });
  res.status(200).send(TRANSPARENT_GIF);
}

function clientIp(req: Request): string | null {
  const fwd = req.headers['x-forwarded-for'];
  if (typeof fwd === 'string' && fwd.length > 0) return fwd.split(',')[0]?.trim() ?? null;
  return req.ip ?? req.socket?.remoteAddress ?? null;
}

function clientUa(req: Request): string | null {
  const ua = req.headers['user-agent'];
  return typeof ua === 'string' && ua.length > 0 ? ua.slice(0, 1024) : null;
}

async function recordEvent(
  communicationLogId: number,
  eventType: 'open' | 'click',
  targetUrl: string | null,
  ip: string | null,
  ua: string | null,
): Promise<void> {
  const db = getDatabase();
  // The communication_log row may have been deleted (cascading via event delete);
  // in that case we silently no-op — `ON DELETE CASCADE` will discard the
  // tracking row anyway, but the immediate insert would 23503 here.
  try {
    await db.run(
      `INSERT INTO communication_tracking_events
         (communication_log_id, event_type, target_url, ip_address, user_agent)
       VALUES (?, ?, ?, ?, ?)`,
      [communicationLogId, eventType, targetUrl, ip, ua],
    );
  } catch (err) {
    // Don't throw — tracking failures must never break the client experience.
    console.warn('tracking-controller: failed to record event', err);
  }
}

/** GET /api/tracking/open/:token */
export async function recordOpen(req: Request, res: Response): Promise<void> {
  const verified = verifyTrackingToken(req.params.token ?? '');
  if (verified && verified.kind === 'open') {
    await recordEvent(verified.communicationLogId, 'open', null, clientIp(req), clientUa(req));
  }
  // Always return the pixel — we never want to surface validation failures
  // to a recipient's mail client.
  sendPixel(res);
}

/** GET /api/tracking/click/:token */
export async function recordClick(req: Request, res: Response): Promise<void> {
  const verified = verifyTrackingToken(req.params.token ?? '');
  if (!verified || verified.kind !== 'click') {
    res.status(404).send('Link not found.');
    return;
  }
  const target = safeRedirectTarget(verified.targetUrl);
  if (!target) {
    res.status(404).send('Link not found.');
    return;
  }
  await recordEvent(
    verified.communicationLogId,
    'click',
    target,
    clientIp(req),
    clientUa(req),
  );
  res.redirect(302, target);
}
