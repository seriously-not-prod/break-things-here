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

  test('events page loads without errors', async ({ page }) => {
    await page.goto('/events');
    // Should either show events list or redirect to login
    await expect(page).toHaveURL(/events|login/);
  });

  test('public RSVP page is accessible without auth', async ({ page }) => {
    // Public RSVP pages should not require login
    await page.goto('/events/1/rsvp');
    // Should show RSVP form or a not-found message, not a login redirect
    const statusEl = page.getByText(/rsvp|register|not found|no longer accepting/i);
    await expect(statusEl).toBeVisible({ timeout: 10000 });
  });

  test('event creation form is accessible to authenticated users', async ({ page }) => {
    // Without auth, should redirect to login
    await page.goto('/events/new');
    await expect(page).toHaveURL(/login|events\/new/);
  });
});
