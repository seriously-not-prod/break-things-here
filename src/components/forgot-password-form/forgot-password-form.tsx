import { ChangeEvent, FormEvent, useState } from 'react';

const API_BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3001';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * ForgotPasswordForm component — collects the user's email and submits a
 * password reset request. Displays a generic success message to prevent
 * user enumeration regardless of whether the email exists.
 */
export function ForgotPasswordForm(): JSX.Element {
  const [email, setEmail] = useState('');
  const [emailError, setEmailError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [networkError, setNetworkError] = useState<string | null>(null);

  function handleEmailChange(event: ChangeEvent<HTMLInputElement>): void {
    setEmail(event.target.value);
    if (emailError) {
      setEmailError(null);
    }
  }

  function validate(): boolean {
    if (!email.trim()) {
      setEmailError('Email address is required.');
      return false;
    }
    if (!EMAIL_PATTERN.test(email.trim())) {
      setEmailError('Please enter a valid email address (e.g. user@example.com).');
      return false;
    }
    return true;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setNetworkError(null);

    if (!validate()) return;

    setIsSubmitting(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
      });

      if (!response.ok && response.status >= 500) {
        throw new Error('Server error. Please try again later.');
      }

      // Always show the same generic message to prevent user enumeration
      setSuccessMessage(
        'If an account exists with that email, a reset link has been sent. Please check your inbox.',
      );
    } catch (error) {
      if (error instanceof TypeError) {
        setNetworkError('Unable to connect. Please check your internet connection and try again.');
      } else if (error instanceof Error) {
        setNetworkError(error.message);
      } else {
        setNetworkError('An unexpected error occurred. Please try again.');
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  if (successMessage) {
    return (
      <div role="status" aria-live="polite" aria-atomic="true">
        <p>{successMessage}</p>
        <a href="/login">Back to login</a>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} noValidate aria-labelledby="forgot-password-heading">
      <h1 id="forgot-password-heading">Forgot your password?</h1>
      <p>Enter your email address and we will send you a link to reset your password.</p>

      <div>
        <label htmlFor="forgot-email">Email address</label>
        <input
          id="forgot-email"
          type="email"
          name="email"
          value={email}
          onChange={handleEmailChange}
          autoComplete="email"
          aria-required="true"
          aria-invalid={emailError !== null ? 'true' : 'false'}
          aria-describedby={emailError ? 'forgot-email-error' : undefined}
          disabled={isSubmitting}
        />
        {emailError && (
          <span id="forgot-email-error" role="alert" aria-live="assertive">
            {emailError}
          </span>
        )}
      </div>

      {networkError && (
        <div role="alert" aria-live="assertive">
          {networkError}
        </div>
      )}

      <button
        type="submit"
        disabled={isSubmitting}
        aria-disabled={isSubmitting}
        aria-busy={isSubmitting}
      >
        {isSubmitting ? 'Sending...' : 'Send reset link'}
      </button>

      <a href="/login">Back to login</a>
    </form>
  );
}
