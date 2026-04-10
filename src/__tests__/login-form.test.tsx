import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LoginForm } from '../components/auth/login-form';

describe('LoginForm', () => {
  it('renders email, password, remember-me, and submit button', () => {
    render(<LoginForm />);

    expect(screen.getByLabelText(/email address/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^password$/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/remember me/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /log in/i })).toBeInTheDocument();
  });

  it('shows validation error when email is empty on submit', async () => {
    const user = userEvent.setup();
    render(<LoginForm />);

    await user.click(screen.getByRole('button', { name: /log in/i }));

    const alerts = await screen.findAllByRole('alert');
    expect(alerts.length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/email address is required/i)).toBeInTheDocument();
  });

  it('shows validation error when password is empty on submit', async () => {
    const user = userEvent.setup();
    render(<LoginForm />);

    await user.type(screen.getByLabelText(/email address/i), 'user@example.com');
    await user.click(screen.getByRole('button', { name: /log in/i }));

    expect(screen.getByText(/password is required/i)).toBeInTheDocument();
  });

  it('shows validation error for an invalid email format', async () => {
    const user = userEvent.setup();
    render(<LoginForm />);

    const emailInput = screen.getByLabelText(/email address/i);
    await user.type(emailInput, 'not-an-email');
    await user.tab(); // trigger blur

    expect(await screen.findByText(/valid email address/i)).toBeInTheDocument();
  });

  it('calls onSubmit with email, password, and rememberMe when valid', async () => {
    const handleSubmit = vi.fn();
    const user = userEvent.setup();
    render(<LoginForm onSubmit={handleSubmit} />);

    await user.type(screen.getByLabelText(/email address/i), 'user@example.com');
    await user.type(screen.getByLabelText(/^password$/i), 'SecurePass1!');
    await user.click(screen.getByLabelText(/remember me/i));
    await user.click(screen.getByRole('button', { name: /log in/i }));

    await waitFor(() => {
      expect(handleSubmit).toHaveBeenCalledWith({
        email: 'user@example.com',
        password: 'SecurePass1!',
        rememberMe: true,
      });
    });
  });

  it('does not call onSubmit when validation fails', async () => {
    const handleSubmit = vi.fn();
    const user = userEvent.setup();
    render(<LoginForm onSubmit={handleSubmit} />);

    await user.click(screen.getByRole('button', { name: /log in/i }));

    expect(handleSubmit).not.toHaveBeenCalled();
  });

  it('displays an API error when provided', () => {
    render(<LoginForm apiError="Invalid email or password." />);
    expect(screen.getByText(/invalid email or password/i)).toBeInTheDocument();
  });

  it('has a Forgot password link', () => {
    render(<LoginForm />);
    expect(screen.getByRole('link', { name: /forgot your password/i })).toHaveAttribute(
      'href',
      '/forgot-password',
    );
  });
});
