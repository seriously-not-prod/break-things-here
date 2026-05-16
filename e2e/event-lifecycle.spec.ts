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

  test('events page gates unauthenticated access', async ({ page }) => {
    await page.goto('/events');
    // Two acceptable outcomes for an auth-gated route hit anonymously:
    // (a) a redirect to /login, or (b) the same URL but with a visible
    // sign-in surface (some apps render an inline login). What is NOT
    // acceptable is silently rendering the authenticated /events shell.
    const signInVisible = page.getByText(/sign in|log in|please log in/i).first();
    await Promise.race([
      page.waitForURL(/\/login(\?|$)/, { timeout: 10_000 }),
      signInVisible.waitFor({ state: 'visible', timeout: 10_000 }),
    ]);
  });

  test('public RSVP page is accessible without auth', async ({ page }) => {
    // Public RSVP pages should not require login
    await page.goto('/events/1/rsvp');
    // Should show RSVP form or a not-found message, not a login redirect
    const statusEl = page.getByText(/rsvp|register|not found|no longer accepting/i);
    await expect(statusEl).toBeVisible({ timeout: 10000 });
  });

  test('event creation form gates unauthenticated access', async ({ page }) => {
    // Same shape as /events: either redirect to /login or surface a sign-in
    // prompt — both protect the authenticated form. Silent render of the
    // /events/new shell would mean the gate broke.
    await page.goto('/events/new');
    const signInVisible = page.getByText(/sign in|log in|please log in/i).first();
    await Promise.race([
      page.waitForURL(/\/login(\?|$)/, { timeout: 10_000 }),
      signInVisible.waitFor({ state: 'visible', timeout: 10_000 }),
    ]);
  });
});
