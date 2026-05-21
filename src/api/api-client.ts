/**
 * API Client with automatic JWT token refresh — Issue #81
 *
 * Wraps fetch() to silently refresh the access token when it is
 * within 5 minutes of expiration.  Concurrent requests during a
 * refresh are queued so only one refresh request is in-flight at a time.
 *
 * On refresh failure the user is logged out and redirected to /login.
 */

const API_BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3001';

const TOKEN_REFRESH_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes

// ---------------------------------------------------------------------------
// Token storage (in-memory; cleared on page unload / logout)
// ---------------------------------------------------------------------------
let accessToken: string | null = null;

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

export function getAccessToken(): string | null {
  return accessToken;
}

// ---------------------------------------------------------------------------
// JWT helpers
// ---------------------------------------------------------------------------
function decodePayload(token: string): { exp: number } | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const payload = JSON.parse(atob(parts[1]));
    return payload as { exp: number };
  } catch {
    return null;
  }
}

function isTokenExpiringSoon(token: string): boolean {
  const payload = decodePayload(token);
  if (!payload?.exp) return true;
  const expiresAt = payload.exp * 1000; // seconds → ms
  return expiresAt - Date.now() < TOKEN_REFRESH_THRESHOLD_MS;
}

// ---------------------------------------------------------------------------
// Refresh coordination — queues concurrent callers behind a single refresh
// ---------------------------------------------------------------------------
let refreshPromise: Promise<string | null> | null = null;

async function doRefresh(): Promise<string | null> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/auth/refresh`, {
      method: 'POST',
      credentials: 'include', // sends httpOnly refreshToken cookie
      headers: { 'Content-Type': 'application/json' },
    });

    if (!response.ok) {
      return null;
    }

    const data = (await response.json()) as { accessToken?: string };
    return data.accessToken ?? null;
  } catch {
    return null;
  }
}

async function refreshAccessToken(): Promise<string | null> {
  // If a refresh is already in-flight, queue behind it
  if (refreshPromise) {
    return refreshPromise;
  }

  refreshPromise = doRefresh();
  try {
    const newToken = await refreshPromise;
    if (newToken) {
      setAccessToken(newToken);
    }
    return newToken;
  } finally {
    refreshPromise = null;
  }
}

// ---------------------------------------------------------------------------
// Logout helper
// ---------------------------------------------------------------------------
function handleLogout(): void {
  setAccessToken(null);
  window.location.href = '/login';
}

// ---------------------------------------------------------------------------
// Public API — drop-in replacement for fetch()
// ---------------------------------------------------------------------------
export async function apiFetch(path: string, options: RequestInit = {}): Promise<Response> {
  // Attempt a silent refresh if the token is about to expire
  if (accessToken && isTokenExpiringSoon(accessToken)) {
    const refreshed = await refreshAccessToken();
    if (!refreshed) {
      handleLogout();
      return new Response(null, { status: 401 });
    }
  }

  const headers = new Headers(options.headers);
  if (accessToken) {
    headers.set('Authorization', `Bearer ${accessToken}`);
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers,
    credentials: 'include',
  });

  // If we get a 401/403, try one refresh then retry
  if ((response.status === 401 || response.status === 403) && accessToken) {
    const refreshed = await refreshAccessToken();
    if (refreshed) {
      headers.set('Authorization', `Bearer ${refreshed}`);
      return fetch(`${API_BASE_URL}${path}`, {
        ...options,
        headers,
        credentials: 'include',
      });
    }
    handleLogout();
  }

  return response;
}
