import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Divider,
  FormControlLabel,
  Stack,
  TextField,
  Typography,
  CircularProgress,
  InputAdornment,
} from '@mui/material';
import { useAuth } from '../../contexts/auth-context';
import { ApiError, api } from '../../lib/api-client';



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
  const [entraEnabled, setEntraEnabled] = useState(false);
  const { login } = useAuth();

  useEffect(() => {
    api.get<{ enabled: boolean }>('/api/auth/entra/config')
      .then((data) => setEntraEnabled(data.enabled))
      .catch(() => setEntraEnabled(false));
  }, []);

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

    setIsSubmitting(true);
    try {
      await login(email, password, rememberMe);
      setSuccessMessage('Login successful. Redirecting...');
      if (typeof onLogin === 'function') onLogin();
      setPassword('');
    } catch (err) {
      const e = err as ApiError | Error;
      setErrorMessage(e instanceof ApiError ? e.message : e.message || 'Unable to reach the server.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Box component="form" onSubmit={handleSubmit} noValidate>
      <Stack spacing={2} sx={{ width: '100%' }}>
        {lockoutText && <Alert severity="warning">{lockoutText}</Alert>}
        {errorMessage && <Alert severity="error">{errorMessage}</Alert>}
        {successMessage && <Alert severity="success">{successMessage}</Alert>}

        <TextField
          required
          id="email"
          name="email"
          type="email"
          label="Email"
          value={email}
          onChange={handleEmailChange}
          inputProps={{ 'aria-label': 'Email address' }}
          autoComplete="email"
          fullWidth
          placeholder="you@company.com"
        />

        <TextField
          required
          id="password"
          name="password"
          type="password"
          label="Password"
          value={password}
          onChange={handlePasswordChange}
          inputProps={{ 'aria-label': 'Password' }}
          autoComplete="current-password"
          fullWidth
          placeholder="Your password"
          InputProps={{
            endAdornment: (
              <InputAdornment position="end">
                {/* subtle lock icon placeholder */}
              </InputAdornment>
            ),
          }}
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
          aria-label="Log in"
          sx={{ py: 1.5, fontWeight: 600 }}
          fullWidth
        >
          {isSubmitting ? <CircularProgress size={20} color="inherit" /> : 'Log in'}
        </Button>

        <Typography aria-live="polite" variant="body2" color="text.secondary">
          {isSubmitting ? 'Submitting your login request...' : 'Use your email and password to sign in.'}
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

        {entraEnabled && (
          <>
            <Divider>or</Divider>
            <Button
              variant="outlined"
              fullWidth
              href="/api/auth/entra/login"
              aria-label="Sign in with Microsoft"
              sx={{ py: 1.5, fontWeight: 600, textTransform: 'none' }}
            >
              Sign in with Microsoft
            </Button>
          </>
        )}

        {onRegister && (
          <Typography variant="body2" align="center">
            Don't have an account?{' '}
            <Button variant="text" size="small" onClick={onRegister}>
              Create account
            </Button>
          </Typography>
        )}
      </Stack>
    </Box>
  );
}
