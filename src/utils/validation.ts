/**
 * Validation utilities for the registration form.
 */

/** RFC 5321 max lengths */
const MAX_EMAIL_LENGTH = 254;
const MAX_LOCAL_LENGTH = 64;

/**
 * Validate an email address without a ReDoS-prone regex (CWE-1333).
 *
 * Uses a structural split approach that runs in O(n) time:
 *   1. Max total length 254 chars (RFC 5321).
 *   2. Exactly one '@', not at first or last position.
 *   3. Local part max 64 chars (RFC 5321).
 *   4. Domain contains a '.' with content on both sides.
 *   5. No whitespace anywhere in the address.
 */
export function isValidEmailFormat(email: string): boolean {
  if (email.length > MAX_EMAIL_LENGTH) return false;
  if (/\s/.test(email)) return false;

  const atIndex = email.indexOf('@');
  if (atIndex <= 0 || atIndex !== email.lastIndexOf('@')) return false;

  const local = email.slice(0, atIndex);
  const domain = email.slice(atIndex + 1);

  if (local.length > MAX_LOCAL_LENGTH || domain.length < 3) return false;

  const lastDot = domain.lastIndexOf('.');
  if (lastDot <= 0 || lastDot >= domain.length - 1) return false;

  return true;
}

/**
 * Validates an email address.
 *
 * @param email - The email string to validate.
 * @returns An error message string, or null if valid.
 */
export function validateEmail(email: string): string | null {
  if (!email.trim()) {
    return 'Email address is required.';
  }
  if (!isValidEmailFormat(email)) {
    return 'Please enter a valid email address (e.g. user@example.com).';
  }
  return null;
}

/**
 * Validates password strength: min 8 chars, 1 uppercase, 1 number, 1 special char.
 *
 * @param password - The password string to validate.
 * @returns An error message string, or null if valid.
 */
export function validatePassword(password: string): string | null {
  if (!password) {
    return 'Password is required.';
  }
  if (password.length < 8) {
    return 'Password must be at least 8 characters long.';
  }
  if (!/[A-Z]/.test(password)) {
    return 'Password must contain at least one uppercase letter.';
  }
  if (!/[0-9]/.test(password)) {
    return 'Password must contain at least one number.';
  }
  if (!/[^A-Za-z0-9]/.test(password)) {
    return 'Password must contain at least one special character (e.g. !@#$%).';
  }
  return null;
}

/**
 * Validates that the confirm password matches the password.
 *
 * @param password - The original password.
 * @param confirmPassword - The confirmation password to compare against.
 * @returns An error message string, or null if they match.
 */
export function validateConfirmPassword(
  password: string,
  confirmPassword: string,
): string | null {
  if (!confirmPassword) {
    return 'Please confirm your password.';
  }
  if (password !== confirmPassword) {
    return 'Passwords do not match.';
  }
  return null;
}
