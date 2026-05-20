import { ChangeEvent, FormEvent, useEffect, useState } from 'react';

const API_BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3001';

const PASSWORD_MIN_LENGTH = 8;
const PASSWORD_PATTERN = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z\d]).{8,}$/;

function getPasswordStrength(password: string): 'weak' | 'fair' | 'strong' {
  if (password.length < PASSWORD_MIN_LENGTH) return 'weak';
  const hasLower = /[a-z]/.test(password);
  const hasUpper = /[A-Z]/.test(password);
  const hasDigit = /\d/.test(password);
  const hasSpecial = /[^A-Za-z\d]/.test(password);
  const score = [hasLower, hasUpper, hasDigit, hasSpecial].filter(Boolean).length;
  if (score <= 2) return 'weak';
  if (score === 3) return 'fair';
  return 'strong';
}

/**
 * ResetPasswordForm component — allows users to set a new password after
 * clicking the reset link from their email. Extracts the token from the
 * URL query parameter and submits the password change request.
 */
export function ResetPasswordForm(): JSX.Element {
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [newPasswordError, setNewPasswordError] = useState<string | null>(null);
  const [confirmPasswordError, setConfirmPasswordError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const resetToken = params.get('token');
    if (!resetToken) {
      setErrorMessage('Invalid or missing reset token. Please request a new password reset link.');
    } else {
      setToken(resetToken);
    }
  }, []);

  const passwordStrength = getPasswordStrength(newPassword);

  function handleNewPasswordChange(event: ChangeEvent<HTMLInputElement>): void {
    setNewPassword(event.target.value);
    if (newPasswordError) setNewPasswordError(null);
  }

  function handleConfirmPasswordChange(event: ChangeEvent<HTMLInputElement>): void {
    setConfirmPassword(event.target.value);
    if (confirmPasswordError) setConfirmPasswordError(null);
  }

  function validate(): boolean {
    let valid = true;

    if (!newPassword) {
      setNewPasswordError('New password is required.');
      valid = false;
    } else if (!PASSWORD_PATTERN.test(newPassword)) {
      setNewPasswordError(
        `Password must be at least ${PASSWORD_MIN_LENGTH} characters and include uppercase, lowercase, number, and special character.`,
      );
      valid = false;
    }

    if (!confirmPassword) {
      setConfirmPasswordError('Please confirm your new password.');
      valid = false;
    } else if (newPassword !== confirmPassword) {
      setConfirmPasswordError('Passwords do not match. Please re-enter your new password.');
      valid = false;
    }

    return valid;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setErrorMessage(null);

    if (!token) {
      setErrorMessage('Invalid reset token. Please request a new password reset link.');
      return;
    }

    if (!validate()) return;

    setIsSubmitting(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, newPassword }),
      });

      if (response.ok) {
        setSuccessMessage(
          'Your password has been reset successfully. You will be redirected to the login page.',
        );
        setTimeout(() => {
          window.location.href = '/login';
        }, 3000);
      } else {
        const data = (await response.json().catch(() => ({}))) as { message?: string };
        if (response.status === 400 && data.message?.includes('expired')) {
          setErrorMessage('Your reset link has expired. Please request a new password reset link.');
        } else if (response.status === 400 && data.message?.includes('used')) {
          setErrorMessage(
            'This reset link has already been used. Please request a new password reset link.',
          );
        } else if (response.status === 400) {
          setErrorMessage(
            data.message ?? 'Invalid request. Please check your input and try again.',
          );
        } else {
          setErrorMessage(
            'Unable to reset password. Please try again or request a new reset link.',
          );
        }
      }
    } catch (error) {
      if (error instanceof TypeError) {
        setErrorMessage('Unable to connect. Please check your internet connection and try again.');
      } else {
        setErrorMessage('An unexpected error occurred. Please try again.');
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  if (successMessage) {
    return (
      <div role="status" aria-live="polite" aria-atomic="true">
        <p>{successMessage}</p>
        <a href="/login">Go to login</a>
      </div>
    );
  }

  if (!token && errorMessage) {
    return (
      <div role="alert" aria-live="assertive">
        <p>{errorMessage}</p>
        <a href="/forgot-password">Request a new reset link</a>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} noValidate aria-labelledby="reset-password-heading">
      <h1 id="reset-password-heading">Reset your password</h1>
      <p>Enter and confirm your new password below.</p>

      <div>
        <label htmlFor="new-password">New password</label>
        <input
          id="new-password"
          type="password"
          name="newPassword"
          value={newPassword}
          onChange={handleNewPasswordChange}
          autoComplete="new-password"
          aria-required="true"
          aria-invalid={newPasswordError !== null ? 'true' : 'false'}
          aria-describedby="password-requirements new-password-strength new-password-error"
          disabled={isSubmitting}
        />
        <p id="password-requirements" aria-live="off">
          Password must be at least {PASSWORD_MIN_LENGTH} characters with uppercase, lowercase,
          number, and special character.
        </p>
        {newPassword && (
          <div
            id="new-password-strength"
            aria-live="polite"
            aria-label={`Password strength: ${passwordStrength}`}
          >
            Strength: <strong>{passwordStrength}</strong>
          </div>
        )}
        {newPasswordError && (
          <span id="new-password-error" role="alert" aria-live="assertive">
            {newPasswordError}
          </span>
        )}
      </div>

      <div>
        <label htmlFor="confirm-password">Confirm new password</label>
        <input
          id="confirm-password"
          type="password"
          name="confirmPassword"
          value={confirmPassword}
          onChange={handleConfirmPasswordChange}
          autoComplete="new-password"
          aria-required="true"
          aria-invalid={confirmPasswordError !== null ? 'true' : 'false'}
          aria-describedby={confirmPasswordError ? 'confirm-password-error' : undefined}
          disabled={isSubmitting}
        />
        {confirmPasswordError && (
          <span id="confirm-password-error" role="alert" aria-live="assertive">
            {confirmPasswordError}
          </span>
        )}
      </div>

      {errorMessage && (
        <div role="alert" aria-live="assertive">
          {errorMessage}
        </div>
      )}

      <button
        type="submit"
        disabled={isSubmitting || !token}
        aria-disabled={isSubmitting || !token}
        aria-busy={isSubmitting}
      >
        {isSubmitting ? 'Resetting...' : 'Reset password'}
      </button>
    </form>
  );
}
