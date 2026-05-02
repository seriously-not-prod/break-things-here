import { Box, CircularProgress, CssBaseline, Paper, Typography } from '@mui/material';
import { BrowserRouter, Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/auth-context';
import { LoginForm } from './components/login-form/login-form';
import { RegisterForm } from './components/register-form/register-form';
import { ForgotPasswordForm } from './components/forgot-password-form/forgot-password-form';
import { ResetPasswordForm } from './components/reset-password-form/reset-password-form';
import { AppNav } from './components/nav/app-nav';
import Dashboard from './components/dashboard/Dashboard';
import EventsPage from './components/events/events-page';
import EventDetailPage from './components/events/event-detail-page';
import EventsDashboard from './components/events/events-dashboard';
import EventFormPage from './components/events/event-form-page';
import PublicRsvpPage from './components/events/public-rsvp-page';
import ProfilePage from './components/profile/profile-page';
import AdminPage from './components/admin/admin-page';
import { AiAssistant } from './components/ai/ai-assistant';
import { useState } from 'react';

type AuthView = 'login' | 'register' | 'forgot-password' | 'reset-password';

/** Centred auth card used for login / register / password flows */
function AuthShell(): JSX.Element {
  const [view, setView] = useState<AuthView>('login');
  const navigate = useNavigate();

  const TITLES: Record<AuthView, string> = {
    login: 'Sign in',
    register: 'Create account',
    'forgot-password': 'Forgot password',
    'reset-password': 'Reset password',
  };

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'grid',
        placeItems: 'center',
        px: 2,
        background: 'linear-gradient(160deg, rgba(15,107,143,0.18) 0%, rgba(15,107,143,0.06) 42%, #f5f9fc 100%)',
      }}
    >
      <Paper
        elevation={8}
        sx={{
          width: '100%',
          maxWidth: 460,
          p: 4,
          borderRadius: 4,
          border: '1px solid',
          borderColor: 'primary.light',
          bgcolor: 'background.paper',
        }}
      >
        <Typography component="h1" variant="h5" fontWeight={700} color="primary.main" sx={{ mb: 2 }}>
          🎪 Festival Planner
        </Typography>
        <Typography variant="h6" sx={{ mb: 3 }}>
          {TITLES[view]}
        </Typography>

        {view === 'login' && (
          <LoginForm
            onForgotPassword={() => setView('forgot-password')}
            onLogin={() => navigate('/dashboard', { replace: true })}
            onRegister={() => setView('register')}
          />
        )}
        {view === 'register' && (
          <RegisterForm
            onBackToLogin={() => setView('login')}
            onRegistered={() => setView('login')}
          />
        )}
        {view === 'forgot-password' && (
          <ForgotPasswordForm onBackToLogin={() => setView('login')} />
        )}
        {view === 'reset-password' && (
          <ResetPasswordForm onBackToLogin={() => setView('login')} />
        )}
      </Paper>
    </Box>
  );
}

const DRAWER_WIDTH = 220;

/** App shell with sidebar nav — only shown when authenticated */
function AppShell(): JSX.Element {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <CircularProgress />
      </Box>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return (
    <Box sx={{ display: 'flex' }}>
      <AppNav />
      <Box component="main" sx={{ flexGrow: 1, ml: `${DRAWER_WIDTH}px`, minHeight: '100vh', bgcolor: 'background.default' }}>
        <Routes>
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/events/dashboard" element={<EventsDashboard />} />
          <Route path="/events" element={<EventsPage />} />
          <Route path="/events/new" element={<EventFormPage />} />
          <Route path="/events/calendar" element={<EventsPage />} />
          <Route path="/events/my" element={<EventsPage />} />
          <Route path="/events/:id" element={<EventDetailPage />} />
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="/admin" element={<AdminPage />} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </Box>
      <AiAssistant />
    </Box>
  );
}

function RootRouter(): JSX.Element {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/dashboard" replace /> : <AuthShell />} />
      <Route path="/register" element={user ? <Navigate to="/dashboard" replace /> : <AuthShell />} />
      <Route path="/forgot-password" element={<AuthShell />} />
      <Route path="/reset-password" element={<AuthShell />} />
      <Route path="/rsvp/:eventId" element={<PublicRsvpPage />} />
      <Route path="/*" element={<AppShell />} />
    </Routes>
  );
}

function App(): JSX.Element {
  return (
    <BrowserRouter>
      <CssBaseline />
      <AuthProvider>
        <RootRouter />
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;

