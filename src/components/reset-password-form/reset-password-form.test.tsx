import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ResetPasswordForm } from '../reset-password-form';

const mockFetch = vi.fn();
global.fetch = mockFetch;

const VALID_PASSWORD = 'Password123!';

function setLocationSearch(search: string): void {
  Object.defineProperty(window, 'location', {
    value: { ...window.location, search, href: `/reset-password${search}` },
    writable: true,
  });
}

describe('ResetPasswordForm', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    setLocationSearch('?token=valid-reset-token-123');
  });

  it('renders form with new password and confirm password fields', () => {
    render(<ResetPasswordForm />);
    expect(screen.getByLabelText(/new password/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/confirm new password/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /reset password/i })).toBeInTheDocument();
  });

  it('shows an error when there is no token in the URL', () => {
    setLocationSearch('');
    render(<ResetPasswordForm />);
    expect(screen.getByRole('alert')).toHaveTextContent(/invalid or missing reset token/i);
  });

  it('displays password requirements', () => {
    render(<ResetPasswordForm />);
    expect(screen.getByText(/at least 8 characters/i)).toBeInTheDocument();
  });

  it('shows password strength indicator when typing', async () => {
    render(<ResetPasswordForm />);
    await userEvent.type(screen.getByLabelText(/new password/i), VALID_PASSWORD);
    expect(screen.getByText(/strength:/i)).toBeInTheDocument();
  });

  it('validates that passwords match', async () => {
    render(<ResetPasswordForm />);
    await userEvent.type(screen.getByLabelText(/new password/i), VALID_PASSWORD);
    await userEvent.type(screen.getByLabelText(/confirm new password/i), 'DifferentPassword1!');
    fireEvent.submit(screen.getByLabelText(/new password/i).closest('form')!);
    await waitFor(() => {
      expect(screen.getByText(/passwords do not match/i)).toBeInTheDocument();
    });
  });

  it('validates password strength requirements', async () => {
    render(<ResetPasswordForm />);
    await userEvent.type(screen.getByLabelText(/new password/i), 'weak');
    await userEvent.type(screen.getByLabelText(/confirm new password/i), 'weak');
    fireEvent.submit(screen.getByLabelText(/new password/i).closest('form')!);
    await waitFor(() => {
      expect(screen.getAllByRole('alert').some(el => el.textContent?.includes('at least 8'))).toBe(true);
    });
  });

  it('shows loading state during submission', async () => {
    mockFetch.mockImplementation(() => new Promise(() => {}));
    render(<ResetPasswordForm />);
    await userEvent.type(screen.getByLabelText(/new password/i), VALID_PASSWORD);
    await userEvent.type(screen.getByLabelText(/confirm new password/i), VALID_PASSWORD);
    fireEvent.submit(screen.getByLabelText(/new password/i).closest('form')!);
    await waitFor(() => {
      expect(screen.getByRole('button')).toHaveTextContent(/resetting/i);
    });
  });

  it('shows success message on successful reset', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, status: 200 });
    render(<ResetPasswordForm />);
    await userEvent.type(screen.getByLabelText(/new password/i), VALID_PASSWORD);
    await userEvent.type(screen.getByLabelText(/confirm new password/i), VALID_PASSWORD);
    fireEvent.submit(screen.getByLabelText(/new password/i).closest('form')!);
    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent(/password has been reset/i);
    });
  });

  it('shows error for expired or invalid token', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: async () => ({ message: 'Token has expired' }),
    });
    render(<ResetPasswordForm />);
    await userEvent.type(screen.getByLabelText(/new password/i), VALID_PASSWORD);
    await userEvent.type(screen.getByLabelText(/confirm new password/i), VALID_PASSWORD);
    fireEvent.submit(screen.getByLabelText(/new password/i).closest('form')!);
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/expired/i);
    });
  });

  it('has proper ARIA labels for accessibility', () => {
    render(<ResetPasswordForm />);
    const newPasswordInput = screen.getByLabelText(/new password/i);
    const confirmInput = screen.getByLabelText(/confirm new password/i);
    expect(newPasswordInput).toHaveAttribute('aria-required', 'true');
    expect(confirmInput).toHaveAttribute('aria-required', 'true');
  });
});
