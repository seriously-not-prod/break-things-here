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
import CalendarPage from './components/events/calendar-page';
import EventDetailPage from './components/events/event-detail-page';
import PublicRsvpPage from './components/events/public-rsvp-page';
import ProfilePage from './components/profile/profile-page';
import AdminPage from './components/admin/admin-page';
import { AiAssistant } from './components/ai/ai-assistant';
import { AnalyticsPage } from './components/analytics/analytics-page';
import EventFormPage from './components/events/event-form-page';
import VendorsPage from './components/vendors/vendors-page';
import ShoppingPage from './components/shopping/shopping-page';
import TimelinePage from './components/timeline/timeline-page';
import { CheckInPage } from './components/checkin/checkin-page';
import { SeatingPage } from './components/seating/seating-page';
import GuestsPage from './components/guests/guests-page';
import BudgetPage from './components/budget/budget-page';
import TasksKanbanPage from './components/tasks/tasks-kanban-page';
import { GalleryPage } from './components/gallery/gallery-page';
import { MessagesInbox } from './components/messages/messages-inbox';
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
    background: 'linear-gradient(135deg, #EEE9FD 0%, #F4F5FA 60%, #fff 100%)',
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
        <Typography component="h1" variant="h5" fontWeight={800} color="primary.main" sx={{ mb: 2 }}>
          Eventora
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
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
          <Route path="/events" element={<EventsPage />} />
          <Route path="/events/new" element={<EventFormPage />} />
          <Route path="/events/calendar" element={<CalendarPage />} />
          <Route path="/events/my" element={<EventsPage />} />
          <Route path="/events/:id" element={<EventDetailPage />} />
          <Route path="/events/:id/analytics" element={<AnalyticsPage />} />
          <Route path="/events/:id/vendors" element={<VendorsPage />} />
          <Route path="/events/:id/shopping" element={<ShoppingPage />} />
          <Route path="/events/:id/timeline" element={<TimelinePage />} />
          <Route path="/events/:id/checkin" element={<CheckInPage />} />
          <Route path="/events/:id/seating" element={<SeatingPage />} />
          <Route path="/events/:id/guests" element={<GuestsPage />} />
          <Route path="/events/:id/budget" element={<BudgetPage />} />
          <Route path="/events/:id/tasks" element={<TasksKanbanPage />} />
          <Route path="/events/:id/gallery" element={<GalleryPage />} />
          <Route path="/messages" element={<MessagesInbox />} />
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

