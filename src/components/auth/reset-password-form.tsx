import { useState, ChangeEvent, FormEvent } from 'react';
import { validatePassword, validateConfirmPassword } from '../../utils/validation';

interface ResetPasswordFields {
  newPassword: string;
  confirmPassword: string;
}

interface ResetPasswordErrors {
  newPassword: string | null;
  confirmPassword: string | null;
}

interface ResetPasswordFormProps {
  /** The reset token extracted from the URL query string */
  token: string;
  /** Called with { token, newPassword } when the form passes validation */
  onSubmit?: (token: string, newPassword: string) => void | Promise<void>;
  /** Optional external error from the API */
  apiError?: string | null;
}

const initialFields: ResetPasswordFields = {
  newPassword: '',
  confirmPassword: '',
};

const initialErrors: ResetPasswordErrors = {
  newPassword: null,
  confirmPassword: null,
};

/**
 * Accessible reset-password form component.
 *
 * - Enforces password strength requirements (min 8 chars, uppercase, number, special char).
 * - Validates that both password fields match.
 * - Displays field-level ARIA errors for screen readers.
 * - Delegates submission to the onSubmit prop with the token and new password.
 */
export function ResetPasswordForm({ token, onSubmit, apiError }: ResetPasswordFormProps) {
  const [fields, setFields] = useState<ResetPasswordFields>(initialFields);
  const [errors, setErrors] = useState<ResetPasswordErrors>(initialErrors);
  const [submitted, setSubmitted] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  function validateField(name: keyof ResetPasswordErrors, value: string): string | null {
    if (name === 'newPassword') return validatePassword(value);
    if (name === 'confirmPassword')
      return validateConfirmPassword(fields.newPassword, value);
    return null;
  }

  function handleChange(e: ChangeEvent<HTMLInputElement>) {
    const { name, value } = e.target;

    setFields((prev) => ({ ...prev, [name]: value }));

    if (submitted && name in initialErrors) {
      const fieldName = name as keyof ResetPasswordErrors;
      setErrors((prev) => ({
        ...prev,
        [fieldName]: validateField(fieldName, value),
      }));
    }
  }

  function handleBlur(e: ChangeEvent<HTMLInputElement>) {
    const { name, value } = e.target;
    if (name in initialErrors) {
      const fieldName = name as keyof ResetPasswordErrors;
      setErrors((prev) => ({
        ...prev,
        [fieldName]: validateField(fieldName, value),
      }));
    }
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitted(true);

    const newPasswordError = validatePassword(fields.newPassword);
    const confirmError = validateConfirmPassword(fields.newPassword, fields.confirmPassword);

    const newErrors: ResetPasswordErrors = {
      newPassword: newPasswordError,
      confirmPassword: confirmError,
    };
    setErrors(newErrors);

    const hasErrors = newPasswordError !== null || confirmError !== null;
    if (hasErrors) return;

    await onSubmit?.(token, fields.newPassword);
    setSuccessMessage(
      'Your password has been reset successfully. You can now log in with your new password.',
    );
  }

  if (successMessage) {
    return (
      <p role="status" aria-live="polite">
        {successMessage}
      </p>
    );
  }

  return (
    <form onSubmit={handleSubmit} noValidate aria-label="Reset password form">
      <div>
        <label htmlFor="newPassword">New password</label>
        <input
          id="newPassword"
          name="newPassword"
          type="password"
          value={fields.newPassword}
          onChange={handleChange}
          onBlur={handleBlur}
          autoComplete="new-password"
          aria-label="New password"
          aria-required="true"
          aria-invalid={errors.newPassword !== null}
          aria-describedby={
            errors.newPassword ? 'new-password-error' : 'new-password-hint'
          }
        />
        {errors.newPassword ? (
          <span id="new-password-error" role="alert" aria-live="polite">
            {errors.newPassword}
          </span>
        ) : (
          <span id="new-password-hint">
            At least 8 characters with uppercase, lowercase, number and special character.
          </span>
        )}
      </div>

      <div>
        <label htmlFor="confirmPassword">Confirm new password</label>
        <input
          id="confirmPassword"
          name="confirmPassword"
          type="password"
          value={fields.confirmPassword}
          onChange={handleChange}
          onBlur={handleBlur}
          autoComplete="new-password"
          aria-label="Confirm new password"
          aria-required="true"
          aria-invalid={errors.confirmPassword !== null}
          aria-describedby={errors.confirmPassword ? 'confirm-password-error' : undefined}
        />
        {errors.confirmPassword && (
          <span id="confirm-password-error" role="alert" aria-live="polite">
            {errors.confirmPassword}
          </span>
        )}
      </div>

      {apiError && (
        <p role="alert" aria-live="assertive">
          {apiError}
        </p>
      )}

      <button
        type="submit"
        disabled={submitted && Object.values(errors).some((e) => e !== null)}
      >
        Reset password
      </button>
    </form>
  );
}
