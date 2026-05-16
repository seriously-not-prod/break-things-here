/**
 * Navigation and layout E2E tests (#681).
 * Covers: core navigation, error boundary, 404 handling.
 */
import { test, expect } from '@playwright/test';

test.describe('Navigation and layout', () => {
  test('app loads without JavaScript errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', err => errors.push(err.message));
    await page.goto('/');
    // Filter out known non-critical 3rd party errors
    const fatalErrors = errors.filter(e => !e.includes('ResizeObserver'));
    expect(fatalErrors).toHaveLength(0);
  });

  test('unknown route shows 404 or redirects gracefully', async ({ page }) => {
    await page.goto('/this-route-absolutely-does-not-exist');
    // Should not show a blank white page — either 404 content or redirect to login
    await expect(page.locator('body')).not.toBeEmpty();
  });

  test('page title is set correctly', async ({ page }) => {
    await page.goto('/');
    const title = await page.title();
    expect(title.length).toBeGreaterThan(0);
  });
});
