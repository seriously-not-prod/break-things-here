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
 * Password reset token pair using the selector/verifier pattern.
 * - `selector` (32 hex chars): stored in plaintext in `token_selector` DB column for fast lookup.
 * - `verifier` (64 hex chars): bcrypt-hashed before DB storage for computational security.
 * - `fullToken` (96 hex chars): concatenation sent to the user in the reset email link.
 *
 * This pattern avoids using a fast hash (SHA-256) on password-like data, satisfying
 * CWE-916 / CodeQL js/insufficient-password-hash requirements.
 */
export interface PasswordResetTokenPair {
  selector: string;
  verifier: string;
  fullToken: string;
}

export function generatePasswordResetTokenPair(): PasswordResetTokenPair {
  const selector = crypto.randomBytes(16).toString('hex'); // 32 hex chars
  const verifier = crypto.randomBytes(32).toString('hex'); // 64 hex chars
  return { selector, verifier, fullToken: selector + verifier };
}

/**
 * Bcrypt-hashes the verifier part of a password reset token for DB storage.
 * Uses SALT_ROUNDS (12) for adequate computational effort (CWE-916).
 */
export async function hashResetVerifier(verifier: string): Promise<string> {
  return bcrypt.hash(verifier, SALT_ROUNDS);
}

/**
 * Verifies the user-submitted verifier against the stored bcrypt hash.
 */
export async function verifyResetToken(verifier: string, hash: string): Promise<boolean> {
  return bcrypt.compare(verifier, hash);
}

/**
 * Computes a SHA-256 hash of a token for safe storage.
 * Raw JWTs must never be stored in the database as clear text.
 * Store the hash; compare by hashing the incoming token before lookup.
 * @param token - The JWT or other token string
 * @returns Hex-encoded SHA-256 digest
 */
export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * Encrypts a token for safe client-side storage (cookie) using AES-256-GCM.
 * The encryption key must be provided via `REFRESH_TOKEN_ENC_KEY` env var (base64, 32 bytes).
 * Returns a URL-safe base64 string containing iv|ciphertext|authTag.
 */
export function encryptToken(token: string): string {
  const keyBase64 = process.env.REFRESH_TOKEN_ENC_KEY;
  const key = keyBase64 ? Buffer.from(keyBase64, 'base64') : crypto.createHash('sha256').update('dev-refresh-key').digest();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString('base64url');
}

/**
 * Decrypts a token produced by `encryptToken`.
 */
export function decryptToken(payload: string): string {
  const keyBase64 = process.env.REFRESH_TOKEN_ENC_KEY;
  const key = keyBase64 ? Buffer.from(keyBase64, 'base64') : crypto.createHash('sha256').update('dev-refresh-key').digest();
  const data = Buffer.from(payload, 'base64url');
  const iv = data.slice(0, 12);
  const tag = data.slice(12, 28);
  const encrypted = data.slice(28);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return decrypted.toString('utf8');
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
