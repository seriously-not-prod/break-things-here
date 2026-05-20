import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';
import { api, getToken, setToken } from '../lib/api-client';
import { useSessionTimeout } from '../hooks/use-session-timeout';

export interface AuthUser {
  id: number;
  email: string;
  displayName: string;
  roleId: number;
  roleName: string;
}

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  login: (email: string, password: string, rememberMe?: boolean) => Promise<void>;
  register: (email: string, password: string, displayName: string) => Promise<string>;
  logout: () => Promise<void>;
  loadCurrentUser: () => Promise<void>;
  /** True when the session was automatically ended after 30 min of inactivity. */
  sessionTimedOut: boolean;
  /** Call after showing the "session expired" notice to reset the flag. */
  clearSessionTimeout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const FALLBACK_REFRESH_INTERVAL_MS = 50 * 60 * 1000;
const REFRESH_BUFFER_MS = 5 * 60 * 1000;
const MIN_REFRESH_DELAY_MS = 30 * 1000;

function decodeJwtExpiryMs(token: string): number | null {
  const parts = token.split('.');
  if (parts.length < 2) return null;

  try {
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=');
    const payload = JSON.parse(atob(padded)) as { exp?: unknown };
    if (typeof payload.exp !== 'number') return null;
    return payload.exp * 1000;
  } catch {
    return null;
  }
}

export function calculateRefreshDelayMs(token: string | null, nowMs = Date.now()): number {
  if (!token) return FALLBACK_REFRESH_INTERVAL_MS;

  const expiresAtMs = decodeJwtExpiryMs(token);
  if (!expiresAtMs) return FALLBACK_REFRESH_INTERVAL_MS;

  const delayMs = expiresAtMs - nowMs - REFRESH_BUFFER_MS;
  return Math.max(MIN_REFRESH_DELAY_MS, delayMs);
}

/** Rendered only while a user is authenticated; activates the idle hook. */
function SessionTimeoutWatcher({ onTimeout }: { onTimeout: () => void }) {
  useSessionTimeout(onTimeout);
  return null;
}

export function AuthProvider({ children }: { children: ReactNode }): JSX.Element {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [sessionTimedOut, setSessionTimedOut] = useState(false);

  const loadCurrentUser = useCallback(async () => {
    try {
      const data = await api.get<{ id: number; email: string; display_name: string; role_id: number; role_name: string }>('/api/auth/me');
      setUser({
        id: data.id,
        email: data.email,
        displayName: data.display_name,
        roleId: data.role_id,
        roleName: data.role_name ?? '',
      });
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const restoreSession = useCallback(async () => {
    try {
      const data = await api.post<{ accessToken: string }>('/api/auth/refresh');
      if (data && typeof data.accessToken === 'string') setToken(data.accessToken);
    } catch {
      setToken(null);
    }

    await loadCurrentUser();
  }, [loadCurrentUser]);

  useEffect(() => {
    void restoreSession();
  }, [restoreSession]);

  const login = useCallback(async (email: string, password: string, _rememberMe = false) => {
    // POST credentials. Backend sets httpOnly cookies and returns accessToken
    // in development so requests can attach it from in-memory state only.
    const data = await api.post<Record<string, unknown>>('/api/auth/login', { email, password });
    if (data && typeof data.accessToken === 'string') setToken(data.accessToken);
    await loadCurrentUser();
  }, [loadCurrentUser]);

  const register = useCallback(async (email: string, password: string, displayName: string): Promise<string> => {
    const data = await api.post<{ message: string }>('/api/auth/register', { email, password, displayName });
    return data.message;
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.post('/api/auth/logout');
    } catch {
      // ignore errors on logout
    }
    setToken(null);
    setUser(null);
  }, []);

  const handleSessionTimeout = useCallback(() => {
    setToken(null);
    setUser(null);
    setSessionTimedOut(true);
  }, []);

  const clearSessionTimeout = useCallback(() => {
    setSessionTimedOut(false);
  }, []);

  // Dynamic token refresh scheduling — uses token exp so cadence adapts to token TTL.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    let cancelled = false;

    const scheduleNext = (token: string | null): void => {
      const delay = calculateRefreshDelayMs(token);
      timer = setTimeout(() => {
        void refreshToken();
      }, delay);
    };

    const refreshToken = async (): Promise<void> => {
      try {
        const data = await api.post<{ accessToken: string }>('/api/auth/refresh');
        setToken(data.accessToken);
        if (cancelled) return;
        scheduleNext(data.accessToken);
      } catch {
        setToken(null);
        setUser(null);
        if (cancelled) return;
        scheduleNext(null);
      }
    };

    scheduleNext(getToken());

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, loadCurrentUser, sessionTimedOut, clearSessionTimeout }}>
      {user && <SessionTimeoutWatcher onTimeout={handleSessionTimeout} />}
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
