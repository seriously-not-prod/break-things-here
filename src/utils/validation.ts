/**
 * Validation utilities for the registration form.
 */

/** RFC 5322 basic email pattern */
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Validates an email address against a basic RFC 5322 pattern.
 *
 * @param email - The email string to validate.
 * @returns An error message string, or null if valid.
 */
export function validateEmail(email: string): string | null {
  if (!email.trim()) {
    return 'Email address is required.';
  }
  if (!EMAIL_REGEX.test(email)) {
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
