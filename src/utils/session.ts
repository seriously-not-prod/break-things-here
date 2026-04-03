import jwt from 'jsonwebtoken';

const JWT_EXPIRY = process.env.JWT_EXPIRY ?? '1h';
const JWT_REMEMBER_ME_EXPIRY = process.env.JWT_REMEMBER_ME_EXPIRY ?? '7d';

/**
 * Retrieve the JWT secret from the environment.
 * Throws at runtime if JWT_SECRET is not set — a hardcoded fallback is
 * intentionally absent to prevent CWE-798 (Use of Hard-coded Credentials).
 *
 * Set JWT_SECRET=<random-256-bit-value> in all environments, including local
 * development. For tests, set it in jest.config.js `testEnvironment` or a
 * setup file.
 */
function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error(
      'JWT_SECRET environment variable is not set. ' +
      'Generate a secure random value and set it before starting the server.',
    );
  }
  return secret;
}

/** Shape of the data encoded in a session token */
export interface SessionPayload {
  userId: string;
  email: string;
  role: string;
}

/**
 * Token deny-list for logout invalidation.
 * Swap for Redis / DB in production to support multi-instance deployments.
 */
const revokedTokens = new Set<string>();

/**
 * Issue a signed JWT for the given user.
 *
 * @param payload - The session payload to encode.
 * @param rememberMe - When true, the token expires in 7 days instead of 1 hour.
 * @returns Signed JWT string.
 */
export function issueToken(payload: SessionPayload, rememberMe = false): string {
  return jwt.sign(payload, getJwtSecret(), {
    expiresIn: rememberMe ? JWT_REMEMBER_ME_EXPIRY : JWT_EXPIRY,
  });
}

/**
 * Verify a JWT and return the decoded payload.
 *
 * @param token - The JWT string to verify.
 * @returns The decoded session payload.
 * @throws If the token is invalid, expired, or revoked.
 */
export function verifyToken(token: string): SessionPayload {
  if (revokedTokens.has(token)) {
    throw new Error('Token has been revoked');
  }
  return jwt.verify(token, getJwtSecret()) as SessionPayload;
}

/**
 * Add a token to the deny-list (logout).
 * The token will be rejected by verifyToken for the remainder of its lifetime.
 *
 * @param token - The JWT string to revoke.
 */
export function revokeToken(token: string): void {
  revokedTokens.add(token);
}

/** Clear the revoked-token set — intended for use in tests only */
export function clearRevokedTokens(): void {
  revokedTokens.clear();
}
