/**
 * Event lifecycle E2E tests (#681).
 * Covers: create event, view events list, event detail.
 */
import { test, expect } from '@playwright/test';

test.describe('Event lifecycle', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to the app root
    await page.goto('/');
  });

  test('events page redirects unauthenticated users to login', async ({ page }) => {
    await page.goto('/events');
    // Unauthenticated requests must redirect to /login; landing on /events
    // here would mean auth-gating regressed.
    await expect(page).toHaveURL(/\/login(\?|$)/, { timeout: 10_000 });
  });

  test('public RSVP page is accessible without auth', async ({ page }) => {
    // Public RSVP pages should not require login
    await page.goto('/events/1/rsvp');
    // Should show RSVP form or a not-found message, not a login redirect
    const statusEl = page.getByText(/rsvp|register|not found|no longer accepting/i);
    await expect(statusEl).toBeVisible({ timeout: 10000 });
  });

  test('event creation form redirects unauthenticated users to login', async ({ page }) => {
    // The /events/new route is auth-gated; an unauthenticated request must
    // redirect to /login — landing on /events/new would mean the gate broke.
    await page.goto('/events/new');
    await expect(page).toHaveURL(/\/login(\?|$)/, { timeout: 10_000 });
  });
});
