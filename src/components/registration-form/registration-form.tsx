import { useState, ChangeEvent, FormEvent, ReactElement } from 'react';
import '../../styles/registration.css';

interface FormFields {
  displayName: string;
  email: string;
  password: string;
  confirmPassword: string;
}

const initialFields: FormFields = {
  displayName: '',
  email: '',
  password: '',
  confirmPassword: '',
};

const PASSWORD_MIN_LENGTH = 8;
const PASSWORD_PATTERN = new RegExp(
  `^(?=.*[a-z])(?=.*[A-Z])(?=.*\\d)(?=.*[^A-Za-z\\d]).{${PASSWORD_MIN_LENGTH},}$`,
);

function isValidPassword(value: string): boolean {
  return PASSWORD_PATTERN.test(value);
}

/**
 * Safe linear-time email validator — avoids ReDoS from polynomial backtracking.
 */
function isValidEmail(value: string): boolean {
  const at = value.indexOf('@');
  if (at <= 0 || at !== value.lastIndexOf('@')) return false;
  const local = value.slice(0, at);
  const domain = value.slice(at + 1);
  if (!local || !domain) return false;
  const dot = domain.lastIndexOf('.');
  if (dot <= 0 || dot === domain.length - 1) return false;
  return !local.includes(' ') && !domain.includes(' ');
}

export function RegistrationForm(): ReactElement {
  const [fields, setFields] = useState<FormFields>(initialFields);

  const passwordsMatch = fields.password === fields.confirmPassword;
  const isFormValid =
    fields.displayName.trim() !== '' &&
    isValidEmail(fields.email) &&
    isValidPassword(fields.password) &&
    fields.confirmPassword !== '' &&
    passwordsMatch;

  function handleChange(e: ChangeEvent<HTMLInputElement>): void {
    const { name, value } = e.target;
    if (!(name in initialFields)) return;
    setFields((prev) => ({ ...prev, [name as keyof FormFields]: value }));
  }

  function handleSubmit(e: FormEvent<HTMLFormElement>): void {
    e.preventDefault();
    // Validation and submission handled by parent / #21
    setFields(initialFields);
  }

  return (
    <form
      className="registration-form"
      onSubmit={handleSubmit}
      noValidate
      aria-label="User registration form"
    >
      <div>
        <label htmlFor="displayName">Display name</label>
        <input
          id="displayName"
          name="displayName"
          type="text"
          value={fields.displayName}
          onChange={handleChange}
          autoComplete="name"
          required
        />
      </div>

      <div>
        <label htmlFor="email">Email address</label>
        <input
          id="email"
          name="email"
          type="email"
          value={fields.email}
          onChange={handleChange}
          autoComplete="email"
          aria-describedby="email-hint"
          required
        />
        <span id="email-hint">Enter a valid email address.</span>
      </div>

      <div>
        <label htmlFor="password">Password</label>
        <input
          id="password"
          name="password"
          type="password"
          value={fields.password}
          onChange={handleChange}
          autoComplete="new-password"
          aria-describedby="password-hint"
          required
        />
        <span id="password-hint">
          At least 8 characters with uppercase, lowercase, number and special character.
        </span>
      </div>

      <div>
        <label htmlFor="confirmPassword">Confirm password</label>
        <input
          id="confirmPassword"
          name="confirmPassword"
          type="password"
          value={fields.confirmPassword}
          onChange={handleChange}
          autoComplete="new-password"
          required
        />
        {fields.confirmPassword !== '' && !passwordsMatch && (
          <span role="alert" aria-live="polite">
            Passwords do not match.
          </span>
        )}
      </div>

      <p>
        By registering, you agree to our <a href="/privacy-policy">Privacy Policy</a>.
      </p>

      <button type="submit" disabled={!isFormValid}>
        Create account
      </button>

      {!isFormValid && fields.displayName !== '' && (
        <span role="status" aria-live="polite">
          Please fill in all fields correctly to continue.
        </span>
      )}
    </form>
  );
}
