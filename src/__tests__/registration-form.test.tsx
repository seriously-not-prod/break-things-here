import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { RegistrationForm } from '../components/registration-form/registration-form';

afterEach(cleanup);

// ─── Helpers ──────────────────────────────────────────────────────────────────

function renderForm() {
  return render(<RegistrationForm />);
}

// Valid password satisfies: ≥8 chars, uppercase, lowercase, digit, special char
const VALID_PASSWORD = 'Festival@1';

/** Fill every field with valid values. */
async function fillValidForm(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText(/display name/i), 'Alice Smith');
  await user.type(screen.getByLabelText(/email address/i), 'alice@festival.local');
  await user.type(screen.getByLabelText(/^password$/i), VALID_PASSWORD);
  await user.type(screen.getByLabelText(/confirm password/i), VALID_PASSWORD);
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('RegistrationForm', () => {
  it('renders all four input fields and the submit button', () => {
    renderForm();

    expect(screen.getByLabelText(/display name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/email address/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^password$/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/confirm password/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /create account/i })).toBeInTheDocument();
  });

  it('has the correct accessible form label', () => {
    renderForm();
    expect(screen.getByRole('form', { name: /user registration form/i })).toBeInTheDocument();
  });

  it('disables submit when all fields are empty', () => {
    renderForm();
    expect(screen.getByRole('button', { name: /create account/i })).toBeDisabled();
  });

  it('disables submit when the email is invalid', async () => {
    const user = userEvent.setup();
    renderForm();

    await user.type(screen.getByLabelText(/display name/i), 'Alice');
    await user.type(screen.getByLabelText(/email address/i), 'not-an-email');
    await user.type(screen.getByLabelText(/^password$/i), VALID_PASSWORD);
    await user.type(screen.getByLabelText(/confirm password/i), VALID_PASSWORD);

    expect(screen.getByRole('button', { name: /create account/i })).toBeDisabled();
  });

  it('disables submit when the password does not satisfy requirements', async () => {
    const user = userEvent.setup();
    renderForm();

    await user.type(screen.getByLabelText(/display name/i), 'Alice');
    await user.type(screen.getByLabelText(/email address/i), 'alice@festival.local');
    await user.type(screen.getByLabelText(/^password$/i), 'weak');
    await user.type(screen.getByLabelText(/confirm password/i), 'weak');

    expect(screen.getByRole('button', { name: /create account/i })).toBeDisabled();
  });

  it('shows a password mismatch error when confirmPassword differs', async () => {
    const user = userEvent.setup();
    renderForm();

    await user.type(screen.getByLabelText(/^password$/i), VALID_PASSWORD);
    await user.type(screen.getByLabelText(/confirm password/i), 'Different@1');

    expect(screen.getByRole('alert')).toHaveTextContent(/passwords do not match/i);
  });

  it('does not show a mismatch error when passwords match', async () => {
    const user = userEvent.setup();
    renderForm();

    await user.type(screen.getByLabelText(/^password$/i), VALID_PASSWORD);
    await user.type(screen.getByLabelText(/confirm password/i), VALID_PASSWORD);

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('enables submit when all fields are valid', async () => {
    const user = userEvent.setup();
    renderForm();

    await fillValidForm(user);

    expect(screen.getByRole('button', { name: /create account/i })).toBeEnabled();
  });

  it('resets all fields to empty after a successful submit', async () => {
    const user = userEvent.setup();
    renderForm();

    await fillValidForm(user);
    await user.click(screen.getByRole('button', { name: /create account/i }));

    expect(screen.getByLabelText(/display name/i)).toHaveValue('');
    expect(screen.getByLabelText(/email address/i)).toHaveValue('');
    expect(screen.getByLabelText(/^password$/i)).toHaveValue('');
    expect(screen.getByLabelText(/confirm password/i)).toHaveValue('');
  });

  it('does not show the mismatch alert when confirmPassword is empty', () => {
    renderForm();
    // confirmPassword starts empty — no alert should be visible
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
