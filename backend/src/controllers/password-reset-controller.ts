import { Request, Response } from 'express';
import { getDatabase } from '../db/database.js';
import { validateEmailFormat, generatePasswordResetToken, sendPasswordResetEmail, hashPassword, hashToken } from '../utils/auth-helpers.js';

interface AuthRequest extends Request {
  user?: { id: number; email: string; role_id: number };
}

const RATE_LIMIT_MAX_REQUESTS = 3;
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const TOKEN_EXPIRATION_MS = 60 * 60 * 1000; // 1 hour

/**
 * POST /api/auth/forgot-password
 *
 * Handles password reset requests. When a user submits their email, the endpoint:
 * 1. Generates a cryptographically secure token
 * 2. Stores it in the database with 1-hour expiration
 * 3. Sends a password reset email
 * 4. Returns identical response regardless of whether email exists (prevents enumeration)
 *
 * AC Requirements Met:
 * - ✓ POST endpoint accepts email address
 * - ✓ Cryptographically secure token generated (crypto.randomBytes)
 * - ✓ Token stored with 1-hour expiration
 * - ✓ Password reset email sent with secure link
 * - ✓ Same response for existing/non-existing emails (enumeration prevention)
 * - ✓ Rate limiting: max 3 requests per email per hour
 * - ✓ Reset request logged for security audit
 * - ✓ Input validation and sanitization
 */
export async function forgotPassword(req: AuthRequest, res: Response): Promise<Response> {
  const { email } = req.body as { email?: string };

  // Input validation
  if (!email) {
    return res.status(400).json({ error: 'Email address is required.' });
  }

  const normalizedEmail = email.trim().toLowerCase();

  if (!validateEmailFormat(normalizedEmail)) {
    return res.status(400).json({ error: 'Invalid email format.' });
  }

  const db = getDatabase();
  const baseUrl = process.env.APP_BASE_URL || 'http://localhost:3000';

  try {
    // Check rate limiting (AC: max 3 requests per email per hour)
    const rateLimitEntry = await db.get(
      `SELECT request_count, window_start FROM password_reset_rate_limit WHERE email = ?`,
      [normalizedEmail],
    );

    if (rateLimitEntry) {
      const windowStart = new Date(rateLimitEntry.window_start as string).getTime();
      const now = Date.now();

      if (now - windowStart < RATE_LIMIT_WINDOW_MS) {
        if ((rateLimitEntry.request_count as number) >= RATE_LIMIT_MAX_REQUESTS) {
          // Log the rate limit violation
          await logAudit(
            db,
            undefined,
            normalizedEmail,
            'PASSWORD_RESET_RATE_LIMIT_EXCEEDED',
            `Exceeded 3 requests in 1 hour`,
            req.ip,
          );

          // Return the same generic response (AC: identical response prevents enumeration)
          return res.status(200).json({
            message: 'If an account exists with this email, a password reset link has been sent.',
          });
        }

        // Increment request count
        await db.run(
          `UPDATE password_reset_rate_limit SET request_count = request_count + 1 WHERE email = ?`,
          [normalizedEmail],
        );
      } else {
        // Window expired, reset counter
        await db.run(
          `UPDATE password_reset_rate_limit SET request_count = 1, window_start = CURRENT_TIMESTAMP WHERE email = ?`,
          [normalizedEmail],
        );
      }
    } else {
      // Create new rate limit entry
      await db.run(
        `INSERT INTO password_reset_rate_limit (email, request_count, window_start) VALUES (?, 1, CURRENT_TIMESTAMP)`,
        [normalizedEmail],
      );
    }

    // AC: Look up user (but don't reveal if they exist)
    const user = await db.get(
      'SELECT id FROM users WHERE LOWER(email) = ? AND deleted_at IS NULL',
      [normalizedEmail],
    );

    // AC: Generate cryptographically secure token
    const resetToken = generatePasswordResetToken();
    // Store only the SHA-256 hash — sending the plain token in the email URL is intentional;
    // the DB never holds the raw token (CWE-312 / CodeQL: clear-text sensitive storage)
    const resetTokenHash = hashToken(resetToken);
    const expiresAt = new Date(Date.now() + TOKEN_EXPIRATION_MS).toISOString();

    // AC: Store token hash in database with expiration
    await db.run(
      `INSERT INTO password_reset_tokens (user_id, email, token, expires_at) VALUES (?, ?, ?, ?)`,
      [user?.id || null, normalizedEmail, resetTokenHash, expiresAt],
    );

    // AC: Send reset email if user exists
    if (user) {
      // AC: Log token generation regardless of email delivery outcome
      await logAudit(
        db,
        user.id as number,
        normalizedEmail,
        'PASSWORD_RESET_REQUESTED',
        'Password reset token generated',
        req.ip,
      );

      try {
        await sendPasswordResetEmail(normalizedEmail, resetToken, baseUrl);  // plain token in email link
      } catch (emailError) {
        console.error('Failed to send password reset email:', emailError);
        // Continue despite email failure - token is stored and audit log is written
      }
    }

    // AC: Return identical response regardless of whether email exists (prevents enumeration)
    return res.status(200).json({
      message: 'If an account exists with this email, a password reset link has been sent.',
    });
  } catch (error) {
    console.error('Error in forgot password endpoint:', error);

    // Log the error
    await logAudit(
      db,
      undefined,
      normalizedEmail,
      'PASSWORD_RESET_ERROR',
      error instanceof Error ? error.message : 'Unknown error',
      req.ip,
    );

    // AC: Identical response on error (prevents info leakage)
    return res.status(200).json({
      message: 'If an account exists with this email, a password reset link has been sent.',
    });
  }
}

/**
 * POST /api/auth/reset-password
 *
 * Verifies the password reset token and updates the user's password.
 *
 * AC Requirements Met:
 * - ✓ POST endpoint accepts reset token and new password
 * - ✓ Token validated for existence, expiration, and single-use
 * - ✓ Expired or invalid tokens return appropriate error
 * - ✓ New password validated against strength requirements (min 8 chars)
 * - ✓ Password hashed with bcrypt before storage
 * - ✓ All existing user sessions invalidated after reset
 * - ✓ Token marked as used after successful reset
 * - ✓ Password change logged for security audit
 * - ✓ Input validation and sanitization on all fields
 */
export async function resetPassword(req: AuthRequest, res: Response): Promise<Response> {
  const { token, newPassword } = req.body as { token?: string; newPassword?: string };

  if (!token || typeof token !== 'string') {
    return res.status(400).json({ error: 'Reset token is required.' });
  }

  if (!newPassword || typeof newPassword !== 'string') {
    return res.status(400).json({ error: 'New password is required.' });
  }

  if (newPassword.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters long.' });
  }

  // Basic complexity check: require at least one letter and one digit
  if (!/[a-zA-Z]/.test(newPassword) || !/[0-9]/.test(newPassword)) {
    return res.status(400).json({ error: 'Password must contain at least one letter and one number.' });
  }

  const db = getDatabase();

  try {
    // Look up token by hash — raw token is never stored in the DB
    const tokenRow = await db.get(
      `SELECT id, user_id, email, expires_at, used_at FROM password_reset_tokens WHERE token = ?`,
      [hashToken(token)],
    );

    if (!tokenRow) {
      return res.status(400).json({ error: 'Invalid or expired reset token.' });
    }

    if (tokenRow.used_at) {
      return res.status(400).json({ error: 'This reset link has already been used.' });
    }

    const expiresAt = new Date(tokenRow.expires_at as string).getTime();
    if (Date.now() > expiresAt) {
      return res.status(400).json({ error: 'This reset link has expired. Please request a new one.' });
    }

    const userId = tokenRow.user_id as number;
    const email = tokenRow.email as string;

    // Hash new password
    const passwordHash = await hashPassword(newPassword);

    // Update user password
    await db.run(`UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [
      passwordHash,
      userId,
    ]);

    // Invalidate all existing sessions
    await db.run(`DELETE FROM sessions WHERE user_id = ?`, [userId]);

    // Mark token as used
    await db.run(
      `UPDATE password_reset_tokens SET used_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [tokenRow.id],
    );

    // Log audit entry
    await logAudit(db, userId, email, 'PASSWORD_RESET_COMPLETED', 'Password successfully reset', req.ip);

    return res.status(200).json({ message: 'Your password has been reset. You can now log in with your new password.' });
  } catch (error) {
    console.error('Error in reset password endpoint:', error);
    return res.status(500).json({ error: 'An unexpected error occurred. Please try again.' });
  }
}

/**
 * Logs an action to the audit log for security tracking
 */
async function logAudit(
  db: any,
  userId: number | undefined,
  email: string | undefined,
  action: string,
  description: string,
  ipAddress: string | undefined,
): Promise<void> {
  try {
    await db.run(
      `INSERT INTO audit_log (user_id, email, action, description, ip_address) VALUES (?, ?, ?, ?, ?)`,
      [userId || null, email || null, action, description, ipAddress || null],
    );
  } catch (err) {
    console.error('Failed to log audit entry:', err);
  }
}
