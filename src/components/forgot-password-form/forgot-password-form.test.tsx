import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ForgotPasswordForm } from '../forgot-password-form';

const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('ForgotPasswordForm', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it('renders the form with email input and submit button', () => {
    render(<ForgotPasswordForm />);
    expect(screen.getByLabelText(/email address/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /send reset link/i })).toBeInTheDocument();
  });

  it('shows validation error when submitted with empty email', async () => {
    render(<ForgotPasswordForm />);
    fireEvent.submit(screen.getByRole('form', { hidden: true }) ?? screen.getByRole('button', { name: /send reset link/i }).closest('form')!);
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/email address is required/i);
    });
  });

  it('shows validation error for invalid email format', async () => {
    render(<ForgotPasswordForm />);
    await userEvent.type(screen.getByLabelText(/email address/i), 'not-valid');
    fireEvent.submit(screen.getByLabelText(/email address/i).closest('form')!);
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/valid email address/i);
    });
  });

  it('shows loading state during submission', async () => {
    mockFetch.mockImplementation(() => new Promise(() => {}));
    render(<ForgotPasswordForm />);
    await userEvent.type(screen.getByLabelText(/email address/i), 'user@example.com');
    fireEvent.submit(screen.getByLabelText(/email address/i).closest('form')!);
    await waitFor(() => {
      expect(screen.getByRole('button')).toHaveTextContent(/sending/i);
    });
  });

  it('shows generic success message after submission regardless of email existence', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({}) });
    render(<ForgotPasswordForm />);
    await userEvent.type(screen.getByLabelText(/email address/i), 'user@example.com');
    fireEvent.submit(screen.getByLabelText(/email address/i).closest('form')!);
    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent(/if an account exists/i);
    });
  });

  it('shows network error message on network failure', async () => {
    mockFetch.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    render(<ForgotPasswordForm />);
    await userEvent.type(screen.getByLabelText(/email address/i), 'user@example.com');
    fireEvent.submit(screen.getByLabelText(/email address/i).closest('form')!);
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/unable to connect/i);
    });
  });

  it('has ARIA labels for accessibility', () => {
    render(<ForgotPasswordForm />);
    const emailInput = screen.getByLabelText(/email address/i);
    expect(emailInput).toHaveAttribute('aria-required', 'true');
  });
});
