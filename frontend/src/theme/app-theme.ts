import { alpha, createTheme, type PaletteMode } from '@mui/material/styles';

// ── LIGHT: Indigo + Slate premium palette ──────────────────────────────────────
const lightPalette = {
  primary:    { main: '#4F46E5', light: '#818CF8', dark: '#3730A3', contrastText: '#FFFFFF' },
  secondary:  { main: '#0EA5E9', light: '#38BDF8', dark: '#0369A1', contrastText: '#FFFFFF' },
  background: { default: '#F8F9FC', paper: '#FFFFFF' },
  text:       { primary: '#0F172A', secondary: '#64748B' },
  divider:    '#E2E8F0',
};

// ── DARK: Rich navy/indigo palette ────────────────────────────────────────────
const darkPalette = {
  primary:    { main: '#818CF8', light: '#A5B4FC', dark: '#6366F1', contrastText: '#0F0E2A' },
  secondary:  { main: '#38BDF8', light: '#7DD3FC', dark: '#0EA5E9', contrastText: '#071E30' },
  background: { default: '#0D1117', paper: '#161B27' },
  text:       { primary: '#E2E8F0', secondary: '#94A3B8' },
  divider:    '#1E2A3A',
};

export function createAppTheme(mode: PaletteMode) {
  const palette = mode === 'dark' ? darkPalette : lightPalette;

  return createTheme({
    palette: {
      mode,
      ...palette,
      success: { main: mode === 'dark' ? '#34D399' : '#059669' },
      warning: { main: mode === 'dark' ? '#FBBF24' : '#D97706' },
      error:   { main: mode === 'dark' ? '#F87171' : '#DC2626' },
      info:    { main: mode === 'dark' ? '#60A5FA' : '#2563EB' },
    },
    typography: {
      fontFamily: "'Inter', 'Plus Jakarta Sans', system-ui, sans-serif",
      h1: { fontWeight: 800, letterSpacing: '-0.03em' },
      h2: { fontWeight: 800, letterSpacing: '-0.025em' },
      h3: { fontWeight: 700, letterSpacing: '-0.02em' },
      h4: { fontWeight: 700, letterSpacing: '-0.015em' },
      h5: { fontWeight: 600, letterSpacing: '-0.01em' },
      h6: { fontWeight: 600 },
      body1: { lineHeight: 1.65 },
      body2: { lineHeight: 1.6 },
      button: { textTransform: 'none', fontWeight: 600, letterSpacing: '0.01em' },
    },
    shape: { borderRadius: 12 },
    components: {
      MuiCssBaseline: {
        styleOverrides: {
          ':root': {
            colorScheme: mode,
            '--primary':      palette.primary.main,
            '--primary-light': palette.primary.light,
            '--primary-bg':   alpha(palette.primary.main, mode === 'dark' ? 0.18 : 0.08),
            '--sidebar-bg':   mode === 'dark' ? '#10131C' : '#FAFBFF',
            '--sidebar-text': palette.text.secondary,
            '--sidebar-active': palette.primary.main,
            '--bg':           palette.background.default,
            '--card':         palette.background.paper,
            '--text':         palette.text.primary,
            '--text-muted':   palette.text.secondary,
            '--border':       palette.divider,
            '--green':  mode === 'dark' ? '#34D399' : '#059669',
            '--orange': mode === 'dark' ? '#FB923C' : '#EA580C',
            '--blue':   mode === 'dark' ? '#60A5FA' : '#2563EB',
            '--pink':   mode === 'dark' ? '#F472B6' : '#DB2777',
            '--yellow': mode === 'dark' ? '#FBBF24' : '#D97706',
            '--red':    mode === 'dark' ? '#F87171' : '#DC2626',
          },
          body: {
            background:
              mode === 'dark'
                ? 'linear-gradient(160deg, #0D1117 0%, #111827 100%)'
                : 'linear-gradient(160deg, #F1F5F9 0%, #F8F9FC 100%)',
          },
          '::selection': {
            backgroundColor: alpha(palette.primary.main, mode === 'dark' ? 0.45 : 0.28),
          },
        },
      },
      MuiPaper: {
        styleOverrides: {
          root: {
            borderRadius: 14,
            border: `1px solid ${palette.divider}`,
            boxShadow:
              mode === 'dark'
                ? '0 1px 3px rgba(0,0,0,0.4), 0 8px 32px rgba(0,0,0,0.35)'
                : '0 1px 3px rgba(15,23,42,0.04), 0 8px 24px rgba(15,23,42,0.07)',
            backgroundImage: 'none',
          },
          elevation0: { boxShadow: 'none' },
        },
      },
      MuiButton: {
        styleOverrides: {
          root: {
            borderRadius: 8,
            paddingBlock: '0.55rem',
            paddingInline: '1.25rem',
          },
          contained: {
            boxShadow: mode === 'dark'
              ? `0 0 0 1px ${alpha(palette.primary.light, 0.25)}, 0 2px 8px ${alpha(palette.primary.dark, 0.45)}`
              : `0 1px 2px ${alpha(palette.primary.dark, 0.18)}, 0 3px 10px ${alpha(palette.primary.main, 0.28)}`,
            '&:hover': {
              boxShadow: mode === 'dark'
                ? `0 0 0 1px ${alpha(palette.primary.light, 0.4)}, 0 4px 16px ${alpha(palette.primary.dark, 0.5)}`
                : `0 1px 2px ${alpha(palette.primary.dark, 0.2)}, 0 4px 14px ${alpha(palette.primary.main, 0.38)}`,
            },
          },
          outlined: {
            borderWidth: '1.5px',
            '&:hover': { borderWidth: '1.5px' },
          },
        },
      },
      MuiTextField: {
        defaultProps: { size: 'small' },
      },
      MuiOutlinedInput: {
        styleOverrides: {
          root: {
            backgroundColor: mode === 'dark'
              ? alpha('#161B27', 0.7)
              : alpha('#FFFFFF', 0.9),
            '&:hover .MuiOutlinedInput-notchedOutline': {
              borderColor: palette.primary.main,
            },
          },
          notchedOutline: {
            borderColor: palette.divider,
            transition: 'border-color 0.15s',
          },
        },
      },
      MuiInputLabel: {
        styleOverrides: {
          root: { fontSize: '0.875rem' },
        },
      },
      MuiChip: {
        styleOverrides: {
          root: { fontWeight: 600, fontSize: '0.75rem' },
        },
      },
      MuiDrawer: {
        styleOverrides: {
          paper: {
            backgroundColor: mode === 'dark' ? '#10131C' : '#FAFBFF',
            borderRight: `1px solid ${palette.divider}`,
            boxShadow: 'none',
          },
        },
      },
      MuiListItemButton: {
        styleOverrides: {
          root: {
            borderRadius: 8,
            margin: '1px 8px',
            paddingInline: '10px',
          },
        },
      },
      MuiDivider: {
        styleOverrides: {
          root: { borderColor: palette.divider },
        },
      },
    },
  });
}
