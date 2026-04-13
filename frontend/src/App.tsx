import { useState, useEffect } from 'react';
import { Box, Paper, Typography } from '@mui/material';
import { LoginForm } from './components/LoginForm/LoginForm.tsx';
import { ForgotPasswordForm } from './components/forgot-password-form/forgot-password-form.tsx';
import { ResetPasswordForm } from './components/reset-password-form/reset-password-form.tsx';

type View = 'login' | 'forgot-password' | 'reset-password';

function getInitialView(): View {
  const path = window.location.pathname;
  if (path === '/reset-password') return 'reset-password';
  if (path === '/forgot-password') return 'forgot-password';
  return 'login';
}

const VIEW_TITLES: Record<View, string> = {
  login: 'Login',
  'forgot-password': 'Forgot password',
  'reset-password': 'Reset password',
};

function App(): JSX.Element {
  const [view, setView] = useState<View>(getInitialView);

  useEffect(() => {
    const nextPath = view === 'login' ? '/' : `/${view}`;
    if (window.location.pathname !== nextPath) {
      window.history.pushState(null, '', nextPath + window.location.search);
    }
  }, [view]);

  function navigateTo(next: View): void {
    // Clear any token param when going back to login or forgot-password
    if (next !== 'reset-password') {
      window.history.pushState(null, '', next === 'login' ? '/' : `/${next}`);
    }
    setView(next);
  }

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'grid',
        placeItems: 'center',
        px: 2,
        background: 'linear-gradient(180deg, #f5f9fc 0%, #e8f2f7 100%)',
      }}
    >
      <Paper elevation={3} sx={{ width: '100%', maxWidth: 480, p: 4 }}>
        <Typography component="h1" variant="h5" sx={{ mb: 2 }}>
          {VIEW_TITLES[view]}
        </Typography>

        {view === 'login' && (
          <LoginForm onForgotPassword={() => navigateTo('forgot-password')} />
        )}
        {view === 'forgot-password' && (
          <ForgotPasswordForm onBackToLogin={() => navigateTo('login')} />
        )}
        {view === 'reset-password' && (
          <ResetPasswordForm onBackToLogin={() => navigateTo('login')} />
        )}
      </Paper>
    </Box>
  );
}

export default App;
