import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { inMemoryUserStore, UserStore } from './userStore';
import {
  generatePasswordResetToken,
  consumePasswordResetToken,
  PasswordResetTokenError,
} from '../../utils/password-reset-token';
import { revokeAllUserTokens } from '../../utils/session';
import { validatePassword } from '../../utils/validation';

const SALT_ROUNDS = 12;

/** Audit log severity levels */
type AuditAction = 'REQUEST_RESET' | 'RESET_COMPLETE' | 'RESET_FAILED';

/** Immutable audit log entry */
interface AuditEntry {
  readonly timestamp: Date;
  readonly action: AuditAction;
  readonly email: string;
  readonly reason?: string;
}

/** In-memory audit log — swap for a structured logging service in production */
const auditLog: AuditEntry[] = [];

/** Read-only view of the audit log — accessible for testing and monitoring */
export function getAuditLog(): Readonly<AuditEntry[]> {
  return auditLog;
}

/** Clear the audit log — intended for use in tests only */
export function clearAuditLog(): void {
  auditLog.length = 0;
}

// ── Rate limiting ────────────────────────────────────────────────────────────

/** Maximum reset requests per window per email */
const MAX_RESETS_PER_WINDOW = 3;

/** Window duration in milliseconds (60 seconds) */
const RATE_LIMIT_WINDOW_MS = 60 * 1000;

interface RateLimitEntry {
  windowStart: number;
  count: number;
}

const resetRateLimit = new Map<string, RateLimitEntry>();

function isRateLimited(email: string): boolean {
  const now = Date.now();
  const entry = resetRateLimit.get(email);

  if (!entry || now - entry.windowStart > RATE_LIMIT_WINDOW_MS) {
    resetRateLimit.set(email, { windowStart: now, count: 1 });
    return false;
  }

  if (entry.count >= MAX_RESETS_PER_WINDOW) return true;

  entry.count += 1;
  return false;
}

/** Clear rate-limit state — intended for use in tests only */
export function clearPasswordResetRateLimit(): void {
  resetRateLimit.clear();
}

// ── Router factory ───────────────────────────────────────────────────────────

/**
 * Creates the password reset routes:
 *
 * POST /request-reset  — Request a password reset link.
 * POST /reset-password — Submit a new password using a valid reset token.
 *
 * Security properties:
 *   - request-reset always returns 200 to prevent email enumeration.
 *   - Rate limited to 3 requests per 60-second window per email.
 *   - Tokens expire after 1 hour and are single-use.
 *   - New passwords are validated for strength before acceptance.
 *   - All reset events are written to the audit log.
 *   - Successful reset revokes all existing JWT sessions for the user.
 *
 * @param userStore - Injectable user store (defaults to in-memory; swap for DB in production).
 */
export function createPasswordResetRouter(userStore: UserStore = inMemoryUserStore): Router {
  const router = Router();

  /**
   * POST /api/auth/request-reset
   * Accepts: { email }
   *
   * Always responds 200 — the body never reveals whether the email exists.
   */
  router.post('/request-reset', async (req: Request, res: Response): Promise<void> => {
    const { email } = req.body as { email?: string };

    if (!email || typeof email !== 'string') {
      res.status(400).json({ error: 'Email is required.' });
      return;
    }

    const normalizedEmail = email.toLowerCase();

    if (isRateLimited(normalizedEmail)) {
      auditLog.push({
        timestamp: new Date(),
        action: 'REQUEST_RESET',
        email: normalizedEmail,
        reason: 'Rate limited',
      });
      // Return 200 to avoid confirming whether the email is registered
      res.status(200).json({
        message: 'If that email is registered, a reset link has been sent.',
      });
      return;
    }

    const user = await userStore.findByEmail(normalizedEmail);

    auditLog.push({
      timestamp: new Date(),
      action: 'REQUEST_RESET',
      email: normalizedEmail,
      reason: user ? 'Token generated' : 'Email not found (no token generated)',
    });

    if (user) {
      // Generate token — in production, pass this to sendPasswordResetEmail()
      generatePasswordResetToken(normalizedEmail);
    }

    // Always return the same response whether the email exists or not
    res.status(200).json({
      message: 'If that email is registered, a reset link has been sent.',
    });
  });

  /**
   * POST /api/auth/reset-password
   * Accepts: { token, newPassword }
   */
  router.post('/reset-password', async (req: Request, res: Response): Promise<void> => {
    const { token, newPassword } = req.body as {
      token?: string;
      newPassword?: string;
    };

    if (!token || typeof token !== 'string') {
      res.status(400).json({ error: 'Token is required.' });
      return;
    }

    if (!newPassword || typeof newPassword !== 'string') {
      res.status(400).json({ error: 'New password is required.' });
      return;
    }

    const passwordError = validatePassword(newPassword);
    if (passwordError) {
      res.status(400).json({ error: passwordError });
      return;
    }

    let email: string;
    try {
      email = consumePasswordResetToken(token);
    } catch (err) {
      const message =
        err instanceof PasswordResetTokenError ? err.message : 'Invalid token';
      auditLog.push({
        timestamp: new Date(),
        action: 'RESET_FAILED',
        email: 'unknown',
        reason: message,
      });
      res.status(400).json({ error: message });
      return;
    }

    const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
    await userStore.updatePasswordHash(email, passwordHash);

    // Invalidate all existing sessions for this user only.
    revokeAllUserTokens(email);

    auditLog.push({
      timestamp: new Date(),
      action: 'RESET_COMPLETE',
      email,
    });

    res.status(200).json({
      message: 'Password has been reset successfully. Please log in with your new password.',
    });
  });

  return router;
}
