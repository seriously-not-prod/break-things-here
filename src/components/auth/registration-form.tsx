import { useState, ChangeEvent, FormEvent } from 'react';

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

export function RegistrationForm() {
  const [fields, setFields] = useState<FormFields>(initialFields);

  const isFormFilled =
    fields.displayName.trim() !== '' &&
    fields.email.trim() !== '' &&
    fields.password !== '' &&
    fields.confirmPassword !== '';

  function handleChange(e: ChangeEvent<HTMLInputElement>) {
    const { name, value } = e.target;
    setFields((prev) => ({ ...prev, [name]: value }));
  }

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    // Validation and submission handled by parent / #21
  }

  return (
    <form onSubmit={handleSubmit} noValidate aria-label="User registration form">
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
          autoComplete="email"
          aria-label="Email address"
          aria-required="true"
        />
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
          aria-label="Password"
          aria-required="true"
        />
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
          aria-label="Confirm password"
          aria-required="true"
        />
      </div>

      <button type="submit" disabled={!isFormFilled}>
        Create account
      </button>
    </form>
  );
}
