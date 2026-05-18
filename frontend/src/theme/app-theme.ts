import { alpha, createTheme, type PaletteMode } from '@mui/material/styles';

// ── LIGHT: Professional Blue + Slate palette ─────────────────────────────────
const lightPalette = {
  primary:    { main: '#2563EB', light: '#3b82f6', dark: '#1d4ed8', contrastText: '#FFFFFF' },
  secondary:  { main: '#0EA5E9', light: '#38BDF8', dark: '#0369A1', contrastText: '#FFFFFF' },
  background: { default: '#F8FAFC', paper: '#FFFFFF' },
  text:       { primary: '#0F172A', secondary: '#64748B' },
  divider:    '#E2E8F0',
};

// ── DARK: Deep charcoal + blue palette ────────────────────────────────────────
const darkPalette = {
  primary:    { main: '#3b82f6', light: '#60a5fa', dark: '#2563EB', contrastText: '#0D1117' },
  secondary:  { main: '#38BDF8', light: '#7DD3FC', dark: '#0EA5E9', contrastText: '#071E30' },
  background: { default: '#0D1117', paper: '#161B27' },
  text:       { primary: '#E2E8F0', secondary: '#94A3B8' },
  divider:    '#1E2A3A',
};

export const SIDEBAR_WIDTH = 256;
export const SIDEBAR_COLLAPSED_WIDTH = 68;

export function createAppTheme(mode: PaletteMode) {
  const palette = mode === 'dark' ? darkPalette : lightPalette;
  const sidebarBg = mode === 'dark' ? '#0D1117' : '#111827';

  return createTheme({
    palette: {
      mode,
      ...palette,
      success: { main: mode === 'dark' ? '#34D399' : '#059669', contrastText: '#fff' },
      warning: { main: mode === 'dark' ? '#FBBF24' : '#D97706', contrastText: '#fff' },
      error:   { main: mode === 'dark' ? '#F87171' : '#DC2626', contrastText: '#fff' },
      info:    { main: mode === 'dark' ? '#60A5FA' : '#2563EB', contrastText: '#fff' },
    },
    typography: {
      fontFamily: "'Inter', 'Plus Jakarta Sans', system-ui, -apple-system, sans-serif",
      fontSize: 14,
      h1: { fontWeight: 800, letterSpacing: '-0.03em', lineHeight: 1.2 },
      h2: { fontWeight: 800, letterSpacing: '-0.025em', lineHeight: 1.25 },
      h3: { fontWeight: 700, letterSpacing: '-0.02em', lineHeight: 1.3 },
      h4: { fontWeight: 700, letterSpacing: '-0.015em', lineHeight: 1.35 },
      h5: { fontWeight: 600, letterSpacing: '-0.01em', lineHeight: 1.4 },
      h6: { fontWeight: 600, lineHeight: 1.4 },
      subtitle1: { fontWeight: 600, lineHeight: 1.5 },
      subtitle2: { fontWeight: 600, lineHeight: 1.5, fontSize: '0.8125rem' },
      body1: { lineHeight: 1.65 },
      body2: { lineHeight: 1.6, fontSize: '0.8125rem' },
      caption: { fontSize: '0.75rem', lineHeight: 1.5 },
      overline: { fontSize: '0.6875rem', fontWeight: 700, letterSpacing: '0.08em' },
      button: { textTransform: 'none', fontWeight: 600, letterSpacing: '0.01em' },
    },
    shape: { borderRadius: 10 },
    shadows: [
      'none',
      mode === 'dark'
        ? '0 1px 3px rgba(0,0,0,0.5)'
        : '0 1px 2px rgba(15,23,42,0.06)',
      mode === 'dark'
        ? '0 1px 4px rgba(0,0,0,0.4), 0 4px 12px rgba(0,0,0,0.25)'
        : '0 1px 3px rgba(15,23,42,0.05), 0 4px 12px rgba(15,23,42,0.08)',
      mode === 'dark'
        ? '0 2px 8px rgba(0,0,0,0.4), 0 8px 24px rgba(0,0,0,0.3)'
        : '0 2px 6px rgba(15,23,42,0.06), 0 8px 20px rgba(15,23,42,0.08)',
      ...Array(21).fill('none'),
    ] as import('@mui/material').Shadows,
    components: {
      MuiCssBaseline: {
        styleOverrides: {
          ':root': {
            colorScheme: mode,
            '--primary':        palette.primary.main,
            '--primary-light':  palette.primary.light,
            '--primary-bg':     alpha(palette.primary.main, mode === 'dark' ? 0.18 : 0.08),
            '--sidebar-bg':     sidebarBg,
            '--sidebar-text':   'rgba(255,255,255,0.65)',
            '--sidebar-active': palette.primary.main,
            '--bg':             palette.background.default,
            '--card':           palette.background.paper,
            '--text':           palette.text.primary,
            '--text-muted':     palette.text.secondary,
            '--border':         palette.divider,
            '--green':  mode === 'dark' ? '#34D399' : '#059669',
            '--orange': mode === 'dark' ? '#FB923C' : '#EA580C',
            '--blue':   mode === 'dark' ? '#60A5FA' : '#2563EB',
            '--pink':   mode === 'dark' ? '#F472B6' : '#DB2777',
            '--yellow': mode === 'dark' ? '#FBBF24' : '#D97706',
            '--red':    mode === 'dark' ? '#F87171' : '#DC2626',
            '--nav-width':      `${SIDEBAR_WIDTH}px`,
            '--nav-collapsed':  `${SIDEBAR_COLLAPSED_WIDTH}px`,
            '--topbar-height':  '60px',
            '--transition-fast': '150ms cubic-bezier(0.4,0,0.2,1)',
            '--transition-base': '250ms cubic-bezier(0.4,0,0.2,1)',
            '--radius':         '10px',
            '--radius-sm':      '6px',
            '--radius-lg':      '14px',
          },
          '*': {
            scrollbarWidth: 'thin',
            scrollbarColor: mode === 'dark'
              ? 'rgba(255,255,255,0.1) transparent'
              : 'rgba(15,23,42,0.12) transparent',
          },
          '*::-webkit-scrollbar': { width: '6px', height: '6px' },
          '*::-webkit-scrollbar-track': { background: 'transparent' },
          '*::-webkit-scrollbar-thumb': {
            borderRadius: '3px',
            background: mode === 'dark' ? 'rgba(255,255,255,0.1)' : 'rgba(15,23,42,0.12)',
          },
          body: {
            background: palette.background.default,
            minHeight: '100vh',
          },
          '::selection': {
            backgroundColor: alpha(palette.primary.main, mode === 'dark' ? 0.45 : 0.28),
          },
          'a': { color: 'inherit' },
        },
      },
      MuiAppBar: {
        defaultProps: { elevation: 0 },
        styleOverrides: {
          root: {
            backgroundColor: palette.background.paper,
            borderBottom: `1px solid ${palette.divider}`,
            color: palette.text.primary,
          },
        },
      },
      MuiPaper: {
        defaultProps: { elevation: 1 },
        styleOverrides: {
          root: {
            borderRadius: 12,
            backgroundImage: 'none',
          },
          elevation0: {
            boxShadow: 'none',
            border: `1px solid ${palette.divider}`,
          },
          elevation1: {
            boxShadow: mode === 'dark'
              ? '0 1px 3px rgba(0,0,0,0.5)'
              : '0 1px 2px rgba(15,23,42,0.06)',
            border: `1px solid ${palette.divider}`,
          },
          elevation2: {
            boxShadow: mode === 'dark'
              ? '0 2px 8px rgba(0,0,0,0.4), 0 4px 16px rgba(0,0,0,0.3)'
              : '0 2px 6px rgba(15,23,42,0.06), 0 6px 16px rgba(15,23,42,0.08)',
            border: `1px solid ${palette.divider}`,
          },
        },
      },
      MuiCard: {
        defaultProps: { elevation: 1 },
        styleOverrides: {
          root: {
            borderRadius: 12,
            border: `1px solid ${palette.divider}`,
            backgroundImage: 'none',
            transition: 'box-shadow 200ms ease, transform 200ms ease',
            '&:hover': {
              boxShadow: mode === 'dark'
                ? '0 4px 16px rgba(0,0,0,0.4), 0 8px 32px rgba(0,0,0,0.3)'
                : '0 4px 12px rgba(15,23,42,0.08), 0 8px 24px rgba(15,23,42,0.1)',
            },
          },
        },
      },
      MuiCardContent: {
        styleOverrides: {
          root: {
            padding: '20px',
            '&:last-child': { paddingBottom: '20px' },
          },
        },
      },
      MuiButton: {
        defaultProps: { disableElevation: true },
        styleOverrides: {
          root: {
            borderRadius: 8,
            paddingBlock: '7px',
            paddingInline: '16px',
            fontSize: '0.8125rem',
            fontWeight: 600,
            transition: 'all 150ms ease',
          },
          sizeSmall: {
            paddingBlock: '4px',
            paddingInline: '10px',
            fontSize: '0.75rem',
          },
          sizeLarge: {
            paddingBlock: '11px',
            paddingInline: '22px',
            fontSize: '0.9375rem',
          },
          contained: {
            boxShadow: `0 1px 2px ${alpha(palette.primary.dark, 0.2)}, 0 2px 8px ${alpha(palette.primary.main, 0.25)}`,
            '&:hover': {
              boxShadow: `0 2px 4px ${alpha(palette.primary.dark, 0.25)}, 0 4px 12px ${alpha(palette.primary.main, 0.35)}`,
              transform: 'translateY(-1px)',
            },
            '&:active': { transform: 'translateY(0)' },
          },
          outlined: {
            borderWidth: '1.5px',
            '&:hover': { borderWidth: '1.5px' },
          },
          text: {
            '&:hover': { backgroundColor: alpha(palette.primary.main, 0.06) },
          },
        },
      },
      MuiIconButton: {
        styleOverrides: {
          root: {
            borderRadius: 8,
            transition: 'all 150ms ease',
          },
        },
      },
      MuiTextField: {
        defaultProps: { size: 'small' },
      },
      MuiOutlinedInput: {
        styleOverrides: {
          root: {
            borderRadius: 8,
            backgroundColor: mode === 'dark'
              ? alpha('#161B27', 0.6)
              : alpha('#FFFFFF', 0.9),
            transition: 'box-shadow 150ms ease',
            '&:hover .MuiOutlinedInput-notchedOutline': {
              borderColor: palette.primary.main,
            },
            '&.Mui-focused': {
              boxShadow: `0 0 0 3px ${alpha(palette.primary.main, 0.15)}`,
            },
          },
          notchedOutline: {
            borderColor: palette.divider,
            transition: 'border-color 150ms ease',
          },
        },
      },
      MuiInputLabel: {
        styleOverrides: {
          root: { fontSize: '0.8125rem', fontWeight: 500 },
        },
      },
      MuiFormHelperText: {
        styleOverrides: {
          root: { fontSize: '0.75rem', marginTop: '4px' },
        },
      },
      MuiChip: {
        styleOverrides: {
          root: {
            fontWeight: 600,
            fontSize: '0.75rem',
            borderRadius: 6,
            height: 26,
          },
          label: { paddingInline: '8px' },
          sizeSmall: { height: 22, fontSize: '0.6875rem' },
        },
      },
      MuiDrawer: {
        styleOverrides: {
          paper: {
            backgroundColor: sidebarBg,
            borderRight: 'none',
            boxShadow: mode === 'light'
              ? '2px 0 20px rgba(15,23,42,0.12)'
              : '2px 0 20px rgba(0,0,0,0.4)',
          },
        },
      },
      MuiListItemButton: {
        styleOverrides: {
          root: {
            borderRadius: 8,
            margin: '1px 8px',
            paddingBlock: '8px',
            paddingInline: '10px',
            transition: 'all 150ms ease',
          },
        },
      },
      MuiListItemIcon: {
        styleOverrides: {
          root: { minWidth: 36 },
        },
      },
      MuiDivider: {
        styleOverrides: {
          root: { borderColor: palette.divider },
        },
      },
      MuiTooltip: {
        defaultProps: { arrow: true },
        styleOverrides: {
          tooltip: {
            backgroundColor: mode === 'dark' ? '#334155' : '#1E293B',
            fontSize: '0.75rem',
            fontWeight: 500,
            padding: '6px 10px',
            borderRadius: 6,
          },
          arrow: {
            color: mode === 'dark' ? '#334155' : '#1E293B',
          },
        },
      },
      MuiTableHead: {
        styleOverrides: {
          root: {
            '& .MuiTableCell-head': {
              backgroundColor: mode === 'dark'
                ? alpha('#FFFFFF', 0.04)
                : alpha('#F1F5F9', 0.8),
              fontWeight: 700,
              fontSize: '0.75rem',
              letterSpacing: '0.05em',
              textTransform: 'uppercase',
              color: palette.text.secondary,
              borderBottom: `1px solid ${palette.divider}`,
              padding: '10px 16px',
            },
          },
        },
      },
      MuiTableCell: {
        styleOverrides: {
          root: {
            borderBottom: `1px solid ${palette.divider}`,
            padding: '12px 16px',
            fontSize: '0.8125rem',
          },
        },
      },
      MuiTableRow: {
        styleOverrides: {
          root: {
            transition: 'background-color 150ms ease',
            '&:hover': {
              backgroundColor: mode === 'dark'
                ? alpha('#FFFFFF', 0.03)
                : alpha('#4F46E5', 0.03),
            },
            '&:last-child .MuiTableCell-root': { borderBottom: 'none' },
          },
        },
      },
      MuiAlert: {
        styleOverrides: {
          root: {
            borderRadius: 10,
            fontSize: '0.8125rem',
            alignItems: 'center',
          },
          standard: {
            border: '1px solid currentColor',
            borderColor: 'inherit',
          },
        },
      },
      MuiLinearProgress: {
        styleOverrides: {
          root: { borderRadius: 4, height: 6 },
          bar: { borderRadius: 4 },
        },
      },
      MuiSkeleton: {
        defaultProps: { animation: 'wave' },
        styleOverrides: {
          root: { borderRadius: 8 },
        },
      },
      MuiBadge: {
        styleOverrides: {
          badge: { fontSize: '0.625rem', fontWeight: 700, minWidth: 18, height: 18 },
        },
      },
      MuiDialog: {
        styleOverrides: {
          paper: {
            borderRadius: 16,
            boxShadow: mode === 'dark'
              ? '0 8px 40px rgba(0,0,0,0.6)'
              : '0 8px 40px rgba(15,23,42,0.15)',
          },
        },
      },
      MuiDialogTitle: {
        styleOverrides: {
          root: { padding: '20px 24px 12px', fontWeight: 700, fontSize: '1rem' },
        },
      },
      MuiDialogContent: {
        styleOverrides: {
          root: { padding: '12px 24px' },
        },
      },
      MuiDialogActions: {
        styleOverrides: {
          root: { padding: '12px 24px 20px', gap: '8px' },
        },
      },
      MuiSelect: {
        styleOverrides: {
          select: { fontSize: '0.8125rem' },
        },
      },
      MuiMenuItem: {
        styleOverrides: {
          root: {
            fontSize: '0.8125rem',
            borderRadius: 6,
            margin: '1px 4px',
            paddingBlock: '7px',
          },
        },
      },
      MuiTabs: {
        styleOverrides: {
          root: { minHeight: 42 },
          indicator: { height: 2, borderRadius: '2px 2px 0 0' },
        },
      },
      MuiTab: {
        styleOverrides: {
          root: {
            minHeight: 42,
            fontSize: '0.8125rem',
            fontWeight: 600,
            textTransform: 'none',
            paddingBlock: '8px',
          },
        },
      },
    },
  });
}
