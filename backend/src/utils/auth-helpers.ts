import bcrypt from 'bcrypt';
import crypto from 'crypto';

const SALT_ROUNDS = 12;

/**
 * Validates email format using RFC 5322 simplified pattern
 * @param email - Email address to validate
 * @returns True if email format is valid
 */
export function validateEmailFormat(email: string): boolean {
  if (!email || typeof email !== 'string') return false;
  // Guard against ReDoS: limit input size (RFC max length for emails is 254)
  if (email.length > 254) return false;
  // Safe linear-time validator — avoids polynomial backtracking
  const at = email.indexOf('@');
  if (at <= 0 || at !== email.lastIndexOf('@')) return false;
  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  if (!local || !domain) return false;
  const dot = domain.lastIndexOf('.');
  if (dot <= 0 || dot === domain.length - 1) return false;
  return !local.includes(' ') && !domain.includes(' ');
}

/**
 * Hashes a password using bcrypt
 * @param password - Plain text password
 * @returns Promise resolving to hashed password
 */
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

/**
 * Verifies a password against a bcrypt hash
 * @param password - Plain text password to verify
 * @param hash - Bcrypt hash to compare against
 * @returns Promise resolving to boolean indicating match
 */
export async function verifyPassword(
  password: string,
  hash: string,
): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

/**
 * Generates a cryptographically secure verification token
 * @returns Hex-encoded random token (64 characters)
 */
export function generateVerificationToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Generates a cryptographically secure password reset token
 * @returns Hex-encoded random token (64 characters)
 */
export function generatePasswordResetToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Sends a verification email (stub for task #16)
 * @param email - Recipient email address
 * @param token - Verification token
 * @param baseUrl - Base URL for verification link
 */
export async function sendVerificationEmail(
  email: string,
  token: string,
  baseUrl: string,
): Promise<void> {
  const confirmUrl = `${baseUrl}/verify-email?token=${encodeURIComponent(token)}`;

  try {
    const nodemailer = await import('nodemailer');
    const transport = nodemailer.default.createTransport({
      host: process.env.SMTP_HOST || 'localhost',
      port: Number(process.env.SMTP_PORT) || 587,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });

    await transport.sendMail({
      from: process.env.FROM_EMAIL || 'noreply@festival-planner.local',
      to: email,
      subject: 'Verify your email address',
      text: `Please verify your email by clicking the following link: ${confirmUrl}`,
    });
  } catch (err) {
    console.error('Failed to send verification email:', err);
    throw err;
  }
}

/**
 * Sends a password reset email
 * @param email - Recipient email address
 * @param token - Password reset token
 * @param baseUrl - Base URL for reset link
 */
export async function sendPasswordResetEmail(
  email: string,
  token: string,
  baseUrl: string,
): Promise<void> {
  const resetUrl = `${baseUrl}/reset-password?token=${encodeURIComponent(token)}`;

  try {
    const nodemailer = await import('nodemailer');
    const transport = nodemailer.default.createTransport({
      host: process.env.SMTP_HOST || 'localhost',
      port: Number(process.env.SMTP_PORT) || 587,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });

    await transport.sendMail({
      from: process.env.FROM_EMAIL || 'noreply@festival-planner.local',
      to: email,
      subject: 'Password Reset Request',
      text: `Click the link below to reset your password. This link expires in 1 hour.\n\n${resetUrl}`,
    });
  } catch (err) {
    console.error('Failed to send password reset email:', err);
    throw err;
  }
}
