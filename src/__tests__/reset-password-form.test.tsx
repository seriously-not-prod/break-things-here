import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ResetPasswordForm } from '../components/auth/reset-password-form';

const VALID_TOKEN = 'abc123def456';

describe('ResetPasswordForm', () => {
  it('renders new password, confirm password, and submit button', () => {
    render(<ResetPasswordForm token={VALID_TOKEN} />);

    expect(screen.getByLabelText(/^new password$/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^confirm new password$/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /reset password/i })).toBeInTheDocument();
  });

  it('shows error when new password is too short', async () => {
    const user = userEvent.setup();
    render(<ResetPasswordForm token={VALID_TOKEN} />);

    await user.type(screen.getByLabelText(/^new password$/i), 'Ab1!');
    await user.tab();

    expect(await screen.findByText(/at least 8 characters/i)).toBeInTheDocument();
  });

  it('shows error when new password lacks uppercase', async () => {
    const user = userEvent.setup();
    render(<ResetPasswordForm token={VALID_TOKEN} />);

    await user.type(screen.getByLabelText(/^new password$/i), 'abcdefg1!');
    await user.tab();

    expect(await screen.findByText(/uppercase letter/i)).toBeInTheDocument();
  });

  it('shows error when new password lacks a number', async () => {
    const user = userEvent.setup();
    render(<ResetPasswordForm token={VALID_TOKEN} />);

    await user.type(screen.getByLabelText(/^new password$/i), 'Abcdefgh!');
    await user.tab();

    expect(await screen.findByText(/one number/i)).toBeInTheDocument();
  });

  it('shows error when new password lacks a special character', async () => {
    const user = userEvent.setup();
    render(<ResetPasswordForm token={VALID_TOKEN} />);

    await user.type(screen.getByLabelText(/^new password$/i), 'Abcdefg1');
    await user.tab();

    expect(await screen.findByText(/special character/i)).toBeInTheDocument();
  });

  it('shows error when confirm password does not match', async () => {
    const user = userEvent.setup();
    render(<ResetPasswordForm token={VALID_TOKEN} />);

    await user.type(screen.getByLabelText(/^new password$/i), 'SecurePass1!');
    await user.type(screen.getByLabelText(/^confirm new password$/i), 'Different1!');
    await user.tab();

    expect(await screen.findByText(/passwords do not match/i)).toBeInTheDocument();
  });

  it('calls onSubmit with token and new password when valid', async () => {
    const handleSubmit = vi.fn();
    const user = userEvent.setup();
    render(<ResetPasswordForm token={VALID_TOKEN} onSubmit={handleSubmit} />);

    await user.type(screen.getByLabelText(/^new password$/i), 'NewSecure1!');
    await user.type(screen.getByLabelText(/^confirm new password$/i), 'NewSecure1!');
    await user.click(screen.getByRole('button', { name: /reset password/i }));

    await waitFor(() => {
      expect(handleSubmit).toHaveBeenCalledWith(VALID_TOKEN, 'NewSecure1!');
    });

    // Should show a success message
    expect(screen.getByText(/password has been reset successfully/i)).toBeInTheDocument();
  });

  it('does not call onSubmit when validation fails', async () => {
    const handleSubmit = vi.fn();
    const user = userEvent.setup();
    render(<ResetPasswordForm token={VALID_TOKEN} onSubmit={handleSubmit} />);

    await user.click(screen.getByRole('button', { name: /reset password/i }));

    expect(handleSubmit).not.toHaveBeenCalled();
  });

  it('displays an API error when provided', () => {
    render(<ResetPasswordForm token={VALID_TOKEN} apiError="Token has expired" />);
    expect(screen.getByText(/token has expired/i)).toBeInTheDocument();
  });

  it('shows password hint when there is no error', () => {
    render(<ResetPasswordForm token={VALID_TOKEN} />);
    expect(screen.getByText(/at least 8 characters with/i)).toBeInTheDocument();
  });
});
