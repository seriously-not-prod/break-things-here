/**
 * Reset Password Form handler
 *
 * Handles client-side logic for the password reset form. The reset token
 * is extracted from the URL query string and submitted with the new password.
 */

export interface ResetPasswordFormState {
  newPassword: string;
  confirmPassword: string;
  resetToken: string;
  isLoading: boolean;
  successMessage: string | null;
  errorMessage: string | null;
}

export interface ResetPasswordFormResult {
  success: boolean;
  message: string;
}

export interface PasswordStrengthResult {
  isValid: boolean;
  errors: string[];
}

/** ARIA labels for all interactive elements */
export const ARIA_LABELS = {
  newPasswordInput: 'New password',
  confirmPasswordInput: 'Confirm new password',
  submitButton: 'Reset password',
  successAlert: 'Password reset successful',
  errorAlert: 'Password reset error message',
  strengthIndicator: 'Password strength indicator',
} as const;

/** Password requirements for display */
export const PASSWORD_REQUIREMENTS = [
  'At least 8 characters long',
  'At least one uppercase letter',
  'At least one number',
  'At least one special character (e.g. !@#$%)',
] as const;

/**
 * Returns the initial state for the reset password form.
 */
export function createInitialState(): ResetPasswordFormState {
  return {
    newPassword: '',
    confirmPassword: '',
    resetToken: '',
    isLoading: false,
    successMessage: null,
    errorMessage: null,
  };
}

/**
 * Extracts the reset token from a URL query string.
 *
 * @param queryString - The URL query string (e.g. "?token=abc123")
 * @returns The token value, or null if not present
 */
export function extractTokenFromQueryString(queryString: string): string | null {
  const params = new URLSearchParams(queryString);
  const token = params.get('token');
  return token && token.trim().length > 0 ? token.trim() : null;
}

/**
 * Validates that two password values match.
 *
 * @returns An error message if they don't match, or null if they do
 */
export function validatePasswordMatch(newPassword: string, confirmPassword: string): string | null {
  if (newPassword !== confirmPassword) {
    return 'Passwords do not match';
  }
  return null;
}

/**
 * Checks password strength against minimum requirements.
 *
 * @param password - The password to evaluate
 * @returns PasswordStrengthResult with validity flag and list of errors
 */
export function checkPasswordStrength(password: string): PasswordStrengthResult {
  const errors: string[] = [];

  if (!password || password.length < 8) {
    errors.push('Password must be at least 8 characters long');
  }
  if (!/[A-Z]/.test(password)) {
    errors.push('Password must contain at least one uppercase letter');
  }
  if (!/[0-9]/.test(password)) {
    errors.push('Password must contain at least one number');
  }
  if (!/[^A-Za-z0-9]/.test(password)) {
    errors.push('Password must contain at least one special character (e.g. !@#$%)');
  }

  return { isValid: errors.length === 0, errors };
}

/**
 * Handles submission of the reset password form.
 *
 * Validates that the token is present, passwords match, and the new
 * password meets strength requirements before calling the reset handler.
 *
 * @param token - The reset token from the URL
 * @param newPassword - The new password entered by the user
 * @param confirmPassword - The confirmation password
 * @param onReset - Async function that performs the actual password reset
 * @returns ResetPasswordFormResult with success flag and message
 */
export async function submitPasswordReset(
  token: string,
  newPassword: string,
  confirmPassword: string,
  onReset: (token: string, newPassword: string) => Promise<void>,
): Promise<ResetPasswordFormResult> {
  if (!token || token.trim().length === 0) {
    return {
      success: false,
      message: 'Reset token is missing or invalid. Please request a new password reset link.',
    };
  }

  const matchError = validatePasswordMatch(newPassword, confirmPassword);
  if (matchError) {
    return { success: false, message: matchError };
  }

  const strength = checkPasswordStrength(newPassword);
  if (!strength.isValid) {
    return { success: false, message: strength.errors[0] };
  }

  try {
    await onReset(token.trim(), newPassword);
    return {
      success: true,
      message:
        'Your password has been reset successfully. You can now log in with your new password.',
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'An unexpected error occurred. Please try again.';
    return { success: false, message };
  }
}
