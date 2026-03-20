/**
 * Email change re-confirmation utilities.
 *
 * Flow:
 *  1. User submits new email via PATCH /api/users/me
 *  2. Server sends confirmation email to NEW address and a notification to the OLD address
 *  3. User clicks the link in the confirmation email → GET /api/auth/confirm-email-change?token=...
 *  4. Server validates token, activates new email, invalidates token
 *
 * This module provides the client-side API call to confirm the token and
 * a helper to check whether a pending email change exists on the profile.
 */

const API_BASE_URL = process.env.REACT_APP_API_BASE_URL ?? '/api';

/**
 * Confirm an email change using the single-use token sent to the new address.
 * Returns the updated email address on success.
 */
export async function confirmEmailChange(token: string): Promise<{ email: string }> {
  if (!token || typeof token !== 'string' || token.trim().length === 0) {
    throw new Error('Invalid confirmation token.');
  }

  const params = new URLSearchParams({ token: token.trim() });
  const response = await fetch(
    `${API_BASE_URL}/auth/confirm-email-change?${params.toString()}`,
    { method: 'GET', credentials: 'include' },
  );

  if (response.status === 400) {
    const body = await response.json().catch(() => ({ message: 'Invalid or expired token.' }));
    throw new Error(body.message ?? 'Invalid or expired token.');
  }
  if (!response.ok) {
    throw new Error('Email confirmation failed.');
  }

  return response.json() as Promise<{ email: string }>;
}

/**
 * Returns true when the user profile has an unconfirmed email change pending.
 */
export function hasPendingEmailChange(pendingEmail: string | undefined): boolean {
  return typeof pendingEmail === 'string' && pendingEmail.length > 0;
}
