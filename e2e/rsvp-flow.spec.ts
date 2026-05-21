/**
 * RSVP flow E2E tests (#681).
 */
import { test, expect } from '@playwright/test';

test.describe('RSVP flow', () => {
  test('public RSVP form surfaces a result (form or invalid-token message)', async ({ page }) => {
    await page.goto('/rsvp/test-token-placeholder');
    // The placeholder token is invalid; we should see either the RSVP form
    // for a real token or an explicit invalid/expired/not-found message —
    // never a blank screen.
    const realResponse = page.getByText(
      /rsvp|going|attending|invalid|expired|not found|no longer accepting/i,
    );
    await expect(realResponse.first()).toBeVisible({ timeout: 10_000 });
  });
});
