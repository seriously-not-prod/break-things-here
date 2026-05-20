import crypto from 'crypto';
import type { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger.js';

/**
 * HMAC-SHA256 verification for the email-provider bounce webhook.
 *
 * The endpoint sits in front of an unauthenticated POST surface that can
 * deactivate user email delivery, so unsigned or forged requests must be
 * rejected outright. The provider is expected to:
 *   1. Compute HMAC-SHA256(rawBody, EMAIL_WEBHOOK_SECRET).
 *   2. Send the lowercase-hex digest in the X-Amz-SNS-Signature header.
 *      (We use the SES/SNS header name for ops familiarity even though
 *      the algorithm is HMAC, not RSA — flip to RSA verification when
 *      switching to native SNS subscription confirmation.)
 *
 * Hard requirements:
 *   - EMAIL_WEBHOOK_SECRET must be set; an unset secret means the endpoint
 *     is closed for business (401 on every call) rather than open.
 *   - The signature header must be present.
 *   - Comparison is constant-time to defeat timing attacks.
 *   - rawBody must have been captured upstream (express.json verify hook).
 */
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

  const raw = (req as Request & { rawBody?: Buffer }).rawBody;
  if (!raw || raw.length === 0) {
    res.status(401).json({ error: 'Missing request body' });
    return;
  }

  const expected = crypto.createHmac('sha256', secret).update(raw).digest('hex');

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
