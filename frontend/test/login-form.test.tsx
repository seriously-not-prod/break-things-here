/**
 * #781 — Hide local credential login when Entra is enabled.
 *
 * Covers the three render states the LoginForm switches between based on the
 * `/api/auth/entra/config` response:
 *   1. Entra disabled (legacy local-only): email/password visible immediately.
 *   2. Entra enabled + fallback disabled (entra-only): no password field, no
 *      "Use a local account" disclosure, only the Microsoft button is offered.
 *   3. Entra enabled + fallback enabled: Microsoft button is primary and a
 *      "Use a local account" link reveals the legacy fields on click.
 */
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LoginForm } from '../src/components/login-form/login-form';
import { api } from '../src/lib/api-client';

vi.mock('../src/lib/api-client', async () => {
  const actual = await vi.importActual<typeof import('../src/lib/api-client')>('../src/lib/api-client');
  return {
    ...actual,
    api: {
      get: vi.fn(),
      post: vi.fn(),
      put: vi.fn(),
      patch: vi.fn(),
      delete: vi.fn(),
    },
  };
});

vi.mock('../src/contexts/auth-context', () => ({
  useAuth: () => ({ login: vi.fn() }),
}));

const mockedApi = vi.mocked(api);

function mockEntraConfig(data: { enabled: boolean; allowLocalFallback?: boolean }): void {
  mockedApi.get.mockImplementation(async (path: string) => {
    if (path === '/api/auth/entra/config') return data;
    throw new Error(`Unexpected GET ${path}`);
  });
}

describe('LoginForm — Entra-aware rendering (#781)', () => {
  beforeEach(() => {
    mockedApi.get.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('shows local email/password by default when Entra is disabled', async () => {
    mockEntraConfig({ enabled: false });

    render(<LoginForm />);

    await waitFor(() => expect(mockedApi.get).toHaveBeenCalledWith('/api/auth/entra/config'));

    expect(await screen.findByLabelText(/email address/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^password$/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /log in/i })).toBeInTheDocument();
    expect(screen.queryByTestId('entra-sign-in')).not.toBeInTheDocument();
    expect(screen.queryByTestId('local-fallback-disclosure')).not.toBeInTheDocument();
  });

  it('hides local credentials when Entra is enabled and fallback is disabled (entra-only)', async () => {
    mockEntraConfig({ enabled: true, allowLocalFallback: false });

    render(<LoginForm />);

    await waitFor(() => expect(mockedApi.get).toHaveBeenCalled());

    expect(await screen.findByTestId('entra-sign-in')).toBeInTheDocument();
    expect(screen.getByTestId('entra-only-notice')).toBeInTheDocument();
    expect(screen.queryByLabelText(/email address/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/^password$/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /log in/i })).not.toBeInTheDocument();
    expect(screen.queryByTestId('local-fallback-disclosure')).not.toBeInTheDocument();
    expect(screen.queryByText(/demo credentials/i)).not.toBeInTheDocument();
  });

  it('reveals local credentials on disclosure click when fallback is enabled', async () => {
    mockEntraConfig({ enabled: true, allowLocalFallback: true });

    render(<LoginForm />);

    const disclosure = await screen.findByTestId('local-fallback-disclosure');
    expect(screen.getByTestId('entra-sign-in')).toBeInTheDocument();
    expect(screen.queryByLabelText(/email address/i)).not.toBeInTheDocument();

    await userEvent.click(disclosure);

    expect(await screen.findByLabelText(/email address/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^password$/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /log in/i })).toBeInTheDocument();
    // Once expanded the disclosure link disappears so the form occupies the slot.
    expect(screen.queryByTestId('local-fallback-disclosure')).not.toBeInTheDocument();
  });

  it('falls back to local form if the Entra config request fails', async () => {
    mockedApi.get.mockRejectedValueOnce(new Error('network down'));

    render(<LoginForm />);

    expect(await screen.findByLabelText(/email address/i)).toBeInTheDocument();
    expect(screen.queryByTestId('entra-sign-in')).not.toBeInTheDocument();
  });
});
