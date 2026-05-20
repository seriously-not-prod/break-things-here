import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Divider,
  FormControlLabel,
  Link,
  Paper,
  Stack,
  TextField,
  Typography,
  CircularProgress,
} from '@mui/material';
import { useAuth } from '../../contexts/auth-context';
import { ApiError, api } from '../../lib/api-client';

interface EntraConfigResponse {
  enabled: boolean;
  allowLocalFallback?: boolean;
}

function toRemainingSeconds(lockedUntil?: number): number {
  if (!lockedUntil) {
    return 0;
  }
  return Math.max(0, Math.ceil((lockedUntil - Date.now()) / 1000));
}

interface LoginFormProps {
  onForgotPassword?: () => void;
  onLogin?: (user?: { id: number; email: string; displayName?: string }) => void;
  onRegister?: () => void;
}

export function LoginForm({ onForgotPassword, onLogin, onRegister }: LoginFormProps): JSX.Element {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [lockedUntil, setLockedUntil] = useState<number | undefined>();
  const [remainingSeconds, setRemainingSeconds] = useState(0);
  const [entraEnabled, setEntraEnabled] = useState(false);
  const [allowLocalFallback, setAllowLocalFallback] = useState(true);
  const [showLocalForm, setShowLocalForm] = useState(false);
  const [configStatus, setConfigStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const { login } = useAuth();

  useEffect(() => {
    if (!lockedUntil) {
      setRemainingSeconds(0);
      return;
    }

    setRemainingSeconds(toRemainingSeconds(lockedUntil));
    const timer = window.setInterval(() => {
      const nextSeconds = toRemainingSeconds(lockedUntil);
      setRemainingSeconds(nextSeconds);
      if (nextSeconds <= 0) {
        setLockedUntil(undefined);
      }
    }, 1000);

    return () => window.clearInterval(timer);
  }, [lockedUntil]);

  const lockoutText = useMemo(() => {
    if (remainingSeconds <= 0) {
      return null;
    }
    const minutes = Math.floor(remainingSeconds / 60);
    const seconds = remainingSeconds % 60;
    return `Too many failed attempts. Try again in ${minutes}:${String(seconds).padStart(2, '0')}.`;
  }, [remainingSeconds]);

  const isLocked = Boolean(lockoutText);

  useEffect(() => {
    api
      .get<EntraConfigResponse>('/api/auth/entra/config')
      .then((data) => {
        setEntraEnabled(Boolean(data.enabled));
        // When Entra is disabled, local credentials are always available — fall
        // back to the legacy form regardless of what the API echoes back.
        setAllowLocalFallback(data.enabled ? Boolean(data.allowLocalFallback) : true);
        setConfigStatus('ready');
      })
      .catch(() => {
        // If the config endpoint is unavailable in local dev, fall back to the
        // local form so the login page still renders and remains usable.
        setEntraEnabled(false);
        setAllowLocalFallback(true);
        setConfigStatus('ready');
      });
  }, []);

  // #781 — when Entra is enabled, the local form starts collapsed. It only
  // becomes reachable if the operator opted into fallback via the env var. We
  // also gate the form on the config request having succeeded so a transport
  // failure cannot accidentally expose local credentials.
  const localFormVisible =
    configStatus === 'ready' && (!entraEnabled || (allowLocalFallback && showLocalForm));

  // #782 — the demo-credentials banner is a developer affordance only. It
  // must never render when Entra is the active identity path, nor in any
  // production build, even if the operator has opted into local fallback.
  // We read NODE_ENV (replaced at build time by Vite) so the check works both
  // in production bundles and in vitest's dev-mode runtime.
  const showDemoCredentials =
    localFormVisible && !entraEnabled && process.env.NODE_ENV !== 'production';

  function handleEmailChange(event: ChangeEvent<HTMLInputElement>) {
    setEmail(event.target.value);
  }

  function handlePasswordChange(event: ChangeEvent<HTMLInputElement>) {
    setPassword(event.target.value);
  }

  function handleRememberMeChange(event: ChangeEvent<HTMLInputElement>) {
    setRememberMe(event.target.checked);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    if (isLocked) return;
    // Defence-in-depth: even if the disclosure link somehow renders when the
    // server has disabled fallback, refuse to submit credentials.
    if (entraEnabled && !allowLocalFallback) {
      setErrorMessage('Local sign-in is disabled. Please use Microsoft sign-in.');
      return;
    }

    setIsSubmitting(true);
    try {
      await login(email, password, rememberMe);
      setSuccessMessage('Login successful. Redirecting...');
      if (typeof onLogin === 'function') onLogin();
      setPassword('');
    } catch (err) {
      const e = err as ApiError | Error;
      setErrorMessage(
        e instanceof ApiError ? e.message : e.message || 'Unable to reach the server.',
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  const entraButton = entraEnabled ? (
    <Button
      variant="contained"
      fullWidth
      href="/api/auth/entra/login"
      aria-label="Sign in with Microsoft"
      data-testid="entra-sign-in"
      sx={{ py: 1.5, fontWeight: 600, textTransform: 'none' }}
    >
      Sign in with Microsoft
    </Button>
  ) : null;

  const localFallbackDisclosure =
    entraEnabled && allowLocalFallback && !showLocalForm ? (
      <Box sx={{ textAlign: 'center' }}>
        <Link
          component="button"
          type="button"
          underline="hover"
          onClick={() => setShowLocalForm(true)}
          data-testid="local-fallback-disclosure"
          aria-label="Use a local account"
          sx={{ fontSize: '0.875rem' }}
        >
          Use a local account
        </Link>
      </Box>
    ) : null;

  return (
    <Box component="form" onSubmit={handleSubmit} noValidate>
      <Stack spacing={2} sx={{ width: '100%' }}>
        {lockoutText && <Alert severity="warning">{lockoutText}</Alert>}
        {errorMessage && <Alert severity="error">{errorMessage}</Alert>}
        {successMessage && <Alert severity="success">{successMessage}</Alert>}

        {configStatus === 'loading' && (
          <Box
            sx={{ display: 'flex', justifyContent: 'center', py: 2 }}
            data-testid="login-loading"
          >
            <CircularProgress size={24} />
          </Box>
        )}

        {entraButton}

        {entraEnabled && (
          <Typography
            variant="body2"
            color="text.secondary"
            align="center"
            data-testid="entra-mfa-notice"
          >
            Your organisation requires Microsoft sign-in. You may be prompted for multi-factor
            authentication (MFA) as part of the sign-in process.
          </Typography>
        )}

        {entraEnabled && !allowLocalFallback && (
          <Typography
            variant="body2"
            color="text.secondary"
            align="center"
            data-testid="entra-only-notice"
          >
            Sign-in is managed by your organisation's Microsoft account.
          </Typography>
        )}

        {localFallbackDisclosure}

        {localFormVisible && (
          <>
            {entraEnabled && <Divider>or use a local account</Divider>}

            <TextField
              required
              id="email"
              name="email"
              type="email"
              label="Email"
              value={email}
              onChange={handleEmailChange}
              autoComplete="email"
              fullWidth
              placeholder="your.email@festival.local"
              inputProps={{ 'aria-label': 'Email address' }}
            />

            <TextField
              required
              id="password"
              name="password"
              type="password"
              label="Password"
              value={password}
              onChange={handlePasswordChange}
              autoComplete="current-password"
              fullWidth
              placeholder="Enter your password"
            />

            <FormControlLabel
              control={
                <Checkbox
                  checked={rememberMe}
                  onChange={handleRememberMeChange}
                  inputProps={{ 'aria-label': 'Remember me' }}
                />
              }
              label="Remember me"
            />

            <Button
              type="submit"
              variant="contained"
              disabled={isSubmitting || isLocked || !email || !password}
              sx={{ py: 1.5, fontWeight: 600 }}
              fullWidth
            >
              {isSubmitting ? <CircularProgress size={20} color="inherit" /> : 'Sign In'}
            </Button>

            <Typography aria-live="polite" variant="body2" color="text.secondary">
              {isSubmitting
                ? 'Submitting your login request...'
                : 'Use your email and password to sign in.'}
            </Typography>

            <Button
              variant="text"
              onClick={onForgotPassword}
              aria-label="Forgot password"
              fullWidth
              size="small"
            >
              Forgot password?
            </Button>

            {onRegister && (
              <Typography variant="body2" align="center">
                Don't have an account?{' '}
                <Button variant="text" size="small" onClick={onRegister}>
                  Create account
                </Button>
              </Typography>
            )}

            {showDemoCredentials && (
              <Paper
                variant="outlined"
                data-testid="demo-credentials-banner"
                sx={{
                  p: 2,
                  bgcolor: '#f0f4ff',
                  borderColor: '#c7d2fe',
                  borderRadius: 2,
                }}
              >
                <Typography
                  variant="caption"
                  fontWeight={700}
                  sx={{ letterSpacing: 1, display: 'block', mb: 1, color: '#3730a3' }}
                >
                  DEMO CREDENTIALS
                </Typography>
                <Typography variant="body2" sx={{ mb: 0.5 }}>
                  <strong>Admin:</strong>&nbsp; admin@festival.local / festivalAdmin2025
                </Typography>
                <Typography variant="body2">
                  <strong>User:</strong>&nbsp;&nbsp;&nbsp;&nbsp; user@festival.local / userPass2025
                </Typography>
              </Paper>
            )}
          </>
        )}
      </Stack>
    </Box>
  );
}
