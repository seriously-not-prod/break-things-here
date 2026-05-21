import { create } from 'zustand';
import { persist } from 'zustand/middleware';

type ThemeMode = 'light' | 'dark' | 'system';

interface UiState {
  themeMode: ThemeMode;
  sidebarOpen: boolean;
  commandPaletteOpen: boolean;
  activeToasts: Array<{
    id: string;
    message: string;
    severity: 'success' | 'error' | 'warning' | 'info';
  }>;
  setThemeMode: (mode: ThemeMode) => void;
  setSidebarOpen: (open: boolean) => void;
  toggleSidebar: () => void;
  openCommandPalette: () => void;
  closeCommandPalette: () => void;
  pushToast: (message: string, severity?: 'success' | 'error' | 'warning' | 'info') => void;
  dismissToast: (id: string) => void;
}

export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      themeMode: 'system',
      sidebarOpen: true,
      commandPaletteOpen: false,
      activeToasts: [],
      setThemeMode: (themeMode) => set({ themeMode }),
      setSidebarOpen: (sidebarOpen) => set({ sidebarOpen }),
      toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
      openCommandPalette: () => set({ commandPaletteOpen: true }),
      closeCommandPalette: () => set({ commandPaletteOpen: false }),
      pushToast: (message, severity = 'info') =>
        set((state) => ({
          activeToasts: [
            ...state.activeToasts,
            { id: `${Date.now()}-${Math.random()}`, message, severity },
          ],
        })),
      dismissToast: (id) =>
        set((state) => ({
          activeToasts: state.activeToasts.filter((t) => t.id !== id),
        })),
    }),
    {
      name: 'ui-store',
      partialize: (state) => ({ themeMode: state.themeMode, sidebarOpen: state.sidebarOpen }),
    },
  ),
);
