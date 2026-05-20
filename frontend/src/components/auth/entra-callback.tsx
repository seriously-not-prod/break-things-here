import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Box, CircularProgress, Alert, Typography } from '@mui/material';
import { useAuth } from '../../contexts/auth-context';
import { exchangeCodeAndCreateSession } from '../../utils/entra-spa-flow';

export function EntraCallbackPage(): JSX.Element {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { loadCurrentUser } = useAuth() as ReturnType<typeof useAuth> & {
    loadCurrentUser?: () => Promise<void>;
  };
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

    if (!code || !state) {
      setError('No authorization code or state received from Azure.');
      return;
    }

    (async () => {
      try {
        // Exchange code for tokens using SPA flow (frontend handles token exchange)
        const result = await exchangeCodeAndCreateSession({ code, state });

        if (result.success) {
          navigate('/dashboard', { replace: true });
        } else {
          // Display error with code if available
          const errorMsg: string = result.code
            ? `${result.error ?? 'Unknown error'} (${result.code})`
            : (result.error ?? 'Entra authentication failed.');
          setError(errorMsg);
        }
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Entra authentication failed.';
        setError(errorMsg);
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
