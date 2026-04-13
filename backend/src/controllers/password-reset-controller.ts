import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { getDatabase } from '../db/database.js';
import { validateEmailFormat, generatePasswordResetToken, sendPasswordResetEmail } from '../utils/auth-helpers.js';

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
  if (!email || typeof email !== 'string') {
    return res.status(400).json({ message: 'Email is required.' });
  }

  const normalizedEmail = email.trim().toLowerCase();

  if (!validateEmailFormat(normalizedEmail)) {
    return res.status(400).json({ message: 'Invalid email format. Please provide a valid email address.' });
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
    const expiresAt = new Date(Date.now() + TOKEN_EXPIRATION_MS).toISOString();

    // AC: Store token in database with expiration
    await db.run(
      `INSERT INTO password_reset_tokens (user_id, email, token, expires_at) VALUES (?, ?, ?, ?)`,
      [user?.id || null, normalizedEmail, resetToken, expiresAt],
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
        await sendPasswordResetEmail(normalizedEmail, resetToken, baseUrl);
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

/**
 * Generates a cryptographically secure password reset token (64-char hex).
 * Re-exported here for testability.
 */
export function generateResetToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * POST /api/auth/reset-password
 * Validates token, checks expiry, hashes new password, updates DB.
 */
export async function resetPassword(req: Request, res: Response): Promise<void> {
  const { token, newPassword } = req.body as { token?: string; newPassword?: string };

  if (!token) {
    res.status(400).json({ message: 'Token is required.' });
    return;
  }
  if (!newPassword) {
    res.status(400).json({ message: 'Password is required.' });
    return;
  }
  // Password strength: min 8 chars, uppercase, digit, special char
  if (!/^(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*]).{8,}$/.test(newPassword)) {
    res.status(400).json({ message: 'Password must be at least 8 characters, contain an uppercase letter, a digit, and a special character.' });
    return;
  }

  const db = getDatabase();

  const record = await db.get<{
    id: number;
    user_id: number;
    email: string;
    expires_at: string;
    used: number;
  }>(
    `SELECT id, user_id, email, expires_at, used FROM password_reset_tokens WHERE token = ?`,
    [token],
  );

  if (!record) {
    res.status(400).json({ message: 'Invalid or expired token.' });
    return;
  }
  if (record.used) {
    res.status(400).json({ message: 'Token has already been used.' });
    return;
  }
  if (new Date(record.expires_at) < new Date()) {
    res.status(400).json({ message: 'Token has expired.' });
    return;
  }

  const passwordHash = await bcrypt.hash(newPassword, 12);

  await db.run(`UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [passwordHash, record.user_id]);
  await db.run(`UPDATE password_reset_tokens SET used = 1 WHERE id = ?`, [record.id]);
  await db.run(`DELETE FROM sessions WHERE user_id = ?`, [record.user_id]);

  res.status(200).json({ message: 'Password has been reset successfully. Please log in with your new password.' });
}
