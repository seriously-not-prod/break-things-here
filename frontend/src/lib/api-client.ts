/**
 * Shared API client for Festival Event Planner frontend.
 * Keeps the auth token in module memory, attaches it to every request,
 * and surfaces a typed error when the server responds with non-2xx.
 */

// In dev the Vite proxy forwards /api/* to the backend, so we use a relative base.
// In production set VITE_API_URL to the backend origin if the frontend is served separately.
const API_BASE = import.meta.env.VITE_API_URL ?? '';
let accessToken: string | null = null;

function resolveApiUrl(path: string): string {
  const target = `${API_BASE}${path}`;

  if (/^https?:\/\//.test(target)) {
    return target;
  }

  const baseOrigin = typeof window !== 'undefined' && window.location?.origin
    ? window.location.origin
    : 'http://localhost';

  return new URL(target, baseOrigin).toString();
}

export class ApiError extends Error {
  status: number;
  code?: string;
  constructor(message: string, status: number, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
    this.name = 'ApiError';
  }
}

export function getToken(): string | null {
  return accessToken;
}

// In-memory CSRF token — avoids cookie-forwarding issues through nginx proxy.
let _csrfToken: string | null = null;

async function ensureCsrfToken(): Promise<void> {
  if (_csrfToken) return;
  try {
    const res = await fetch(resolveApiUrl('/api/csrf-token'), { credentials: 'include' });
    if (res.ok) {
      const data = await res.json() as { csrfToken: string };
      _csrfToken = data.csrfToken;
    }
  } catch {
    // Silently continue — request will fail with 403 if token is truly missing
  }
}

async function performFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const token = getToken();
  const headers = new Headers(init.headers ?? undefined);
  const body = init.body;

  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const method = (init.method ?? 'GET').toUpperCase();
  if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
    await ensureCsrfToken();
    if (_csrfToken && !headers.has('X-XSRF-Token')) {
      headers.set('X-XSRF-Token', _csrfToken);
    }
  }

  if (!(body instanceof FormData) && body !== undefined && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  return fetch(resolveApiUrl(path), { ...init, headers, credentials: 'include' });
}

export function setToken(token: string | null): void {
  accessToken = token;
}

export function getAuthHeaders(): Record<string, string> {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

// refreshToken is stored exclusively in an HttpOnly cookie set by the backend.
// It is never read from or written to localStorage. (#290)

export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const method = (init.method ?? 'GET').toUpperCase();
  let response = await performFetch(path, init);

  if (!['GET', 'HEAD', 'OPTIONS'].includes(method) && response.status === 403) {
    const body = await response.clone().json().catch(() => null) as { error?: string } | null;
    if (body?.error === 'Invalid CSRF token') {
      _csrfToken = null;
      response = await performFetch(path, init);
    }
  }

  return response;
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await apiFetch(path, init);

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText })) as { error?: string; code?: string };
    throw new ApiError(body.error ?? res.statusText, res.status, body.code);
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
