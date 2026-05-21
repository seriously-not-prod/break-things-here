import { useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Box, CircularProgress } from '@mui/material';

interface EventRouteGuardProps {
  children: React.ReactNode;
}

/**
 * Wraps event sub-pages and redirects to /events if the :id route param is
 * non-numeric (e.g. the user navigated to /events/tasks directly without an
 * event context).
 */
export function EventRouteGuard({ children }: EventRouteGuardProps): React.ReactElement {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const isValid = id !== undefined && /^\d+$/.test(id) && parseInt(id, 10) > 0;

  useEffect(() => {
    if (!isValid) {
      navigate('/events', { replace: true });
    }
  }, [isValid, navigate]);

  if (!isValid) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', mt: 10 }}>
        <CircularProgress />
      </Box>
    );
  }

  return <>{children}</>;
}
