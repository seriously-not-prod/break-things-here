/**
 * Shared API client for Festival Event Planner frontend.
 * Reads the auth token from localStorage, attaches it to every request,
 * and surfaces a typed error when the server responds with non-2xx.
 */

// In dev the Vite proxy forwards /api/* to the backend, so we use a relative base.
// In production set VITE_API_URL to the backend origin if the frontend is served separately.
const API_BASE = import.meta.env.VITE_API_URL ?? '';

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
    this.name = 'ApiError';
  }
}

function getToken(): string | null {
  return localStorage.getItem('accessToken');
}

// In-memory CSRF token — avoids cookie-forwarding issues through Vite dev proxy.
let _csrfToken: string | null = null;

async function ensureCsrfToken(): Promise<void> {
  if (_csrfToken) return;
  try {
    const res = await fetch(`${API_BASE}/api/csrf-token`, { credentials: 'include' });
    if (res.ok) {
      const data = await res.json() as { csrfToken: string };
      _csrfToken = data.csrfToken;
    }
  } catch {
    // Silently continue — request will fail with 403 if token is truly missing
  }
}

export function setToken(token: string | null): void {
  if (token) {
    localStorage.setItem('accessToken', token);
  } else {
    localStorage.removeItem('accessToken');
  }
}

export function setRefreshToken(token: string | null): void {
  if (token) {
    localStorage.setItem('refreshToken', token);
  } else {
    localStorage.removeItem('refreshToken');
  }
}

export function getRefreshToken(): string | null {
  return localStorage.getItem('refreshToken');
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(init.headers as Record<string, string>),
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const method = (init.method ?? 'GET').toUpperCase();
  if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
    await ensureCsrfToken();
    if (_csrfToken) headers['X-XSRF-Token'] = _csrfToken;
    // After a successful mutation, force a fresh token next time
    // (tokens are single-use at the nonce level — server validates HMAC)
    _csrfToken = null;
  }

  const res = await fetch(`${API_BASE}${path}`, { ...init, headers, credentials: 'include' });

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText })) as { error?: string };
    throw new ApiError(body.error ?? res.statusText, res.status);
  }

  // 204 No Content
  if (res.status === 204) return undefined as unknown as T;
  return res.json() as Promise<T>;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'POST', body: JSON.stringify(body) }),
  put: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'PUT', body: JSON.stringify(body) }),
  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'PATCH', body: JSON.stringify(body) }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
};
