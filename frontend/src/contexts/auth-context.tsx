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
  /** 'demo' = no live backend, 'backend' = authenticated against real API, null = unknown */
  authSource: 'backend' | 'demo' | null;
}

interface StoredAuthState {
  source: 'backend' | 'demo';
  user: AuthUser;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const FALLBACK_REFRESH_INTERVAL_MS = 50 * 60 * 1000;
const REFRESH_BUFFER_MS = 5 * 60 * 1000;
const MIN_REFRESH_DELAY_MS = 30 * 1000;
const AUTH_STORAGE_KEY = 'festival-planner-auth';

const DEMO_ACCOUNTS: Array<{ email: string; password: string; user: AuthUser }> = [
  {
    email: 'admin@festival.local',
    password: 'festivalAdmin2025',
    user: {
      id: 1,
      email: 'admin@festival.local',
      displayName: 'Admin User',
      roleId: 3,
      roleName: 'Admin',
    },
  },
  {
    email: 'user@festival.local',
    password: 'userPass2025',
    user: {
      id: 2,
      email: 'user@festival.local',
      displayName: 'Demo User',
      roleId: 1,
      roleName: 'Attendee',
    },
  },
];

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function getDemoAccount(email: string, password: string): AuthUser | null {
  const match = DEMO_ACCOUNTS.find(
    (account) => normalizeEmail(account.email) === normalizeEmail(email) && account.password === password,
  );
  return match?.user ?? null;
}

function readStoredAuth(): StoredAuthState | null {
  try {
    const raw = localStorage.getItem(AUTH_STORAGE_KEY);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as Partial<StoredAuthState> | null;
    if (parsed?.source !== 'backend' && parsed?.source !== 'demo') {
      return null;
    }

    if (!parsed.user || typeof parsed.user.id !== 'number') {
      return null;
    }

    return {
      source: parsed.source,
      user: parsed.user as AuthUser,
    };
  } catch {
    return null;
  }
}

function storeAuth(state: StoredAuthState): void {
  localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(state));
}

function clearStoredAuth(): void {
  localStorage.removeItem(AUTH_STORAGE_KEY);
}

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
  const [authSource, setAuthSource] = useState<'backend' | 'demo' | null>(null);

  const loadCurrentUser = useCallback(async () => {
    const storedAuth = readStoredAuth();
    if (storedAuth?.source === 'demo') {
      setUser(storedAuth.user);
      setAuthSource('demo');
      setLoading(false);
      return;
    }

    try {
      const data = await api.get<{ id: number; email: string; display_name: string; role_id: number; role_name: string }>('/api/auth/me');
      const nextUser: AuthUser = {
        id: data.id,
        email: data.email,
        displayName: data.display_name,
        roleId: data.role_id,
        roleName: data.role_name ?? '',
      };
      setUser(nextUser);
      setAuthSource('backend');
      storeAuth({ source: 'backend', user: nextUser });
    } catch {
      setUser(null);
      setAuthSource(null);
      clearStoredAuth();
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const storedAuth = readStoredAuth();
    if (storedAuth?.source === 'demo') {
      void loadCurrentUser();
      return;
    }

    const restoreSession = async (): Promise<void> => {
      try {
        const data = await api.post<{ accessToken: string }>('/api/auth/refresh');
        if (data && typeof data.accessToken === 'string') setToken(data.accessToken);
      } catch {
        setToken(null);
      }

      await loadCurrentUser();
    };

    void restoreSession();
  }, [loadCurrentUser]);

  const login = useCallback(async (email: string, password: string, _rememberMe = false) => {
    // POST credentials. Backend sets httpOnly cookies and returns accessToken
    // in development so requests can attach it from in-memory state only.
    try {
      const data = await api.post<Record<string, unknown>>('/api/auth/login', { email, password });
      if (data && typeof data.accessToken === 'string') setToken(data.accessToken);
      await loadCurrentUser();
      return;
    } catch {
      const demoUser = getDemoAccount(email, password);
      if (!demoUser) {
        throw new Error('Invalid credentials');
      }

      setToken(null);
      setUser(demoUser);
      setAuthSource('demo');
      storeAuth({ source: 'demo', user: demoUser });
    }
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
    setAuthSource(null);
    clearStoredAuth();
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
    if (authSource !== 'backend') {
      return;
    }

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
  }, [authSource]);

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, loadCurrentUser, sessionTimedOut, clearSessionTimeout, authSource }}>
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
