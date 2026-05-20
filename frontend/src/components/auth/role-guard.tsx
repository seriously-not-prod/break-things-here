import { Alert, Box, Button, Paper, Stack, Typography } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { useAuth, type AuthUser } from '../../contexts/auth-context';

interface RoleGuardProps {
  children: JSX.Element;
  canAccess: (user: AuthUser | null) => boolean;
  title?: string;
  message?: string;
}

/**
 * UI-only RBAC guard for authenticated routes.
 * Shows a clear access-denied panel instead of rendering protected screens.
 */
export function RoleGuard({
  children,
  canAccess,
  title = 'Access denied',
  message = 'You do not have permission to open this page.',
}: RoleGuardProps): JSX.Element {
  const { user } = useAuth();
  const navigate = useNavigate();

  if (canAccess(user)) {
    return children;
  }

  return (
    <Box sx={{ p: 3 }}>
      <Paper sx={{ p: 3, maxWidth: 720 }} elevation={1}>
        <Stack spacing={2}>
          <Typography variant="h5" fontWeight={700}>{title}</Typography>
          <Alert severity="warning">{message}</Alert>
          <Typography color="text.secondary">
            If this seems incorrect, contact an administrator to verify your role assignment.
          </Typography>
          <Box>
            <Button variant="outlined" onClick={() => navigate('/dashboard')}>
              Back to dashboard
            </Button>
          </Box>
        </Stack>
      </Paper>
    </Box>
  );
}
