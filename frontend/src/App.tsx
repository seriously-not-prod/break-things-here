import { Box, CircularProgress, Paper, Typography } from '@mui/material';
import { BrowserRouter, Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import { ErrorBoundary } from './components/ErrorBoundary/ErrorBoundary';
import { AuthProvider, useAuth } from './contexts/auth-context';
import { ThemeModeProvider } from './theme/theme-mode-context';
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
import QrScannerPage from './components/checkin/qr-scanner-page';
import AttendanceBoardPage from './components/checkin/attendance-board-page';
import { SeatingPage } from './components/seating/seating-page';
import GuestsPage from './components/guests/guests-page';
import BudgetPage from './components/budget/budget-page';
import TasksKanbanPage from './components/tasks/tasks-kanban-page';
import { GalleryPage } from './components/gallery/gallery-page';
import { EventRouteGuard } from './components/layout/event-route-guard';
import { MessagesInbox } from './components/messages/messages-inbox';
import { EntraCallbackPage } from './components/auth/entra-callback';
import { useKeyboardShortcuts, type ShortcutDefinition } from './hooks/use-keyboard-shortcuts';
import { KeyboardShortcutsOverlay } from './components/keyboard-shortcuts/keyboard-shortcuts-overlay';
import { useState, useMemo } from 'react';

type AuthView = 'login' | 'register' | 'forgot-password' | 'reset-password';

/** Centred auth card used for login / register / password flows */
function AuthShell(): JSX.Element {
  const [view, setView] = useState<AuthView>('login');
  const navigate = useNavigate();

  const VIEW_SUBTITLES: Record<AuthView, string> = {
    login: 'Sign in to access your workspace',
    register: 'Create your account to get started',
    'forgot-password': 'Enter your email to receive a reset link',
    'reset-password': 'Set your new password',
  };

  const VIEW_TITLES: Record<AuthView, string> = {
    login: 'Welcome back',
    register: 'Create account',
    'forgot-password': 'Forgot password',
    'reset-password': 'Reset password',
  };

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        px: 2,
        py: 4,
        background: 'linear-gradient(145deg, #0f172a 0%, #1e3a5f 40%, #1d4ed8 100%)',
        position: 'relative',
        overflow: 'hidden',
        '&::before': {
          content: '""',
          position: 'absolute',
          top: '-20%',
          right: '-10%',
          width: '60%',
          height: '60%',
          borderRadius: '50%',
          background: 'rgba(255,255,255,0.03)',
          pointerEvents: 'none',
        },
        '&::after': {
          content: '""',
          position: 'absolute',
          bottom: '-10%',
          left: '-5%',
          width: '40%',
          height: '40%',
          borderRadius: '50%',
          background: 'rgba(255,255,255,0.04)',
          pointerEvents: 'none',
        },
      }}
    >
      <Paper
        elevation={0}
        sx={{
          width: '100%',
          maxWidth: 460,
          p: { xs: 3, sm: 4 },
          borderRadius: 3,
          bgcolor: 'background.paper',
          boxShadow: '0 24px 80px rgba(0,0,0,0.35)',
          position: 'relative',
          zIndex: 1,
        }}
      >
        {/* Brand header */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2.5 }}>
          <Box
            sx={{
              width: 40,
              height: 40,
              borderRadius: '10px',
              background: 'linear-gradient(135deg, #2563EB 0%, #0ea5e9 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '0.8125rem',
              fontWeight: 800,
              color: '#fff',
              letterSpacing: '-0.5px',
              flexShrink: 0,
            }}
          >
            EF
          </Box>
          <Box>
            <Typography component="h1" variant="h6" fontWeight={800} color="text.primary" sx={{ lineHeight: 1.1 }}>
              eQuip Fest
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1 }}>
              Festival Event Management
            </Typography>
          </Box>
        </Box>

        <Box sx={{ mb: 3 }}>
          <Typography variant="h5" fontWeight={700} color="text.primary" sx={{ mb: 0.5 }}>
            {VIEW_TITLES[view]}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {VIEW_SUBTITLES[view]}
          </Typography>
        </Box>

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

/**
 * Inner component that registers all application-wide keyboard shortcuts.
 * Must be rendered inside React Router so it can call `useNavigate`.
 */
function GlobalShortcuts({
  onToggleHelp,
  onCloseHelp,
  onOpenHelp,
}: {
  onToggleHelp: () => void;
  onCloseHelp: () => void;
  onOpenHelp: () => void;
}): null {
  const navigate = useNavigate();

  const shortcuts: ShortcutDefinition[] = useMemo(
    () => [
      {
        id: 'help-toggle',
        keys: '?',
        label: 'Show / hide this help overlay',
        category: 'Global',
        action: onToggleHelp,
      },
      {
        id: 'help-close',
        keys: 'Escape',
        label: 'Close overlay',
        category: 'Global',
        action: onCloseHelp,
      },
      {
        id: 'nav-dashboard',
        keys: ['g', 'd'],
        label: 'Go to Dashboard',
        category: 'Navigation',
        action: () => navigate('/dashboard'),
      },
      {
        id: 'nav-events',
        keys: ['g', 'e'],
        label: 'Go to Events',
        category: 'Navigation',
        action: () => navigate('/events'),
      },
      {
        id: 'nav-calendar',
        keys: ['g', 'c'],
        label: 'Go to Calendar',
        category: 'Navigation',
        action: () => navigate('/events/calendar'),
      },
      {
        id: 'nav-messages',
        keys: ['g', 'm'],
        label: 'Go to Messages',
        category: 'Navigation',
        action: () => navigate('/messages'),
      },
      {
        id: 'nav-profile',
        keys: ['g', 'p'],
        label: 'Go to Profile',
        category: 'Navigation',
        action: () => navigate('/profile'),
      },
      {
        id: 'nav-new-event',
        keys: ['g', 'n'],
        label: 'Create new event',
        category: 'Navigation',
        action: () => navigate('/events/new'),
      },
      {
        id: 'help-open',
        keys: 'F1',
        label: 'Show keyboard shortcuts help',
        category: 'Global',
        action: onOpenHelp,
      },
    ],
    [navigate, onToggleHelp, onCloseHelp, onOpenHelp],
  );

  useKeyboardShortcuts(shortcuts);

  return null;
}

/** App shell with sidebar nav — only shown when authenticated */
function AppShell(): JSX.Element {
  const { user, loading } = useAuth();
  const [helpOpen, setHelpOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const handleToggleHelp = useMemo(() => () => setHelpOpen((v) => !v), []);
  const handleOpenHelp = useMemo(() => () => setHelpOpen(true), []);
  const handleCloseHelp = useMemo(() => () => setHelpOpen(false), []);
  const handleToggleSidebar = useMemo(() => () => setSidebarCollapsed((v) => !v), []);

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

  const shortcuts: ShortcutDefinition[] = [
    {
      id: 'help-toggle',
      keys: '?',
      label: 'Show / hide this help overlay',
      category: 'Global',
      action: handleToggleHelp,
    },
    {
      id: 'help-close',
      keys: 'Escape',
      label: 'Close overlay',
      category: 'Global',
      action: handleCloseHelp,
    },
    {
      id: 'help-open',
      keys: 'F1',
      label: 'Show keyboard shortcuts help',
      category: 'Global',
      action: handleOpenHelp,
    },
    {
      id: 'nav-dashboard',
      keys: ['g', 'd'] as [string, string],
      label: 'Go to Dashboard',
      category: 'Navigation',
      action: () => undefined,
    },
    {
      id: 'nav-events',
      keys: ['g', 'e'] as [string, string],
      label: 'Go to Events',
      category: 'Navigation',
      action: () => undefined,
    },
    {
      id: 'nav-calendar',
      keys: ['g', 'c'] as [string, string],
      label: 'Go to Calendar',
      category: 'Navigation',
      action: () => undefined,
    },
    {
      id: 'nav-messages',
      keys: ['g', 'm'] as [string, string],
      label: 'Go to Messages',
      category: 'Navigation',
      action: () => undefined,
    },
    {
      id: 'nav-profile',
      keys: ['g', 'p'] as [string, string],
      label: 'Go to Profile',
      category: 'Navigation',
      action: () => undefined,
    },
    {
      id: 'nav-new-event',
      keys: ['g', 'n'] as [string, string],
      label: 'Create new event',
      category: 'Navigation',
      action: () => undefined,
    },
  ];

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh' }}>
      <AppNav collapsed={sidebarCollapsed} onToggleCollapse={handleToggleSidebar} />
      <Box
        component="main"
        sx={{
          flexGrow: 1,
          minHeight: '100vh',
          bgcolor: 'background.default',
          transition: 'margin-left 250ms cubic-bezier(0.4,0,0.2,1)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        <ErrorBoundary>
        <Routes>
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/events" element={<EventsPage />} />
          <Route path="/events/new" element={<EventFormPage />} />
          <Route path="/events/calendar" element={<CalendarPage />} />
          <Route path="/events/my" element={<EventsPage ownerOnly />} />
          <Route path="/events/:id" element={<EventRouteGuard><EventDetailPage /></EventRouteGuard>} />
          <Route path="/events/:id/analytics" element={<EventRouteGuard><AnalyticsPage /></EventRouteGuard>} />
          <Route path="/events/:id/vendors" element={<EventRouteGuard><VendorsPage /></EventRouteGuard>} />
          <Route path="/events/:id/shopping" element={<EventRouteGuard><ShoppingPage /></EventRouteGuard>} />
          <Route path="/events/:id/timeline" element={<EventRouteGuard><TimelinePage /></EventRouteGuard>} />
          <Route path="/events/:id/checkin" element={<EventRouteGuard><CheckInPage /></EventRouteGuard>} />
          <Route path="/events/:id/checkin/scan" element={<EventRouteGuard><QrScannerPage /></EventRouteGuard>} />
          <Route path="/events/:id/attendance" element={<EventRouteGuard><AttendanceBoardPage /></EventRouteGuard>} />
          <Route path="/events/:id/seating" element={<EventRouteGuard><SeatingPage /></EventRouteGuard>} />
          <Route path="/events/:id/guests" element={<EventRouteGuard><GuestsPage /></EventRouteGuard>} />
          <Route path="/events/:id/budget" element={<EventRouteGuard><BudgetPage /></EventRouteGuard>} />
          <Route path="/events/:id/tasks" element={<EventRouteGuard><TasksKanbanPage /></EventRouteGuard>} />
          <Route path="/events/:id/gallery" element={<EventRouteGuard><GalleryPage /></EventRouteGuard>} />
          <Route path="/messages" element={<MessagesInbox />} />
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="/admin" element={<AdminPage />} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
        </ErrorBoundary>
      </Box>
      <AiAssistant />
      <GlobalShortcuts
        onToggleHelp={handleToggleHelp}
        onOpenHelp={handleOpenHelp}
        onCloseHelp={handleCloseHelp}
      />
      <KeyboardShortcutsOverlay
        open={helpOpen}
        onClose={handleCloseHelp}
        shortcuts={shortcuts}
      />
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
      <Route path="/auth/entra/callback" element={<EntraCallbackPage />} />
      <Route path="/auth/callback" element={<EntraCallbackPage />} />
      <Route path="/*" element={<AppShell />} />
    </Routes>
  );
}

function App(): JSX.Element {
  return (
    <BrowserRouter>
      <ThemeModeProvider>
        <AuthProvider>
          <RootRouter />
        </AuthProvider>
      </ThemeModeProvider>
    </BrowserRouter>
  );
}

export default App;

