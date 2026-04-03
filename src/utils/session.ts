import jwt from 'jsonwebtoken';

/**
 * JWT secret — must be overridden via JWT_SECRET env variable in production.
 * Never commit real secrets to source control.
 */
const JWT_SECRET = process.env.JWT_SECRET ?? 'dev-jwt-secret-change-in-production';
const JWT_EXPIRY = process.env.JWT_EXPIRY ?? '1h';
const JWT_REMEMBER_ME_EXPIRY = process.env.JWT_REMEMBER_ME_EXPIRY ?? '7d';

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
  return jwt.sign(payload, JWT_SECRET, {
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
  return jwt.verify(token, JWT_SECRET) as SessionPayload;
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
