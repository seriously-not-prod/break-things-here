import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from 'react';
import { Alert, Box, Button, LinearProgress, Stack, TextField, Typography } from '@mui/material';
import { apiFetch } from '../../lib/api-client';

const PASSWORD_REQUIREMENTS = [
  { label: 'At least 8 characters', test: (p: string) => p.length >= 8 },
  { label: 'Contains a letter', test: (p: string) => /[a-zA-Z]/.test(p) },
  { label: 'Contains a number', test: (p: string) => /[0-9]/.test(p) },
];

function getStrengthScore(password: string): number {
  const met = PASSWORD_REQUIREMENTS.filter((r) => r.test(password)).length;
  const hasSpecial = /[^a-zA-Z0-9]/.test(password) ? 1 : 0;
  const hasUpper = /[A-Z]/.test(password) ? 1 : 0;
  return Math.min(100, Math.round(((met + hasSpecial + hasUpper) / 5) * 100));
}

function getStrengthLabel(score: number): string {
  if (score === 0) return '';
  if (score < 40) return 'Weak';
  if (score < 70) return 'Fair';
  if (score < 90) return 'Good';
  return 'Strong';
}

function getStrengthColor(score: number): 'error' | 'warning' | 'info' | 'success' {
  if (score < 40) return 'error';
  if (score < 70) return 'warning';
  if (score < 90) return 'info';
  return 'success';
}

interface ResetPasswordFormProps {
  onBackToLogin?: () => void;
}

export function ResetPasswordForm({ onBackToLogin }: ResetPasswordFormProps): JSX.Element {
  const [token, setToken] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Extract token from URL query string on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const t = params.get('token');
    if (!t) {
      setErrorMessage('No reset token found. Please use the link from your email.');
    } else {
      setToken(t);
    }
  }, []);

  const strengthScore = useMemo(() => getStrengthScore(newPassword), [newPassword]);
  const strengthLabel = useMemo(() => getStrengthLabel(strengthScore), [strengthScore]);
  const strengthColor = useMemo(() => getStrengthColor(strengthScore), [strengthScore]);

  const passwordsMatch = confirmPassword.length === 0 || newPassword === confirmPassword;
  const allRequirementsMet = PASSWORD_REQUIREMENTS.every((r) => r.test(newPassword));

  function handleNewPasswordChange(e: ChangeEvent<HTMLInputElement>): void {
    setNewPassword(e.target.value);
    setErrorMessage(null);
  }

  function handleConfirmPasswordChange(e: ChangeEvent<HTMLInputElement>): void {
    setConfirmPassword(e.target.value);
    setErrorMessage(null);
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    setErrorMessage(null);

    if (!token) {
      setErrorMessage('Invalid reset token. Please use the link from your email.');
      return;
    }

    if (!allRequirementsMet) {
      setErrorMessage('Password does not meet the requirements listed below.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setErrorMessage('Passwords do not match.');
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await apiFetch('/api/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify({ token, newPassword }),
      });

      const data = (await response.json()) as { message?: string; error?: string };

      if (!response.ok) {
        setErrorMessage(data.error ?? 'Failed to reset password. Please try again.');
        return;
      }

      setSuccessMessage(data.message ?? 'Password reset successfully. Redirecting to login...');
      setNewPassword('');
      setConfirmPassword('');

      // Redirect to login after short delay
      setTimeout(() => {
        if (onBackToLogin) {
          onBackToLogin();
        } else {
          window.location.replace('/');
        }
      }, 2500);
    } catch {
      setErrorMessage('Unable to reach the server. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Box component="form" onSubmit={handleSubmit} noValidate>
      <Stack spacing={2}>
        {errorMessage && (
          <Alert severity="error" role="alert">
            {errorMessage}
          </Alert>
        )}
        {successMessage && (
          <Alert severity="success" role="status">
            {successMessage}
          </Alert>
        )}

        {!successMessage && (
          <>
            <TextField
              required
              id="new-password"
              name="newPassword"
              type="password"
              label="New password"
              value={newPassword}
              onChange={handleNewPasswordChange}
              slotProps={{ htmlInput: { 'aria-label': 'New password', 'aria-required': 'true' } }}
              autoComplete="new-password"
              fullWidth
            />

            {newPassword.length > 0 && (
              <Box>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                  <Typography variant="caption" color="text.secondary">
                    Password strength
                  </Typography>
                  <Typography variant="caption" color={`${strengthColor}.main`}>
                    {strengthLabel}
                  </Typography>
                </Box>
                <LinearProgress
                  variant="determinate"
                  value={strengthScore}
                  color={strengthColor}
                  aria-label={`Password strength: ${strengthLabel}`}
                />
              </Box>
            )}

            <Box component="ul" sx={{ pl: 2, m: 0 }} aria-label="Password requirements">
              {PASSWORD_REQUIREMENTS.map((req) => (
                <Typography
                  key={req.label}
                  component="li"
                  variant="caption"
                  color={req.test(newPassword) ? 'success.main' : 'text.secondary'}
                >
                  {req.label}
                </Typography>
              ))}
            </Box>

            <TextField
              required
              id="confirm-password"
              name="confirmPassword"
              type="password"
              label="Confirm new password"
              value={confirmPassword}
              onChange={handleConfirmPasswordChange}
              slotProps={{
                htmlInput: { 'aria-label': 'Confirm new password', 'aria-required': 'true' },
              }}
              autoComplete="new-password"
              fullWidth
              error={!passwordsMatch}
              helperText={!passwordsMatch ? 'Passwords do not match' : ''}
            />

            <Button
              type="submit"
              variant="contained"
              disabled={
                isSubmitting ||
                !token ||
                !allRequirementsMet ||
                newPassword !== confirmPassword ||
                !confirmPassword
              }
              aria-label="Reset password"
              fullWidth
            >
              {isSubmitting ? 'Resetting...' : 'Reset password'}
            </Button>
          </>
        )}

        <Button variant="text" onClick={onBackToLogin} aria-label="Back to login" fullWidth>
          Back to login
        </Button>
      </Stack>
    </Box>
  );
}
