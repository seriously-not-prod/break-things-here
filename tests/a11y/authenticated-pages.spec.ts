/**
 * Axe-core accessibility audit — Authenticated pages (#815).
 *
 * Audits pages that require a logged-in session:
 *   - Dashboard
 *   - Events list
 *   - Event detail
 *   - Guest list
 *   - Budget
 *
 * Logs in as the admin user before each test.
 * Fails on critical or serious WCAG 2.1 AA violations not in the baseline.
 */
import { expect, test } from '@playwright/test';
import { formatViolations, runAxeAudit } from './helpers';

test.describe('Accessibility — Authenticated pages', () => {
  test.beforeEach(async ({ page }) => {
    // Authenticate as admin user
    await page.goto('/login');
    await page.getByLabel(/email/i).fill('admin@festival.local');
    await page.getByLabel(/password/i).fill('festivalAdmin2025');
    await page.getByRole('button', { name: /sign in|log in/i }).click();
    await page.waitForURL(/\/events|\/dashboard/, { timeout: 10000 });
  });

  test('dashboard has no critical or serious a11y violations', async ({ page }) => {
    const { blocking } = await runAxeAudit(page, '/');

    expect(
      blocking,
      `Accessibility violations on /dashboard:\n${formatViolations(blocking, '/')}`,
    ).toHaveLength(0);
  });

  test('events list page has no critical or serious a11y violations', async ({ page }) => {
    const { blocking } = await runAxeAudit(page, '/events');

    expect(
      blocking,
      `Accessibility violations on /events:\n${formatViolations(blocking, '/events')}`,
    ).toHaveLength(0);
  });

  test('event detail page has no critical or serious a11y violations', async ({ page }) => {
    // Navigate to events list then click the first event
    await page.goto('/events');
    const firstEvent = page.locator('a[href*="/events/"], [data-testid="event-card"]').first();

    // If no event links found, try navigating to /events/1 directly
    if ((await firstEvent.count()) > 0) {
      await firstEvent.click();
      await page.waitForLoadState('networkidle');
    } else {
      await page.goto('/events/1');
    }

    const currentUrl = page.url();
    const { blocking } = await runAxeAudit(page, currentUrl);

    expect(
      blocking,
      `Accessibility violations on event detail:\n${formatViolations(blocking, currentUrl)}`,
    ).toHaveLength(0);
  });

  test('guest list page has no critical or serious a11y violations', async ({ page }) => {
    // Navigate to the guest list (typically under an event)
    await page.goto('/events');
    const firstEvent = page.locator('a[href*="/events/"], [data-testid="event-card"]').first();

    if ((await firstEvent.count()) > 0) {
      await firstEvent.click();
      await page.waitForLoadState('networkidle');
    } else {
      await page.goto('/events/1');
    }

    // Look for guest list navigation
    const guestLink = page.locator('a[href*="guest"], [data-testid="guest-list-tab"]').first();
    if ((await guestLink.count()) > 0) {
      await guestLink.click();
      await page.waitForLoadState('networkidle');
    } else {
      await page.goto('/events/1/guests');
    }

    const currentUrl = page.url();
    const { blocking } = await runAxeAudit(page, currentUrl);

    expect(
      blocking,
      `Accessibility violations on guest list:\n${formatViolations(blocking, currentUrl)}`,
    ).toHaveLength(0);
  });

  test('budget page has no critical or serious a11y violations', async ({ page }) => {
    // Navigate to budget (typically under an event)
    await page.goto('/events');
    const firstEvent = page.locator('a[href*="/events/"], [data-testid="event-card"]').first();

    if ((await firstEvent.count()) > 0) {
      await firstEvent.click();
      await page.waitForLoadState('networkidle');
    } else {
      await page.goto('/events/1');
    }

    // Look for budget navigation
    const budgetLink = page.locator('a[href*="budget"], [data-testid="budget-tab"]').first();
    if ((await budgetLink.count()) > 0) {
      await budgetLink.click();
      await page.waitForLoadState('networkidle');
    } else {
      await page.goto('/events/1/budget');
    }

    const currentUrl = page.url();
    const { blocking } = await runAxeAudit(page, currentUrl);

    expect(
      blocking,
      `Accessibility violations on budget:\n${formatViolations(blocking, currentUrl)}`,
    ).toHaveLength(0);
  });
});
