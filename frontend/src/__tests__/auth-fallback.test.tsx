import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider, useAuth } from '../contexts/auth-context';
import { api } from '../lib/api-client';

vi.mock('../lib/api-client', async () => {
  const actual = await vi.importActual<typeof import('../lib/api-client')>('../lib/api-client');
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

function AuthFallbackHarness(): JSX.Element {
  const { login, user, authSource, loading } = useAuth();

  return (
    <div>
      <button onClick={() => void login('admin@festival.local', 'festivalAdmin2025')}>Demo login</button>
      <span>{loading ? 'loading' : user?.email ?? 'signed-out'}</span>
      <span>{authSource ?? 'none'}</span>
    </div>
  );
}

describe('AuthProvider demo fallback', () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.mocked(api.get).mockReset();
    vi.mocked(api.post).mockReset();
  });

  it('falls back to the seeded demo account when the backend login fails', async () => {
    vi.mocked(api.post).mockImplementation(async (path: string) => {
      if (path === '/api/auth/refresh') {
        throw new Error('No session');
      }

      if (path === '/api/auth/login') {
        throw new Error('backend unavailable');
      }

      throw new Error(`Unexpected POST ${path}`);
    });

    vi.mocked(api.get).mockRejectedValue(new Error('Unauthenticated'));

    render(
      <AuthProvider>
        <AuthFallbackHarness />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText('signed-out')).toBeTruthy();
    });

    await userEvent.click(screen.getByRole('button', { name: /demo login/i }));

    await waitFor(() => {
      expect(screen.getByText('admin@festival.local')).toBeTruthy();
      expect(screen.getByText('demo')).toBeTruthy();
    });

    const storedAuth = window.localStorage.getItem('festival-planner-auth');
    expect(storedAuth).not.toBeNull();
    expect(JSON.parse(storedAuth ?? '{}')).toMatchObject({ source: 'demo' });
  });
});