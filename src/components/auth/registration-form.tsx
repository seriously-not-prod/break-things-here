import { useState, ChangeEvent, FocusEvent, FormEvent } from 'react';
import '../../styles/registration.css';
import { validateEmail, validatePassword, validateConfirmPassword } from '../../utils/validation';

interface FormFields {
  displayName: string;
  email: string;
  password: string;
  confirmPassword: string;
}

interface FormErrors {
  email: string | null;
  password: string | null;
  confirmPassword: string | null;
}

const initialFields: FormFields = {
  displayName: '',
  email: '',
  password: '',
  confirmPassword: '',
};

const initialErrors: FormErrors = {
  email: null,
  password: null,
  confirmPassword: null,
};

export function RegistrationForm() {
  const [fields, setFields] = useState<FormFields>(initialFields);
  const [errors, setErrors] = useState<FormErrors>(initialErrors);
  const [submitted, setSubmitted] = useState(false);

  function getFieldError(name: keyof FormErrors, value: string): string | null {
    switch (name) {
      case 'email':
        return validateEmail(value);
      case 'password':
        return validatePassword(value);
      case 'confirmPassword':
        return validateConfirmPassword(fields.password, value);
      default:
        return null;
    }
  }

  function handleChange(e: ChangeEvent<HTMLInputElement>) {
    const { name, value } = e.target;
    setFields((prev) => ({ ...prev, [name]: value }));

    if (submitted && name in errors) {
      const fieldName = name as keyof FormErrors;
      const error =
        fieldName === 'confirmPassword'
          ? validateConfirmPassword(
              fieldName === 'confirmPassword' ? fields.password : value,
              value,
            )
          : getFieldError(fieldName, value);
      setErrors((prev) => ({ ...prev, [fieldName]: error }));
    }
  }

  function handleBlur(e: FocusEvent<HTMLInputElement>) {
    const { name, value } = e.target;
    if (name in errors) {
      const fieldName = name as keyof FormErrors;
      setErrors((prev) => ({
        ...prev,
        [fieldName]: getFieldError(fieldName, value),
      }));
    }
  }

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitted(true);

    const emailError = validateEmail(fields.email);
    const passwordError = validatePassword(fields.password);
    const confirmError = validateConfirmPassword(fields.password, fields.confirmPassword);

    const newErrors: FormErrors = {
      email: emailError,
      password: passwordError,
      confirmPassword: confirmError,
    };
    setErrors(newErrors);

    const hasErrors = emailError !== null || passwordError !== null || confirmError !== null;
    if (hasErrors) {
      return;
    }

    // Form is valid — submission logic handled by parent or API layer
  }

  const errorEntries = Object.values(errors);
  const hasValidationErrors = errorEntries.some((e) => e !== null);

  return (
    <form className="registration-form" onSubmit={handleSubmit} noValidate aria-label="User registration form">
      <div>
        <label htmlFor="displayName">Display name</label>
        <input
          id="displayName"
          name="displayName"
          type="text"
          value={fields.displayName}
          onChange={handleChange}
          autoComplete="name"
          aria-label="Display name"
          aria-required="true"
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
          onBlur={handleBlur}
          autoComplete="email"
          aria-label="Email address"
          aria-required="true"
          aria-invalid={errors.email !== null}
          aria-describedby={errors.email ? 'email-error' : undefined}
        />
        {errors.email && (
          <span id="email-error" role="alert" aria-live="polite">
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
          autoComplete="new-password"
          aria-label="Password"
          aria-required="true"
          aria-invalid={errors.password !== null}
          aria-describedby={errors.password ? 'password-error' : undefined}
        />
        {errors.password && (
          <span id="password-error" role="alert" aria-live="polite">
            {errors.password}
          </span>
        )}
      </div>

      <div>
        <label htmlFor="confirmPassword">Confirm password</label>
        <input
          id="confirmPassword"
          name="confirmPassword"
          type="password"
          value={fields.confirmPassword}
          onChange={handleChange}
          onBlur={handleBlur}
          autoComplete="new-password"
          aria-label="Confirm password"
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

      <button type="submit" disabled={submitted && hasValidationErrors}>
        Create account
      </button>
    </form>
  );
}
