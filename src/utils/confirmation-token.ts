import { randomBytes } from 'node:crypto';

/** Token lifetime in milliseconds (24 hours) */
const TOKEN_TTL_MS = parseInt(process.env.CONFIRMATION_TOKEN_TTL_MS ?? String(24 * 60 * 60 * 1000), 10);

/** Minimum byte length for cryptographic security */
const TOKEN_BYTES = 32;

export interface ConfirmationToken {
  token: string;
  email: string;
  expiresAt: Date;
  used: boolean;
}

export class TokenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TokenError';
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, TokenError);
    }
  }
}

/** In-memory store — swap for DB in production */
const tokenStore = new Map<string, ConfirmationToken>();

/**
 * Generate a cryptographically secure confirmation token and store it
 * with a 24-hour expiry.
 *
 * @param email - The email address to associate with the token
 * @returns The generated token string (hex-encoded, 64 chars)
 */
export function generateConfirmationToken(email: string): string {
  if (!email || typeof email !== 'string') {
    throw new TokenError('A valid email is required to generate a confirmation token');
  }

  const token = randomBytes(TOKEN_BYTES).toString('hex');
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MS);

  tokenStore.set(token, { token, email, expiresAt, used: false });

  return token;
}

/**
 * Verify a confirmation token. Returns the associated email if valid.
 *
 * @param token - The token to verify
 * @returns The email associated with the token
 * @throws {TokenError} If the token is invalid, expired, or already used
 */
export function verifyConfirmationToken(token: string): string {
  if (!token || typeof token !== 'string') {
    throw new TokenError('Token is required');
  }

  const record = tokenStore.get(token);

  if (!record) {
    throw new TokenError('Invalid or unknown token');
  }

  if (record.used) {
    throw new TokenError('Token has already been used');
  }

  if (record.expiresAt < new Date()) {
    tokenStore.delete(token);
    throw new TokenError('Token has expired');
  }

  return record.email;
}

/**
 * Mark a token as used (call after successful email confirmation).
 *
 * @param token - The token to consume
 * @throws {TokenError} If the token is invalid or already used
 */
export function consumeConfirmationToken(token: string): string {
  const email = verifyConfirmationToken(token);
  const record = tokenStore.get(token);
  if (record) {
    record.used = true;
  }
  return email;
}

/**
 * Check whether a token is still valid without consuming it.
 * Returns false instead of throwing — useful for quick guards.
 */
export function isTokenValid(token: string): boolean {
  try {
    verifyConfirmationToken(token);
    return true;
  } catch {
    return false;
  }
}

/** Clear all tokens — intended for use in tests only */
export function clearTokenStore(): void {
  tokenStore.clear();
}
