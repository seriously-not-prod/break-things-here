/**
 * Password Reset Service (#79)
 *
 * Handles server-side password reset logic:
 * - Cryptographically secure token generation
 * - Rate limiting (max 3 requests per email per hour)
 * - Token verification (expiry, single-use)
 * - Password strength validation
 * - Password hashing and storage
 * - Session invalidation after reset
 */

import crypto from 'crypto';
import { hashPassword } from '../utils/password-hash';

const TOKEN_EXPIRY_MS = 60 * 60 * 1000;       // 1 hour
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;  // 1 hour window
const RATE_LIMIT_MAX_REQUESTS = 3;

export interface ResetTokenEntry {
  token: string;
  email: string;
  expiresAt: number;
  used: boolean;
  createdAt: number;
}

interface RateLimitEntry {
  count: number;
  windowStart: number;
}

// In-memory stores — would be a database in production
const tokenStore = new Map<string, ResetTokenEntry>();
const rateLimitStore = new Map<string, RateLimitEntry>();
const sessionStore = new Map<string, Set<string>>();   // email → active session IDs
const passwordStore = new Map<string, string>();        // email → hashed password

export class PasswordResetError extends Error {
  constructor(message: string, public readonly code: string) {
    super(message);
    this.name = 'PasswordResetError';
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, PasswordResetError);
    }
  }
}

// ─── Email Validation ───────────────────────────────────────────────────────

/**
 * Validates and sanitizes an email address.
 *
 * @throws {PasswordResetError} INVALID_EMAIL if format is incorrect
 */
export function validateEmail(email: string): string {
  if (!email || email.trim().length === 0) {
    throw new PasswordResetError('Email address is required.', 'INVALID_EMAIL');
  }
  const sanitized = email.trim().toLowerCase();
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(sanitized)) {
    throw new PasswordResetError('Invalid email address format.', 'INVALID_EMAIL');
  }
  return sanitized;
}

// ─── Rate Limiting ──────────────────────────────────────────────────────────

/**
 * Returns true if the given email has exceeded the reset request rate limit.
 */
export function isRateLimited(email: string): boolean {
  const now = Date.now();
  const entry = rateLimitStore.get(email);
  if (!entry) return false;
  if (now - entry.windowStart >= RATE_LIMIT_WINDOW_MS) return false;
  return entry.count >= RATE_LIMIT_MAX_REQUESTS;
}

function incrementRateLimit(email: string): void {
  const now = Date.now();
  const entry = rateLimitStore.get(email);
  if (!entry || now - entry.windowStart >= RATE_LIMIT_WINDOW_MS) {
    rateLimitStore.set(email, { count: 1, windowStart: now });
  } else {
    entry.count++;
  }
}

// ─── Token Generation ───────────────────────────────────────────────────────

/**
 * Generates a cryptographically secure, time-limited reset token for an email.
 *
 * The response is identical whether the email is registered or not to
 * prevent user enumeration. Rate limited to 3 requests per hour.
 *
 * @param rawEmail - The email address requesting a password reset
 * @returns The generated reset token (64 hex characters)
 * @throws {PasswordResetError} INVALID_EMAIL | RATE_LIMIT_EXCEEDED
 */
export function generateResetToken(rawEmail: string): string {
  const email = validateEmail(rawEmail);

  if (isRateLimited(email)) {
    throw new PasswordResetError(
      'Too many password reset requests. Please try again in an hour.',
      'RATE_LIMIT_EXCEEDED'
    );
  }

  incrementRateLimit(email);

  const token = crypto.randomBytes(32).toString('hex');
  tokenStore.set(token, {
    token,
    email,
    expiresAt: Date.now() + TOKEN_EXPIRY_MS,
    used: false,
    createdAt: Date.now(),
  });

  return token;
}

// ─── Token Verification ─────────────────────────────────────────────────────

/**
 * Verifies a reset token is valid, unexpired, and unused.
 *
 * @throws {PasswordResetError} INVALID_TOKEN | TOKEN_ALREADY_USED | TOKEN_EXPIRED
 */
export function verifyResetToken(token: string): ResetTokenEntry {
  const entry = tokenStore.get(token);

  if (!entry) {
    throw new PasswordResetError('Invalid or expired reset token.', 'INVALID_TOKEN');
  }

  if (entry.used) {
    throw new PasswordResetError('This reset token has already been used.', 'TOKEN_ALREADY_USED');
  }

  if (Date.now() > entry.expiresAt) {
    tokenStore.delete(token);
    throw new PasswordResetError('This reset token has expired.', 'TOKEN_EXPIRED');
  }

  return entry;
}

// ─── Password Validation ────────────────────────────────────────────────────

/**
 * Validates that a password meets minimum strength requirements.
 *
 * @throws {PasswordResetError} PASSWORD_TOO_SHORT | PASSWORD_NO_UPPERCASE | PASSWORD_NO_NUMBER
 */
export function validatePasswordStrength(password: string): void {
  if (!password || password.length < 8) {
    throw new PasswordResetError(
      'Password must be at least 8 characters long.',
      'PASSWORD_TOO_SHORT'
    );
  }
  if (!/[A-Z]/.test(password)) {
    throw new PasswordResetError(
      'Password must contain at least one uppercase letter.',
      'PASSWORD_NO_UPPERCASE'
    );
  }
  if (!/[0-9]/.test(password)) {
    throw new PasswordResetError(
      'Password must contain at least one number.',
      'PASSWORD_NO_NUMBER'
    );
  }
}

// ─── Password Reset ─────────────────────────────────────────────────────────

/**
 * Verifies the reset token, hashes the new password, stores it, marks
 * the token as consumed, and invalidates all active sessions for the user.
 *
 * @param token - The reset token from the user's email link
 * @param newPassword - The new plain-text password to set
 * @throws {PasswordResetError} on invalid token, expired token, or weak password
 */
export async function resetPassword(token: string, newPassword: string): Promise<void> {
  validatePasswordStrength(newPassword);

  const entry = verifyResetToken(token);

  const hashed = await hashPassword(newPassword);

  // Persist the new hashed password
  passwordStore.set(entry.email, hashed);

  // Single-use: mark token as consumed
  entry.used = true;

  // Invalidate all existing sessions
  invalidateUserSessions(entry.email);
}

// ─── Session Management ─────────────────────────────────────────────────────

/**
 * Removes all active sessions for a user (e.g. after password reset).
 */
export function invalidateUserSessions(email: string): void {
  sessionStore.delete(email);
}

/**
 * Registers an active session for a user.
 */
export function addSession(email: string, sessionId: string): void {
  if (!sessionStore.has(email)) {
    sessionStore.set(email, new Set());
  }
  sessionStore.get(email)!.add(sessionId);
}

/**
 * Returns a copy of the active session IDs for a user.
 */
export function getActiveSessions(email: string): Set<string> {
  return new Set(sessionStore.get(email) ?? []);
}

/**
 * Returns the stored hashed password for a user (for verification / testing).
 */
export function getStoredPassword(email: string): string | undefined {
  return passwordStore.get(email);
}

// ─── Test Helpers ────────────────────────────────────────────────────────────

/**
 * Clears all in-memory stores. For use in tests only.
 */
export function _clearAllStores(): void {
  tokenStore.clear();
  rateLimitStore.clear();
  sessionStore.clear();
  passwordStore.clear();
}

/**
 * Returns the raw token entry from the store. For use in tests only.
 */
export function _getTokenEntry(token: string): ResetTokenEntry | undefined {
  return tokenStore.get(token);
}
