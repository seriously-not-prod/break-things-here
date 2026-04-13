import { randomBytes } from 'node:crypto';

/**
 * Password reset token TTL — 1 hour (shorter than email confirmation tokens).
 * Can be overridden via the RESET_TOKEN_TTL_MS environment variable.
 */
const RESET_TOKEN_TTL_MS = parseInt(
  process.env.RESET_TOKEN_TTL_MS ?? String(60 * 60 * 1000),
  10,
);

const TOKEN_BYTES = 32;

export interface PasswordResetToken {
  token: string;
  email: string;
  expiresAt: Date;
  used: boolean;
}

export class PasswordResetTokenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PasswordResetTokenError';
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, PasswordResetTokenError);
    }
  }
}

/** In-memory store — swap for DB in production */
const resetTokenStore = new Map<string, PasswordResetToken>();

/**
 * Generate a cryptographically secure password reset token.
 *
 * The token expires after 1 hour and is single-use.
 *
 * @param email - The email address to associate with the token (stored lowercase).
 * @returns The generated token string (hex-encoded, 64 characters).
 */
export function generatePasswordResetToken(email: string): string {
  if (!email || typeof email !== 'string') {
    throw new PasswordResetTokenError('A valid email is required');
  }

  const token = randomBytes(TOKEN_BYTES).toString('hex');
  const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MS);

  resetTokenStore.set(token, {
    token,
    email: email.toLowerCase(),
    expiresAt,
    used: false,
  });

  return token;
}

/**
 * Verify and consume a password reset token in one atomic step.
 *
 * On success the token is marked as used and cannot be reused.
 *
 * @param token - The token to verify.
 * @returns The email associated with the token.
 * @throws {PasswordResetTokenError} If the token is invalid, expired, or already used.
 */
export function consumePasswordResetToken(token: string): string {
  if (!token || typeof token !== 'string') {
    throw new PasswordResetTokenError('Token is required');
  }

  const record = resetTokenStore.get(token);

  if (!record) {
    throw new PasswordResetTokenError('Invalid or unknown token');
  }

  if (record.used) {
    throw new PasswordResetTokenError('Token has already been used');
  }

  if (record.expiresAt < new Date()) {
    resetTokenStore.delete(token);
    throw new PasswordResetTokenError('Token has expired');
  }

  // Mark as used — single-use enforcement
  record.used = true;
  return record.email;
}

/** Clear all reset tokens — intended for use in tests only */
export function clearResetTokenStore(): void {
  resetTokenStore.clear();
}
