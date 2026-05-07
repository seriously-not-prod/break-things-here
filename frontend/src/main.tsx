import React from 'react';
import ReactDOM from 'react-dom/client';
import { CssBaseline, ThemeProvider, createTheme } from '@mui/material';
import App from './App';

const theme = createTheme({
  palette: {
    primary: {
      main: '#6C3EF4',        // Eventora purple
      light: '#9B7FFB',
      dark: '#4B2AC9',
    },
    background: {
      default: '#F4F5FA',     // Eventora bg
      paper: '#FFFFFF',
    },
    text: {
      primary: '#1E1B39',     // Eventora dark
      secondary: '#8B8AAA',
    },
  },
  typography: {
    fontFamily: "'Plus Jakarta Sans', Inter, system-ui, sans-serif",
  },
  shape: {
    borderRadius: 14,
  },
  components: {
    MuiPaper: {
      styleOverrides: {
        root: {
          borderRadius: 14,
          boxShadow: '0 2px 12px rgba(108,62,244,0.08)',
        },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: 8,
          textTransform: 'none',
          fontWeight: 600,
        },
      },
    },
    MuiTextField: {
      defaultProps: { size: 'small' },
    },
  },
});

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <App />
    </ThemeProvider>
  </React.StrictMode>
);
