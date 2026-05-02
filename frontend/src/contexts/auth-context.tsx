import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';
import { api, setToken } from '../lib/api-client';

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
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }): JSX.Element {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

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

  // Periodic token refresh — cookie attaches automatically, send empty body (#290)
  useEffect(() => {
    const REFRESH_INTERVAL = 50 * 60 * 1000; // 50 minutes
    const interval = setInterval(async () => {
      try {
        const data = await api.post<{ accessToken: string }>('/api/auth/refresh');
        setToken(data.accessToken);
      } catch {
        setToken(null);
        setUser(null);
      }
    }, REFRESH_INTERVAL);
    return () => clearInterval(interval);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
