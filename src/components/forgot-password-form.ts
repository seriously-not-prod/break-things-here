/**
 * Forgot Password Form handler
 *
 * Handles client-side logic for the forgot password request form.
 * Displays a generic success message regardless of whether the email exists
 * to prevent user enumeration.
 */

export interface ForgotPasswordFormState {
  email: string;
  isLoading: boolean;
  successMessage: string | null;
  errorMessage: string | null;
}

export interface ForgotPasswordFormResult {
  success: boolean;
  message: string;
}

/** Generic success message — identical regardless of email existence (prevents enumeration) */
export const GENERIC_SUCCESS_MESSAGE =
  "If an account exists with that email, a reset link has been sent.";

/** ARIA labels for all interactive elements */
export const ARIA_LABELS = {
  emailInput: 'Email address',
  submitButton: 'Send password reset link',
  successAlert: 'Password reset request success message',
  errorAlert: 'Password reset request error message',
} as const;

/** Password requirements to display in the UI */
export const PASSWORD_REQUIREMENTS = [
  'At least 8 characters long',
  'At least one uppercase letter',
  'At least one number',
] as const;

/**
 * Returns the initial state for the forgot password form.
 */
export function createInitialState(): ForgotPasswordFormState {
  return {
    email: '',
    isLoading: false,
    successMessage: null,
    errorMessage: null,
  };
}

/**
 * Validates an email address.
 *
 * @param email - The email string to validate
 * @returns An error message string if invalid, or null if valid
 */
export function validateEmail(email: string): string | null {
  if (!email || email.trim().length === 0) {
    return 'Email address is required';
  }
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email.trim())) {
    return 'Please enter a valid email address';
  }
  return null;
}

/**
 * Handles submission of the forgot password request form.
 *
 * Always returns a generic success message (even on errors) to
 * prevent user enumeration attacks.
 *
 * @param email - The submitted email address
 * @param onRequest - Async function that performs the actual reset request
 * @returns ForgotPasswordFormResult with success flag and message
 */
export async function submitForgotPasswordRequest(
  email: string,
  onRequest: (email: string) => Promise<void>
): Promise<ForgotPasswordFormResult> {
  const validationError = validateEmail(email);
  if (validationError) {
    return { success: false, message: validationError };
  }

  try {
    await onRequest(email.trim().toLowerCase());
  } catch (_error) {
    // Swallow errors and return generic success to prevent enumeration
  }

  return { success: true, message: GENERIC_SUCCESS_MESSAGE };
}
