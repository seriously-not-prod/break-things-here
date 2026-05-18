import crypto from 'crypto';
import type { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger.js';

/**
 * HMAC-SHA256 verification for the email-provider bounce webhook.
 *
 * The endpoint sits in front of an unauthenticated POST surface that can
 * deactivate user email delivery, so unsigned or forged requests must be
 * rejected outright. The provider is expected to:
 *
 *   1. Set an `X-Amz-Date` header to an ISO-8601 timestamp at request time.
 *   2. Compute HMAC-SHA256(`<X-Amz-Date>.<rawBody>`, EMAIL_WEBHOOK_SECRET).
 *   3. Send the lowercase-hex digest in `X-Amz-SNS-Signature`.
 *
 * We bind the timestamp into the signature so a captured valid request can't
 * be replayed indefinitely from logs / a compromised TLS-terminating proxy
 * / a previous test run. The window is ±5 minutes either side of server time.
 *
 * (We use the SES/SNS header names for ops familiarity even though the
 * algorithm is HMAC, not RSA — flip to RSA verification when switching
 * to native SNS subscription confirmation.)
 *
 * Hard requirements:
 *   - EMAIL_WEBHOOK_SECRET must be set; an unset secret means the endpoint
 *     is closed for business (401 on every call) rather than open.
 *   - The signature header must be present and a well-formed 64-hex SHA-256.
 *   - The date header must be present, parseable, and within ±5 minutes.
 *   - rawBody must have been captured upstream (express.json verify hook).
 *   - Comparison is constant-time to defeat timing attacks.
 */

const TIMESTAMP_SKEW_MS = 5 * 60 * 1000;

export function verifyEmailWebhookSignature(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const secret = process.env.EMAIL_WEBHOOK_SECRET;
  if (!secret) {
    logger.error(
      '[Webhook] EMAIL_WEBHOOK_SECRET is not set — rejecting bounce webhook request',
    );
    res.status(401).json({ error: 'Webhook signature verification not configured' });
    return;
  }

  const provided = req.header('X-Amz-SNS-Signature') ?? '';
  if (!provided) {
    res.status(401).json({ error: 'Missing signature' });
    return;
  }

  // Strict hex format guard. Buffer.from(str, 'hex') silently truncates at
  // the first non-hex character, so a malformed signature could otherwise
  // sneak past the length-equality check below as an empty/short Buffer.
  // SHA-256 in hex is always 64 characters.
  if (!/^[0-9a-fA-F]{64}$/.test(provided)) {
    res.status(401).json({ error: 'Invalid signature' });
    return;
  }

  const dateHeader = req.header('X-Amz-Date') ?? '';
  if (!dateHeader) {
    res.status(401).json({ error: 'Missing timestamp' });
    return;
  }
  const ts = Date.parse(dateHeader);
  if (Number.isNaN(ts)) {
    res.status(401).json({ error: 'Invalid timestamp' });
    return;
  }
  const skew = Math.abs(Date.now() - ts);
  if (skew > TIMESTAMP_SKEW_MS) {
    logger.warn('[Webhook] Bounce webhook timestamp outside skew window', {
      ip: req.ip,
      skewMs: skew,
    });
    res.status(401).json({ error: 'Stale or future-dated request' });
    return;
  }

  const raw = (req as Request & { rawBody?: Buffer }).rawBody;
  if (!raw || raw.length === 0) {
    res.status(401).json({ error: 'Missing request body' });
    return;
  }

  // Bind the timestamp into the HMAC input so replays of a captured request
  // outside the skew window can't reuse the original signature.
  const payload = Buffer.concat([Buffer.from(`${dateHeader}.`, 'utf8'), raw]);
  const expected = crypto.createHmac('sha256', secret).update(payload).digest('hex');

  let valid = false;
  try {
    const expectedBuf = Buffer.from(expected, 'hex');
    const providedBuf = Buffer.from(provided, 'hex');
    if (expectedBuf.length === providedBuf.length) {
      valid = crypto.timingSafeEqual(expectedBuf, providedBuf);
    }
  } catch {
    valid = false;
  }

  if (!valid) {
    logger.warn('[Webhook] Bounce webhook signature mismatch', {
      ip: req.ip,
      bodyLen: raw.length,
    });
    res.status(401).json({ error: 'Invalid signature' });
    return;
  }

  next();
}
