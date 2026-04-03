/** Maximum consecutive failed login attempts before account lockout */
export const MAX_ATTEMPTS = 5;

/** Lockout duration in milliseconds (15 minutes) */
export const LOCKOUT_DURATION_MS = 15 * 60 * 1000;

interface AttemptRecord {
  count: number;
  lockedUntil: Date | null;
}

/** In-memory attempt tracker — swap for Redis in production */
const attempts = new Map<string, AttemptRecord>();

/**
 * Check whether an account is currently locked out.
 *
 * Automatically removes expired lockouts.
 *
 * @param email - The email address (normalised to lower-case).
 */
export function isLockedOut(email: string): boolean {
  const record = attempts.get(email.toLowerCase());
  if (!record || !record.lockedUntil) return false;

  if (record.lockedUntil > new Date()) return true;

  // Lockout has expired — reset and allow the attempt
  attempts.delete(email.toLowerCase());
  return false;
}

/**
 * Record a failed login attempt.
 * Locks the account after MAX_ATTEMPTS consecutive failures.
 *
 * @param email - The email address (normalised to lower-case).
 */
export function recordFailedAttempt(email: string): void {
  const key = email.toLowerCase();
  const record = attempts.get(key) ?? { count: 0, lockedUntil: null };

  record.count += 1;

  if (record.count >= MAX_ATTEMPTS) {
    record.lockedUntil = new Date(Date.now() + LOCKOUT_DURATION_MS);
  }

  attempts.set(key, record);
}

/**
 * Reset the attempt counter after a successful login.
 *
 * @param email - The email address (normalised to lower-case).
 */
export function resetAttempts(email: string): void {
  attempts.delete(email.toLowerCase());
}

/** Clear all attempt records — intended for use in tests only */
export function clearAttemptStore(): void {
  attempts.clear();
}
