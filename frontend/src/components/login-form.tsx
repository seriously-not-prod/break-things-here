import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  FormControlLabel,
  Stack,
  TextField,
  Typography
} from '@mui/material';

type LoginResponse = {
  message: string;
};

type LoginError = {
  message: string;
  attemptsRemaining?: number;
  lockedUntil?: number;
};

const API_BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3001';

function toRemainingSeconds(lockedUntil?: number): number {
  if (!lockedUntil) {
    return 0;
  }
  return Math.max(0, Math.ceil((lockedUntil - Date.now()) / 1000));
}

function LoginForm() {
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

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    if (isLocked) {
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ email, password, rememberMe })
      });

      if (!response.ok) {
        const apiError = (await response.json()) as LoginError;
        if (apiError.lockedUntil) {
          setLockedUntil(apiError.lockedUntil);
        }

        const remaining =
          typeof apiError.attemptsRemaining === 'number'
            ? ` Attempts left: ${apiError.attemptsRemaining}.`
            : '';

        setErrorMessage(`${apiError.message}${remaining}`);
        return;
      }

      const data = (await response.json()) as LoginResponse;
      setSuccessMessage(data.message);
      setPassword('');
    } catch {
      setErrorMessage('Unable to reach the server. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Box component="form" onSubmit={handleSubmit} noValidate>
      <Stack spacing={2}>
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
        >
          {isSubmitting ? 'Logging in...' : 'Log in'}
        </Button>

        <Typography aria-live="polite" variant="body2" color="text.secondary">
          {isSubmitting ? 'Submitting your login request.' : 'Use your email and password to sign in.'}
        </Typography>
      </Stack>
    </Box>
  );
}

export default LoginForm;
