import { ChangeEvent, FormEvent, useState } from 'react';
import { Alert, Box, Button, CircularProgress, Stack, TextField, Typography } from '@mui/material';
import { useAuth } from '../../contexts/auth-context';

interface RegisterFormProps {
  onBackToLogin?: () => void;
  onRegistered?: () => void;
}

export function RegisterForm({ onBackToLogin, onRegistered }: RegisterFormProps): JSX.Element {
  const { register } = useAuth();
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    setError(null);

    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }

    setIsSubmitting(true);
    try {
      const message = await register(email.trim(), password, displayName.trim());
      setSuccess(message || 'Registration successful! Check your email to verify your account.');
      onRegistered?.();
    } catch (err) {
      const e = err as { message?: string };
      setError(e.message ?? 'Registration failed. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Box component="form" onSubmit={handleSubmit} noValidate>
      <Stack spacing={2}>
        {error && <Alert severity="error">{error}</Alert>}
        {success && <Alert severity="success">{success}</Alert>}

        <TextField
          label="Display Name"
          value={displayName}
          onChange={(e: ChangeEvent<HTMLInputElement>) => setDisplayName(e.target.value)}
          required
          autoFocus
          disabled={isSubmitting || Boolean(success)}
        />
        <TextField
          label="Email"
          type="email"
          value={email}
          onChange={(e: ChangeEvent<HTMLInputElement>) => setEmail(e.target.value)}
          required
          disabled={isSubmitting || Boolean(success)}
        />
        <TextField
          label="Password"
          type="password"
          value={password}
          onChange={(e: ChangeEvent<HTMLInputElement>) => setPassword(e.target.value)}
          required
          helperText="Minimum 8 characters"
          disabled={isSubmitting || Boolean(success)}
        />
        <TextField
          label="Confirm Password"
          type="password"
          value={confirm}
          onChange={(e: ChangeEvent<HTMLInputElement>) => setConfirm(e.target.value)}
          required
          disabled={isSubmitting || Boolean(success)}
        />

        <Button
          type="submit"
          variant="contained"
          fullWidth
          disabled={isSubmitting || Boolean(success)}
          startIcon={isSubmitting ? <CircularProgress size={16} color="inherit" /> : null}
        >
          {isSubmitting ? 'Creating account…' : 'Create account'}
        </Button>

        <Typography variant="body2" align="center">
          Already have an account?{' '}
          <Button variant="text" size="small" onClick={onBackToLogin}>
            Log in
          </Button>
        </Typography>
      </Stack>
    </Box>
  );
}
