import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: string;
}

interface AuthContextType {
  user: AuthUser | null;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<boolean>;
  logout: () => void;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const AUTH_STORAGE_KEY = 'festival-planner-auth';

// Use relative API base so dev server proxy keeps requests same-origin
const API_BASE_URL = '/api';

// Helper to get CSRF token from cookie
function getCsrfToken(): string | null {
  const match = document.cookie.match(/XSRF-TOKEN=([^;]+)/);
  return match ? match[1] : null;
}

export function AuthProvider({ children }: { children: ReactNode }): JSX.Element {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Check for existing session on mount
  useEffect(() => {
    // First, ensure we have a CSRF token by making a GET request
    fetch(`${API_BASE_URL}/events`, {
      credentials: 'include',
    }).catch(() => {
      // Ignore errors, just continue
    });
    
    const storedUser = localStorage.getItem(AUTH_STORAGE_KEY);
    if (storedUser) {
      try {
        const parsed = JSON.parse(storedUser);
        // Verify session is still valid by calling /api/auth/me
        fetch(`${API_BASE_URL}/auth/me`, {
          credentials: 'include',
        })
          .then((res) => {
            if (res.ok) {
              setUser(parsed.user);
            } else {
              localStorage.removeItem(AUTH_STORAGE_KEY);
            }
          })
          .catch(() => {
            localStorage.removeItem(AUTH_STORAGE_KEY);
          })
          .finally(() => setIsLoading(false));
        return;
      } catch (error) {
        console.error('Failed to parse stored user:', error);
        localStorage.removeItem(AUTH_STORAGE_KEY);
      }
    }
    setIsLoading(false);
  }, []);

  const login = async (email: string, password: string): Promise<boolean> => {
    try {
      // Get CSRF token from cookie
      const csrfToken = getCsrfToken();
      
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      
      // Add CSRF token if available
      if (csrfToken) {
        headers['X-XSRF-TOKEN'] = csrfToken;
      }
      
      const response = await fetch(`${API_BASE_URL}/auth/login`, {
        method: 'POST',
        headers,
        credentials: 'include', // Important: send/receive cookies
        body: JSON.stringify({ email, password }),
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'Login failed' }));
        console.error('Login failed:', error);
        return false;
      }

      const data = await response.json();
      
      // Backend returns: { message, user: { id, email, displayName, roleId } }
      const authUser: AuthUser = {
        id: String(data.user.id),
        name: data.user.displayName,
        email: data.user.email,
        role: data.user.roleId === 3 ? 'Admin' : data.user.roleId === 2 ? 'Organizer' : 'Attendee',
      };
      
      setUser(authUser);
      localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify({ user: authUser }));
      return true;
    } catch (error) {
      console.error('Login error:', error);
      return false;
    }
  };

  const logout = (): void => {
    // Call backend logout to clear session
    const csrfToken = getCsrfToken();
    const headers: Record<string, string> = {};
    
    if (csrfToken) {
      headers['X-XSRF-TOKEN'] = csrfToken;
    }
    
    fetch(`${API_BASE_URL}/auth/logout`, {
      method: 'POST',
      headers,
      credentials: 'include',
    }).catch(() => {
      // Ignore errors, just clear local state
    });
    
    setUser(null);
    localStorage.removeItem(AUTH_STORAGE_KEY);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        login,
        logout,
        isLoading,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
