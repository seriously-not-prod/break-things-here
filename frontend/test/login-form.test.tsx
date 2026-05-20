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
  const actual =
    await vi.importActual<typeof import('../src/lib/api-client')>('../src/lib/api-client');
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

  it('fails closed when the Entra config request errors out (no local form shown)', async () => {
    mockedApi.get.mockRejectedValueOnce(new Error('network down'));

    render(<LoginForm />);

    // Wait for the loader/error UI to settle.
    expect(await screen.findByTestId('config-error')).toBeInTheDocument();

    // Local credentials must NOT be exposed on a config-fetch failure, since
    // the deployment could be Entra-only and we cannot verify the gate.
    expect(screen.queryByLabelText(/email address/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/^password$/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /log in/i })).not.toBeInTheDocument();
    expect(screen.queryByTestId('entra-sign-in')).not.toBeInTheDocument();
  });
});

/**
 * #782 — Snapshot coverage for the demo-credentials banner gate.
 *
 * The banner must render only when Entra is disabled AND the build is not
 * production. We exercise the three documented states by stubbing the Entra
 * config and toggling Vite's `import.meta.env.PROD` flag.
 */
describe('LoginForm — demo credentials banner (#782)', () => {
  beforeEach(() => {
    mockedApi.get.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
    // Restore NODE_ENV so later cases are not contaminated by a forced mode.
    vi.unstubAllEnvs();
  });

  function setProdMode(isProd: boolean): void {
    vi.stubEnv('NODE_ENV', isProd ? 'production' : 'development');
  }

  it('hides the demo banner when Entra is enabled (entra-on)', async () => {
    setProdMode(false);
    mockEntraConfig({ enabled: true, allowLocalFallback: true });

    const { container } = render(<LoginForm />);

    const disclosure = await screen.findByTestId('local-fallback-disclosure');
    await userEvent.click(disclosure);

    // Even after the user has revealed the local form, the demo banner must
    // not appear when Entra is the active identity path.
    expect(await screen.findByLabelText(/email address/i)).toBeInTheDocument();
    expect(screen.queryByTestId('demo-credentials-banner')).not.toBeInTheDocument();
    expect(screen.queryByText(/demo credentials/i)).not.toBeInTheDocument();
    expect(container).toMatchSnapshot();
  });

  it('shows the demo banner when Entra is disabled in a development build (dev no-entra)', async () => {
    setProdMode(false);
    mockEntraConfig({ enabled: false });

    const { container } = render(<LoginForm />);

    expect(await screen.findByLabelText(/email address/i)).toBeInTheDocument();
    expect(await screen.findByTestId('demo-credentials-banner')).toBeInTheDocument();
    expect(screen.getByText(/demo credentials/i)).toBeInTheDocument();
    expect(container).toMatchSnapshot();
  });

  it('hides the demo banner when Entra is disabled but the build is production (prod no-entra)', async () => {
    setProdMode(true);
    mockEntraConfig({ enabled: false });

    const { container } = render(<LoginForm />);

    // Local form still renders (no Entra configured) but the dev-only demo
    // disclosure must never reach a production bundle.
    expect(await screen.findByLabelText(/email address/i)).toBeInTheDocument();
    expect(screen.queryByTestId('demo-credentials-banner')).not.toBeInTheDocument();
    expect(screen.queryByText(/demo credentials/i)).not.toBeInTheDocument();
    expect(container).toMatchSnapshot();
  });
});

/**
 * #790 — Entra-first login copy refresh for the four personas.
 *
 * Snapshot coverage for Entra-on and Entra-off variants. Validates:
 *   - MFA help text renders only when Entra is enabled
 *   - Forgot-password / create-account links render only in local-fallback mode
 *   - Primary CTA reads "Sign in with Microsoft"
 */
describe('LoginForm — Entra-first copy refresh (#790)', () => {
  beforeEach(() => {
    mockedApi.get.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
  });

  it('renders MFA help text and hides local links when Entra is on (entra-only)', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    mockEntraConfig({ enabled: true, allowLocalFallback: false });

    const { container } = render(<LoginForm />);

    const signInBtn = await screen.findByTestId('entra-sign-in');
    expect(signInBtn).toHaveTextContent('Sign in with Microsoft');

    // MFA help text must be present when Entra is enabled
    expect(await screen.findByTestId('entra-mfa-notice')).toBeInTheDocument();
    expect(screen.getByText(/multi-factor authentication/i)).toBeInTheDocument();

    // Entra-only notice also shows
    expect(screen.getByTestId('entra-only-notice')).toBeInTheDocument();

    // Forgot-password and create-account must not render in entra-only mode
    expect(screen.queryByRole('button', { name: /forgot password/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/create account/i)).not.toBeInTheDocument();

    expect(container).toMatchSnapshot();
  });

  it('renders MFA help text when Entra is on with fallback (entra-with-fallback)', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    mockEntraConfig({ enabled: true, allowLocalFallback: true });

    const { container } = render(<LoginForm />);

    expect(await screen.findByTestId('entra-sign-in')).toBeInTheDocument();
    expect(screen.getByTestId('entra-mfa-notice')).toBeInTheDocument();
    expect(screen.getByText(/multi-factor authentication/i)).toBeInTheDocument();

    // Entra-only notice should NOT show when fallback is allowed
    expect(screen.queryByTestId('entra-only-notice')).not.toBeInTheDocument();

    // Local form is collapsed; disclosure link is visible
    expect(screen.getByTestId('local-fallback-disclosure')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /forgot password/i })).not.toBeInTheDocument();

    // After expanding local fallback, forgot-password and create-account render
    await userEvent.click(screen.getByTestId('local-fallback-disclosure'));
    expect(await screen.findByRole('button', { name: /forgot password/i })).toBeInTheDocument();

    expect(container).toMatchSnapshot();
  });

  it('hides MFA help text when Entra is off (local-only)', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    mockEntraConfig({ enabled: false });

    const { container } = render(<LoginForm />);

    await waitFor(() => expect(mockedApi.get).toHaveBeenCalled());

    // No Entra button and no MFA notice
    expect(screen.queryByTestId('entra-sign-in')).not.toBeInTheDocument();
    expect(screen.queryByTestId('entra-mfa-notice')).not.toBeInTheDocument();

    // Local form renders with forgot-password
    expect(await screen.findByLabelText(/email address/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /forgot password/i })).toBeInTheDocument();

    expect(container).toMatchSnapshot();
  });
});
