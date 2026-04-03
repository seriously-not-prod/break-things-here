import { useState, ChangeEvent, FormEvent } from 'react';
import { validateEmail } from '../../utils/validation';

interface ForgotPasswordFields {
  email: string;
}

interface ForgotPasswordFormProps {
  /** Called with the submitted email when the form passes validation */
  onSubmit?: (email: string) => void | Promise<void>;
  /** Optional external error from the API */
  apiError?: string | null;
}

/**
 * Accessible forgot-password form component.
 *
 * - Accepts an email address and validates its format.
 * - Shows a generic success message so the response never reveals
 *   whether the email is registered (prevents user enumeration).
 * - Delegates submission to the onSubmit prop.
 */
export function ForgotPasswordForm({ onSubmit, apiError }: ForgotPasswordFormProps) {
  const [fields, setFields] = useState<ForgotPasswordFields>({ email: '' });
  const [emailError, setEmailError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  function handleChange(e: ChangeEvent<HTMLInputElement>) {
    const { value } = e.target;
    setFields({ email: value });

    if (submitted) {
      setEmailError(validateEmail(value));
    }
  }

  function handleBlur(e: ChangeEvent<HTMLInputElement>) {
    setEmailError(validateEmail(e.target.value));
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitted(true);

    const error = validateEmail(fields.email);
    setEmailError(error);

    if (error) return;

    await onSubmit?.(fields.email.toLowerCase());

    // Display a generic success message whether or not the email was found
    setSuccessMessage(
      'If that email is registered, a password reset link has been sent. Please check your inbox.',
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
    <form onSubmit={handleSubmit} noValidate aria-label="Forgot password form">
      <div>
        <label htmlFor="forgot-email">Email address</label>
        <input
          id="forgot-email"
          name="email"
          type="email"
          value={fields.email}
          onChange={handleChange}
          onBlur={handleBlur}
          autoComplete="email"
          aria-label="Email address"
          aria-required="true"
          aria-invalid={emailError !== null}
          aria-describedby={emailError ? 'forgot-email-error' : undefined}
        />
        {emailError && (
          <span id="forgot-email-error" role="alert" aria-live="polite">
            {emailError}
          </span>
        )}
      </div>

      {apiError && (
        <p role="alert" aria-live="assertive">
          {apiError}
        </p>
      )}

      <button type="submit" disabled={submitted && emailError !== null}>
        Send reset link
      </button>

      <a href="/login" aria-label="Back to login">
        Back to login
      </a>
    </form>
  );
}
