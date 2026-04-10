import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { createTheme, ThemeProvider, CssBaseline } from '@mui/material';
import { AuthProvider, useAuth } from './context/AuthContext';
import DashboardLayout from './layouts/DashboardLayout';
import LoginPage      from './pages/auth/LoginPage';
import RegisterPage   from './pages/auth/RegisterPage';
import DashboardPage  from './pages/dashboard/DashboardPage';
import ProjectsPage   from './pages/projects/ProjectsPage';
import TasksPage      from './pages/tasks/TasksPage';
import UsersPage      from './pages/users/UsersPage';
import ActivityPage   from './pages/activity/ActivityPage';
import ProfilePage    from './pages/profile/ProfilePage';
import SettingsPage   from './pages/settings/SettingsPage';
import { Box, CircularProgress } from '@mui/material';

const theme = createTheme({
  palette: {
    primary: { main: '#4f46e5' },
    secondary: { main: '#7c3aed' },
    background: { default: '#f5f6fa' },
  },
  typography: {
    fontFamily: '"Inter", "Segoe UI", sans-serif',
  },
  components: {
    MuiButton: { defaultProps: { disableElevation: true } },
    MuiPaper:  { defaultProps: { elevation: 0 } },
  },
});

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <Box sx={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <CircularProgress />
      </Box>
    );
  }
  return user ? <>{children}</> : <Navigate to="/login" replace />;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login"           element={<LoginPage />} />
      <Route path="/register"        element={<RegisterPage />} />
      <Route path="/*" element={
        <RequireAuth>
          <DashboardLayout>
            <Routes>
              <Route path="/"          element={<DashboardPage />} />
              <Route path="/projects"  element={<ProjectsPage />} />
              <Route path="/tasks"     element={<TasksPage />} />
              <Route path="/users"     element={<UsersPage />} />
              <Route path="/activity"  element={<ActivityPage />} />
              <Route path="/profile"   element={<ProfilePage />} />
              <Route path="/settings"  element={<SettingsPage />} />
              <Route path="*"          element={<Navigate to="/" replace />} />
            </Routes>
          </DashboardLayout>
        </RequireAuth>
      } />
    </Routes>
  );
}

export default function App() {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <BrowserRouter>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </BrowserRouter>
    </ThemeProvider>
  );
}

