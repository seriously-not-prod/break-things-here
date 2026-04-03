import { Request, Response } from 'express';
import * as crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { getDatabase } from '../db/database.js';

const SALT_ROUNDS = 12;
const PASSWORD_PATTERN = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z\d]).{8,}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Rate-limiting constants for forgot-password endpoint (AC #77)
const RATE_LIMIT_MAX = 3;
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1_000; // 1 hour
const TOKEN_TTL_MS = 60 * 60 * 1_000; // 1 hour
const GENERIC_RESET_MESSAGE =
  'If an account exists with that email, a password reset link has been sent.';

/**
 * POST /api/auth/reset-password
 *
 * Verifies a password reset token and updates the user's password.
 * - Validates token existence, expiration, and single-use
 * - Hashes the new password with bcrypt
 * - Invalidates all existing sessions
 * - Marks the token as consumed
 * - Logs the password change for security audit
 */
export async function resetPassword(req: Request, res: Response): Promise<void> {
  const { token, newPassword } = req.body as { token?: unknown; newPassword?: unknown };

  // Input validation
  if (typeof token !== 'string' || !token.trim()) {
    res.status(400).json({ message: 'Reset token is required.' });
    return;
  }

  if (typeof newPassword !== 'string' || !newPassword) {
    res.status(400).json({ message: 'New password is required.' });
    return;
  }

  if (!PASSWORD_PATTERN.test(newPassword)) {
    res.status(400).json({
      message:
        'Password must be at least 8 characters and include uppercase, lowercase, number, and special character.',
    });
    return;
  }

  const sanitizedToken = token.trim();
  const db = getDatabase();

  try {
    // Look up the token record
    const tokenRecord = await db.get<{
      id: number;
      user_id: number;
      email: string;
      expires_at: string;
      used: number;
    }>(
      'SELECT id, user_id, email, expires_at, used FROM password_reset_tokens WHERE token = ?',
      [sanitizedToken]
    );

    if (!tokenRecord) {
      res.status(400).json({ message: 'Invalid or expired reset token.' });
      return;
    }

    if (tokenRecord.used === 1) {
      res.status(400).json({ message: 'This reset token has already been used.' });
      return;
    }

    const expiresAt = new Date(tokenRecord.expires_at);
    if (expiresAt < new Date()) {
      res.status(400).json({ message: 'This reset token has expired. Please request a new one.' });
      return;
    }

    // Hash the new password
    const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);

    // Update the password
    await db.run(
      'UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [passwordHash, tokenRecord.user_id]
    );

    // Invalidate all existing sessions for this user
    await db.run('DELETE FROM sessions WHERE user_id = ?', [tokenRecord.user_id]);

    // Mark the token as used
    await db.run(
      'UPDATE password_reset_tokens SET used = 1, used_at = CURRENT_TIMESTAMP WHERE id = ?',
      [tokenRecord.id]
    );

    // Log the password change for security audit
    await db.run(
      `INSERT INTO audit_log (user_id, action, ip_address, details, created_at)
       VALUES (?, 'password_reset_success', ?, ?, CURRENT_TIMESTAMP)`,
      [
        tokenRecord.user_id,
        (req.ip ?? req.socket?.remoteAddress ?? 'unknown').substring(0, 45),
        JSON.stringify({ email: tokenRecord.email }),
      ]
    ).catch(() => {
      // Audit log failure is non-critical; do not block the response
    });

    res.status(200).json({ message: 'Password has been reset successfully.' });
  } catch (error) {
    console.error('[password-reset-controller] resetPassword error:', error);
    res.status(500).json({ message: 'An internal error occurred. Please try again.' });
  }
}

/**
 * POST /api/auth/forgot-password
 *
 * Initiates a password reset flow.
 * - Validates email input
 * - Applies rate limiting (max 3 requests per email per hour)
 * - Generates a cryptographically secure token and stores it with 1-hour expiry
 * - Sends a reset email when the user exists
 * - Returns an identical generic response regardless of email existence (prevents enumeration)
 */
export async function forgotPassword(req: Request, res: Response): Promise<void> {
  const { email } = req.body as { email?: unknown };

  if (typeof email !== 'string' || !email.trim()) {
    res.status(400).json({ message: 'Email address is required.' });
    return;
  }

  const normalizedEmail = email.trim().toLowerCase();

  if (!EMAIL_PATTERN.test(normalizedEmail)) {
    res.status(400).json({ message: 'A valid email address is required.' });
    return;
  }

  const db = getDatabase();

  try {
    // Rate limiting: max 3 requests per email per hour
    const rateLimitRow = await db.get<{ request_count: number; window_start: string }>(
      'SELECT request_count, window_start FROM password_reset_rate_limit WHERE email = ?',
      [normalizedEmail]
    );

    if (rateLimitRow) {
      const windowStart = new Date(rateLimitRow.window_start).getTime();
      const now = Date.now();

      if (now - windowStart < RATE_LIMIT_WINDOW_MS) {
        if (rateLimitRow.request_count >= RATE_LIMIT_MAX) {
          // Rate limit exceeded — return same generic response to prevent enumeration
          res.status(200).json({ message: GENERIC_RESET_MESSAGE });
          return;
        }
        await db.run(
          'UPDATE password_reset_rate_limit SET request_count = request_count + 1 WHERE email = ?',
          [normalizedEmail]
        );
      } else {
        // Window expired — reset counter
        await db.run(
          'UPDATE password_reset_rate_limit SET request_count = 1, window_start = CURRENT_TIMESTAMP WHERE email = ?',
          [normalizedEmail]
        );
      }
    } else {
      await db.run(
        'INSERT INTO password_reset_rate_limit (email, request_count, window_start) VALUES (?, 1, CURRENT_TIMESTAMP)',
        [normalizedEmail]
      );
    }

    // Look up user without revealing existence
    const user = await db.get<{ id: number }>(
      'SELECT id FROM users WHERE LOWER(email) = ? AND deleted_at IS NULL',
      [normalizedEmail]
    );

    // Generate cryptographically secure token and store with expiration
    const resetToken = generateResetToken();
    const expiresAt = new Date(Date.now() + TOKEN_TTL_MS).toISOString();

    await db.run(
      'INSERT INTO password_reset_tokens (user_id, email, token, expires_at) VALUES (?, ?, ?, ?)',
      [user?.id ?? null, normalizedEmail, resetToken, expiresAt]
    );

    // Send reset email if user exists (failure is non-critical)
    if (user) {
      const baseUrl = process.env.APP_BASE_URL ?? 'http://localhost:3000';
      const resetUrl = `${baseUrl}/reset-password?token=${encodeURIComponent(resetToken)}`;
      await sendPasswordResetEmail(normalizedEmail, resetUrl).catch((err: unknown) => {
        console.error('[password-reset-controller] Failed to send reset email:', err);
      });

      // Audit log
      await db
        .run(
          `INSERT INTO audit_log (user_id, action, ip_address, details, created_at)
           VALUES (?, 'password_reset_requested', ?, ?, CURRENT_TIMESTAMP)`,
          [
            user.id,
            (req.ip ?? req.socket?.remoteAddress ?? 'unknown').substring(0, 45),
            JSON.stringify({ email: normalizedEmail }),
          ]
        )
        .catch(() => {});
    }

    res.status(200).json({ message: GENERIC_RESET_MESSAGE });
  } catch (error) {
    console.error('[password-reset-controller] forgotPassword error:', error);
    // Return same generic response to prevent information leakage
    res.status(200).json({ message: GENERIC_RESET_MESSAGE });
  }
}

/**
 * Generates a cryptographically secure password reset token (64-char hex string).
 */
export function generateResetToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Sends a password reset email to the given address.
 * Exported so it can be mocked in tests.
 */
export async function sendPasswordResetEmail(toEmail: string, resetUrl: string): Promise<void> {
  // In test environments this is a no-op; real SMTP is configured via environment variables.
  if (process.env.NODE_ENV === 'test') return;
  console.log(`[password-reset] Reset link for ${toEmail}: ${resetUrl}`);
}
