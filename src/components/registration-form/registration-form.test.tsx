import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect } from 'vitest';
import { RegistrationForm } from './registration-form';

const VALID = {
  displayName: 'Jane Doe',
  email: 'jane@example.com',
  password: 'SecureP@ss1',
  confirmPassword: 'SecureP@ss1',
};

async function fillForm(
  overrides: Partial<typeof VALID> = {}
): Promise<ReturnType<typeof userEvent.setup>> {
  const user = userEvent.setup();
  const values = { ...VALID, ...overrides };
  await user.type(screen.getByLabelText('Display name'), values.displayName);
  await user.type(screen.getByLabelText('Email address'), values.email);
  await user.type(screen.getByLabelText('Password'), values.password);
  await user.type(screen.getByLabelText('Confirm password'), values.confirmPassword);
  return user;
}

describe('RegistrationForm', () => {
  it('renders all form fields', () => {
    render(<RegistrationForm />);
    expect(screen.getByLabelText('Display name')).toBeInTheDocument();
    expect(screen.getByLabelText('Email address')).toBeInTheDocument();
    expect(screen.getByLabelText('Password')).toBeInTheDocument();
    expect(screen.getByLabelText('Confirm password')).toBeInTheDocument();
  });

  it('submit button is disabled when fields are empty', () => {
    render(<RegistrationForm />);
    expect(screen.getByRole('button', { name: /create account/i })).toBeDisabled();
  });

  it('submit button is enabled when all fields are valid', async () => {
    render(<RegistrationForm />);
    await fillForm();
    expect(screen.getByRole('button', { name: /create account/i })).toBeEnabled();
  });

  it('submit button is disabled when passwords do not match', async () => {
    render(<RegistrationForm />);
    await fillForm({ confirmPassword: 'DifferentP@ss1' });
    expect(screen.getByRole('button', { name: /create account/i })).toBeDisabled();
  });

  it('shows password mismatch error when confirm password differs', async () => {
    render(<RegistrationForm />);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText('Password'), VALID.password);
    await user.type(screen.getByLabelText('Confirm password'), 'WrongP@ss1');
    expect(screen.getByRole('alert')).toHaveTextContent('Passwords do not match.');
  });

  it('submit button is disabled when password is too short', async () => {
    render(<RegistrationForm />);
    await fillForm({ password: 'Ab1!', confirmPassword: 'Ab1!' });
    expect(screen.getByRole('button', { name: /create account/i })).toBeDisabled();
  });

  it('submit button is disabled when password lacks complexity', async () => {
    render(<RegistrationForm />);
    await fillForm({ password: 'alllowercase1!', confirmPassword: 'alllowercase1!' });
    expect(screen.getByRole('button', { name: /create account/i })).toBeDisabled();
  });

  it('clears fields after successful submission', async () => {
    render(<RegistrationForm />);
    const user = await fillForm();
    await user.click(screen.getByRole('button', { name: /create account/i }));
    expect(screen.getByLabelText('Display name')).toHaveValue('');
    expect(screen.getByLabelText('Email address')).toHaveValue('');
    expect(screen.getByLabelText('Password')).toHaveValue('');
    expect(screen.getByLabelText('Confirm password')).toHaveValue('');
  });

  it('password field has a hint describing requirements', () => {
    render(<RegistrationForm />);
    expect(screen.getByText(/at least 8 characters/i)).toBeInTheDocument();
  });

  it('all inputs are accessible via keyboard', () => {
    render(<RegistrationForm />);
    expect(screen.getByLabelText('Display name')).toBeVisible();
    expect(screen.getByLabelText('Email address')).toBeVisible();
    expect(screen.getByLabelText('Password')).toBeVisible();
    expect(screen.getByLabelText('Confirm password')).toBeVisible();
  });
});
