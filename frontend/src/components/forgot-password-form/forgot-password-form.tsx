import { ChangeEvent, FormEvent, useState } from 'react';
import { Alert, Box, Button, Stack, TextField, Typography } from '@mui/material';
import { apiFetch } from '../../lib/api-client';

interface ForgotPasswordFormProps {
  onBackToLogin?: () => void;
}

export function ForgotPasswordForm({ onBackToLogin }: ForgotPasswordFormProps): JSX.Element {
  const [email, setEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  function handleEmailChange(e: ChangeEvent<HTMLInputElement>): void {
    setEmail(e.target.value);
    setErrorMessage(null);
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setErrorMessage('Please enter your email address.');
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await apiFetch('/api/auth/forgot-password', {
        method: 'POST',
        body: JSON.stringify({ email: trimmedEmail }),
      });

      const data = (await response.json()) as { message?: string; error?: string };

      if (!response.ok) {
        setErrorMessage(data.error ?? 'Something went wrong. Please try again.');
        return;
      }

      setSuccessMessage(
        data.message ?? 'If an account exists with that email, a reset link has been sent.',
      );
      setEmail('');
    } catch {
      setErrorMessage('Unable to reach the server. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Box component="form" onSubmit={handleSubmit} noValidate>
      <Stack spacing={2}>
        <Typography variant="body2" color="text.secondary">
          Enter your email address and we will send you a password reset link.
        </Typography>

        {errorMessage && <Alert severity="error" role="alert">{errorMessage}</Alert>}
        {successMessage && <Alert severity="success" role="status">{successMessage}</Alert>}

        <TextField
          required
          id="forgot-email"
          name="email"
          type="email"
          label="Email address"
          value={email}
          onChange={handleEmailChange}
          slotProps={{ htmlInput: { 'aria-label': 'Email address', 'aria-required': 'true' } }}
          autoComplete="email"
          fullWidth
          disabled={!!successMessage}
        />

        <Button
          type="submit"
          variant="contained"
          disabled={isSubmitting || !email.trim() || !!successMessage}
          aria-label="Send password reset link"
          fullWidth
        >
          {isSubmitting ? 'Sending...' : 'Send reset link'}
        </Button>

        <Button
          variant="text"
          onClick={onBackToLogin}
          aria-label="Back to login"
          fullWidth
        >
          Back to login
        </Button>
      </Stack>
    </Box>
  );
}
