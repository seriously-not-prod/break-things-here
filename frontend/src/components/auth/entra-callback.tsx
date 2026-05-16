import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Box, CircularProgress, Alert, Typography } from '@mui/material';
import { api, setToken } from '../../lib/api-client';
import { useAuth } from '../../contexts/auth-context';

export function EntraCallbackPage(): JSX.Element {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { loadCurrentUser } = useAuth() as ReturnType<typeof useAuth> & { loadCurrentUser?: () => Promise<void> };
  const [error, setError] = useState<string | null>(null);
  const called = useRef(false);

  useEffect(() => {
    if (called.current) return;
    called.current = true;

    const code = searchParams.get('code');
    const state = searchParams.get('state');
    const errorParam = searchParams.get('error');
    const errorDescription = searchParams.get('error_description');

    if (errorParam) {
      setError(errorDescription ?? errorParam);
      return;
    }

    if (!code) {
      setError('No authorization code received from Azure.');
      return;
    }

    (async () => {
      try {
        const data = await api.post<{ accessToken?: string; user?: unknown }>(
          '/api/auth/entra/callback',
          { code, state },
        );
        if (data?.accessToken) setToken(data.accessToken as string);
        navigate('/dashboard', { replace: true });
      } catch (err) {
        setError((err as Error).message ?? 'Entra authentication failed.');
      }
    })();
  }, [searchParams, navigate, loadCurrentUser]);

  if (error) {
    return (
      <Box sx={{ minHeight: '100vh', display: 'grid', placeItems: 'center', p: 4 }}>
        <Box sx={{ maxWidth: 460 }}>
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
          <Typography variant="body2" color="text.secondary">
            <a href="/login">Return to login</a>
          </Typography>
        </Box>
      </Box>
    );
  }

  return (
    <Box sx={{ minHeight: '100vh', display: 'grid', placeItems: 'center' }}>
      <Box sx={{ textAlign: 'center' }}>
        <CircularProgress sx={{ mb: 2 }} />
        <Typography variant="body2" color="text.secondary">
          Completing sign-in with Microsoft…
        </Typography>
      </Box>
    </Box>
  );
}
