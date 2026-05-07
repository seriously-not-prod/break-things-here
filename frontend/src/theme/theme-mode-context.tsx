import {
  createContext,
  type PropsWithChildren,
  useEffect,
  useContext,
  useMemo,
  useState,
} from 'react';
import { CssBaseline, ThemeProvider } from '@mui/material';
import { type PaletteMode } from '@mui/material/styles';
import { createAppTheme } from './app-theme';

const STORAGE_KEY = 'eventora-theme-mode';

interface ThemeModeContextValue {
  mode: PaletteMode;
  toggleMode: () => void;
}

const ThemeModeContext = createContext<ThemeModeContextValue | null>(null);

function getInitialMode(): PaletteMode {
  const saved = window.localStorage.getItem(STORAGE_KEY);
  if (saved === 'light' || saved === 'dark') return saved;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function ThemeModeProvider({ children }: PropsWithChildren): JSX.Element {
  const [mode, setMode] = useState<PaletteMode>(getInitialMode);

  useEffect(() => {
    document.documentElement.dataset.theme = mode;
  }, [mode]);

  const value = useMemo<ThemeModeContextValue>(
    () => ({
      mode,
      toggleMode: () => {
        setMode((prev) => {
          const next = prev === 'light' ? 'dark' : 'light';
          window.localStorage.setItem(STORAGE_KEY, next);
          return next;
        });
      },
    }),
    [mode],
  );

  const theme = useMemo(() => createAppTheme(mode), [mode]);

  return (
    <ThemeModeContext.Provider value={value}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        {children}
      </ThemeProvider>
    </ThemeModeContext.Provider>
  );
}

export function useThemeMode(): ThemeModeContextValue {
  const context = useContext(ThemeModeContext);
  if (!context) throw new Error('useThemeMode must be used within ThemeModeProvider');
  return context;
}
