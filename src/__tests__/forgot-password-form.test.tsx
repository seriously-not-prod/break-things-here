import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ForgotPasswordForm } from '../components/auth/forgot-password-form';

describe('ForgotPasswordForm', () => {
  it('renders email input and submit button', () => {
    render(<ForgotPasswordForm />);

    expect(screen.getByLabelText(/email address/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /send reset link/i })).toBeInTheDocument();
  });

  it('shows validation error when email is empty on submit', async () => {
    const user = userEvent.setup();
    render(<ForgotPasswordForm />);

    await user.click(screen.getByRole('button', { name: /send reset link/i }));

    expect(await screen.findByText(/email address is required/i)).toBeInTheDocument();
  });

  it('shows validation error for an invalid email on blur', async () => {
    const user = userEvent.setup();
    render(<ForgotPasswordForm />);

    await user.type(screen.getByLabelText(/email address/i), 'bad');
    await user.tab();

    expect(await screen.findByText(/valid email address/i)).toBeInTheDocument();
  });

  it('calls onSubmit with lowercase email and shows success message', async () => {
    const handleSubmit = vi.fn();
    const user = userEvent.setup();
    render(<ForgotPasswordForm onSubmit={handleSubmit} />);

    await user.type(screen.getByLabelText(/email address/i), 'Alice@Example.COM');
    await user.click(screen.getByRole('button', { name: /send reset link/i }));

    await waitFor(() => {
      expect(handleSubmit).toHaveBeenCalledWith('alice@example.com');
    });

    // Should show a generic success message (no enumeration leak)
    expect(screen.getByText(/reset link has been sent/i)).toBeInTheDocument();
  });

  it('does not call onSubmit when email is invalid', async () => {
    const handleSubmit = vi.fn();
    const user = userEvent.setup();
    render(<ForgotPasswordForm onSubmit={handleSubmit} />);

    await user.type(screen.getByLabelText(/email address/i), 'no-at-sign');
    await user.click(screen.getByRole('button', { name: /send reset link/i }));

    expect(handleSubmit).not.toHaveBeenCalled();
  });

  it('displays an API error when provided', () => {
    render(<ForgotPasswordForm apiError="Server error, please try again." />);
    expect(screen.getByText(/server error/i)).toBeInTheDocument();
  });

  it('has a Back to login link', () => {
    render(<ForgotPasswordForm />);
    expect(screen.getByRole('link', { name: /back to login/i })).toHaveAttribute(
      'href',
      '/login',
    );
  });
});
