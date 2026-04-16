import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  FormControlLabel,
  Stack,
  TextField,
  Typography,
  Avatar,
  CircularProgress,
  InputAdornment,
} from '@mui/material';

interface LoginResponse {
  message: string;
}


const API_BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3001';

function toRemainingSeconds(lockedUntil?: number): number {
  if (!lockedUntil) {
    return 0;
  }
  return Math.max(0, Math.ceil((lockedUntil - Date.now()) / 1000));
}

interface LoginFormProps {
  onForgotPassword?: () => void;
  onLogin?: (user?: { id: number; email: string; displayName?: string }) => void;
}

export function LoginForm({ onForgotPassword, onLogin }: LoginFormProps): JSX.Element {
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

    if (isLocked) {
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify({ email, password, rememberMe })
      });

      if (!response.ok) {
        const apiError = (await response.json()) as unknown as Record<string, unknown>;

        // Support different backend error shapes: { message } or { error }
        const message = (apiError.message as string) || (apiError.error as string) || 'An error occurred.';

        // Backend may return `retryAfter` (seconds) for lockouts — convert to future timestamp
        if (typeof apiError.retryAfter === 'number') {
          setLockedUntil(Date.now() + (apiError.retryAfter as number) * 1000);
        } else if (typeof apiError.lockedUntil === 'number') {
          setLockedUntil(apiError.lockedUntil as number);
        }

        const remaining = typeof apiError.attemptsRemaining === 'number' ? ` Attempts left: ${apiError.attemptsRemaining}.` : '';

        setErrorMessage(`${message}${remaining}`);
        return;
      }

      const data = (await response.json()) as LoginResponse;
      setSuccessMessage(data.message);
      // Notify parent that login succeeded so it can show the dashboard
      if (typeof onLogin === 'function') {
        try {
          const user = (data as any).user;
          onLogin(user);
        } catch {
          onLogin();
        }
      }
      setPassword('');
    } catch {
      setErrorMessage('Unable to reach the server. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Box component="form" onSubmit={handleSubmit} noValidate>
      <Stack spacing={2} sx={{ width: '100%' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 1 }}>
          <Avatar sx={{ bgcolor: 'primary.main', width: 48, height: 48 }}>FP</Avatar>
          <Box>
            <Typography variant="h6">Festival Planner</Typography>
            <Typography variant="caption" color="text.secondary">Sign in to your account</Typography>
          </Box>
        </Box>

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
      </Stack>
    </Box>
  );
}
