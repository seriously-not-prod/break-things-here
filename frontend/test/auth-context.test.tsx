import { render, screen, waitFor } from '@testing-library/react';
import { fireEvent } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider, useAuth } from '../src/contexts/auth-context';
import { api, getToken, setToken } from '../src/lib/api-client';

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

const mockedApi = vi.mocked(api);

function LoginHarness() {
  const { login, loading, user } = useAuth();

  return (
    <div>
      <button onClick={() => void login('user@test.com', 'Pass1234')}>Login</button>
      <span>{loading ? 'loading' : user?.email ?? 'signed-out'}</span>
    </div>
  );
}

function StatusHarness() {
  const { loading, user } = useAuth();
  return <span>{loading ? 'loading' : user?.email ?? 'signed-out'}</span>;
}

describe('AuthProvider token storage (#250)', () => {
  beforeEach(() => {
    window.localStorage.clear();
    setToken(null);
    mockedApi.get.mockReset();
    mockedApi.post.mockReset();
  });

  afterEach(() => {
    setToken(null);
  });

  it('keeps accessToken out of localStorage after login', async () => {
    mockedApi.post.mockImplementation(async (path: string) => {
      if (path === '/api/auth/refresh') {
        throw new Error('No refresh cookie yet');
      }
      if (path === '/api/auth/login') {
        return { accessToken: 'memory-access-token' };
      }
      throw new Error(`Unexpected POST ${path}`);
    });

    mockedApi.get.mockImplementation(async () => {
      if (!getToken()) throw new Error('Unauthenticated');
      return {
        id: 1,
        email: 'user@test.com',
        display_name: 'User',
        role_id: 1,
        role_name: 'Attendee',
      };
    });

    render(
      <AuthProvider>
        <LoginHarness />
      </AuthProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Login' }));

    await waitFor(() => {
      expect(screen.getByText('user@test.com')).toBeInTheDocument();
    });

    expect(getToken()).toBe('memory-access-token');
    expect(window.localStorage.getItem('accessToken')).toBeNull();
  });

  it('restores the session by refreshing from the HttpOnly cookie on mount', async () => {
    mockedApi.post.mockImplementation(async (path: string) => {
      if (path === '/api/auth/refresh') {
        return { accessToken: 'refreshed-access-token' };
      }
      throw new Error(`Unexpected POST ${path}`);
    });

    mockedApi.get.mockImplementation(async () => {
      if (!getToken()) throw new Error('Unauthenticated');
      return {
        id: 1,
        email: 'user@test.com',
        display_name: 'User',
        role_id: 1,
        role_name: 'Attendee',
      };
    });

    render(
      <AuthProvider>
        <StatusHarness />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText('user@test.com')).toBeInTheDocument();
    });

    expect(getToken()).toBe('refreshed-access-token');
    expect(window.localStorage.getItem('accessToken')).toBeNull();
  });
});