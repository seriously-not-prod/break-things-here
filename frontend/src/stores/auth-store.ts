import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface AuthUser {
  id: number;
  email: string;
  displayName: string;
  roleId: number;
  roleName: string;
}

interface AuthState {
  user: AuthUser | null;
  isAuthenticated: boolean;
  sessionTimedOut: boolean;
  setUser: (user: AuthUser | null) => void;
  clearUser: () => void;
  setSessionTimedOut: (value: boolean) => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      isAuthenticated: false,
      sessionTimedOut: false,
      setUser: (user) => set({ user, isAuthenticated: user !== null }),
      clearUser: () => set({ user: null, isAuthenticated: false }),
      setSessionTimedOut: (value) => set({ sessionTimedOut: value }),
    }),
    {
      name: 'auth-store',
      partialize: (state) => ({ user: state.user, isAuthenticated: state.isAuthenticated }),
    },
  ),
);
