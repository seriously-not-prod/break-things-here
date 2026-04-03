import { Request, Response } from 'express';
import * as crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { getDatabase } from '../db/database.js';

const SALT_ROUNDS = 12;
const PASSWORD_PATTERN = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z\d]).{8,}$/;

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
 * Generates a cryptographically secure password reset token (64-char hex string).
 */
export function generateResetToken(): string {
  return crypto.randomBytes(32).toString('hex');
}
