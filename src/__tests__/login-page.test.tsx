import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { LoginPage } from '../components/login-page/login-page';

// ─── Mock useAuth ─────────────────────────────────────────────────────────────

const mockLogin = vi.fn<(email: string, password: string) => Promise<boolean>>();

vi.mock('../contexts/auth-context', () => ({
  useAuth: () => ({
    user: null,
    isAuthenticated: false,
    isLoading: false,
    login: mockLogin,
    logout: vi.fn(),
  }),
}));

// ─── Helper ───────────────────────────────────────────────────────────────────

function renderLoginPage() {
  return render(
    <MemoryRouter>
      <LoginPage />
    </MemoryRouter>,
  );
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('LoginPage', () => {
  it('renders email input, password input, and submit button', () => {
    renderLoginPage();

    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument();
  });

  it('renders the brand heading', () => {
    renderLoginPage();
    expect(screen.getByRole('heading', { name: /festival planner/i })).toBeInTheDocument();
  });

  it('calls login with entered credentials on submit', async () => {
    mockLogin.mockResolvedValue(true);
    const user = userEvent.setup();

    renderLoginPage();

    await user.type(screen.getByLabelText(/email/i), 'admin@festival.local');
    await user.type(screen.getByLabelText(/password/i), 'festivalAdmin2025');
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => {
      expect(mockLogin).toHaveBeenCalledWith('admin@festival.local', 'festivalAdmin2025');
    });
  });

  it('shows an error message when login returns false', async () => {
    mockLogin.mockResolvedValue(false);
    const user = userEvent.setup();

    renderLoginPage();

    await user.type(screen.getByLabelText(/email/i), 'bad@user.com');
    await user.type(screen.getByLabelText(/password/i), 'wrongpassword');
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/invalid email or password/i);
    });
  });

  it('shows an error message when login throws', async () => {
    mockLogin.mockRejectedValue(new Error('Network error'));
    const user = userEvent.setup();

    renderLoginPage();

    await user.type(screen.getByLabelText(/email/i), 'bad@user.com');
    await user.type(screen.getByLabelText(/password/i), 'somepassword');
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/an error occurred/i);
    });
  });

  it('disables submit button and shows loading text while submitting', async () => {
    mockLogin.mockReturnValue(new Promise(() => {})); // never resolves
    const user = userEvent.setup();

    renderLoginPage();

    await user.type(screen.getByLabelText(/email/i), 'admin@festival.local');
    await user.type(screen.getByLabelText(/password/i), 'festivalAdmin2025');
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => {
      const button = screen.getByRole('button', { name: /signing in/i });
      expect(button).toBeDisabled();
    });
  });

  it('clears the error when the user starts typing after a failed attempt', async () => {
    mockLogin.mockResolvedValue(false);
    const user = userEvent.setup();

    renderLoginPage();

    await user.type(screen.getByLabelText(/email/i), 'x@x.com');
    await user.type(screen.getByLabelText(/password/i), 'wrong');
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());

    await user.type(screen.getByLabelText(/email/i), 'a');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
