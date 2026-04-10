import { useState, ChangeEvent, FormEvent } from 'react';
import { validateEmail } from '../../utils/validation';

interface LoginFields {
  email: string;
  password: string;
  rememberMe: boolean;
}

interface LoginErrors {
  email: string | null;
  password: string | null;
}

interface LoginFormProps {
  /** Called with {email, password, rememberMe} when the form passes validation */
  onSubmit?: (fields: Omit<LoginFields, never>) => void | Promise<void>;
  /** Optional external error (e.g. from the API response) */
  apiError?: string | null;
}

const initialFields: LoginFields = {
  email: '',
  password: '',
  rememberMe: false,
};

const initialErrors: LoginErrors = {
  email: null,
  password: null,
};

/**
 * Accessible login form component.
 *
 * - Validates email format and password presence on submit and on blur.
 * - Displays field-level ARIA errors for screen readers.
 * - Supports a "Remember me" checkbox for persistent sessions.
 * - Delegates submission logic to the onSubmit prop.
 */
export function LoginForm({ onSubmit, apiError }: LoginFormProps) {
  const [fields, setFields] = useState<LoginFields>(initialFields);
  const [errors, setErrors] = useState<LoginErrors>(initialErrors);
  const [submitted, setSubmitted] = useState(false);

  function validateField(name: keyof LoginErrors, value: string): string | null {
    if (name === 'email') return validateEmail(value);
    if (name === 'password') return value.trim() ? null : 'Password is required.';
    return null;
  }

  function handleChange(e: ChangeEvent<HTMLInputElement>) {
    const { name, value, type, checked } = e.target;
    const fieldValue = type === 'checkbox' ? checked : value;

    setFields((prev) => ({ ...prev, [name]: fieldValue }));

    if (submitted && name in initialErrors) {
      const fieldName = name as keyof LoginErrors;
      setErrors((prev) => ({
        ...prev,
        [fieldName]: validateField(fieldName, value),
      }));
    }
  }

  function handleBlur(e: ChangeEvent<HTMLInputElement>) {
    const { name, value } = e.target;
    if (name in initialErrors) {
      const fieldName = name as keyof LoginErrors;
      setErrors((prev) => ({
        ...prev,
        [fieldName]: validateField(fieldName, value),
      }));
    }
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitted(true);

    const emailError = validateEmail(fields.email);
    const passwordError = fields.password.trim() ? null : 'Password is required.';

    const newErrors: LoginErrors = { email: emailError, password: passwordError };
    setErrors(newErrors);

    const hasErrors = emailError !== null || passwordError !== null;
    if (hasErrors) return;

    await onSubmit?.(fields);
  }

  const hasValidationErrors = Object.values(errors).some((e) => e !== null);

  return (
    <form onSubmit={handleSubmit} noValidate aria-label="Login form">
      <div>
        <label htmlFor="email">Email address</label>
        <input
          id="email"
          name="email"
          type="email"
          value={fields.email}
          onChange={handleChange}
          onBlur={handleBlur}
          autoComplete="email"
          aria-label="Email address"
          aria-required="true"
          aria-invalid={errors.email !== null}
          aria-describedby={errors.email ? 'login-email-error' : undefined}
        />
        {errors.email && (
          <span id="login-email-error" role="alert" aria-live="polite">
            {errors.email}
          </span>
        )}
      </div>

      <div>
        <label htmlFor="password">Password</label>
        <input
          id="password"
          name="password"
          type="password"
          value={fields.password}
          onChange={handleChange}
          onBlur={handleBlur}
          autoComplete="current-password"
          aria-label="Password"
          aria-required="true"
          aria-invalid={errors.password !== null}
          aria-describedby={errors.password ? 'login-password-error' : undefined}
        />
        {errors.password && (
          <span id="login-password-error" role="alert" aria-live="polite">
            {errors.password}
          </span>
        )}
      </div>

      <div>
        <label>
          <input
            name="rememberMe"
            type="checkbox"
            checked={fields.rememberMe}
            onChange={handleChange}
            aria-label="Remember me"
          />
          {' '}Remember me
        </label>
      </div>

      {apiError && (
        <p role="alert" aria-live="assertive">
          {apiError}
        </p>
      )}

      <a href="/forgot-password" aria-label="Forgot your password?">
        Forgot password?
      </a>

      <button type="submit" disabled={submitted && hasValidationErrors}>
        Log in
      </button>
    </form>
  );
}
