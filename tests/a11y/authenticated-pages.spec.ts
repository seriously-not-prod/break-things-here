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
    // Navigate directly to first event detail page
    const { blocking } = await runAxeAudit(page, '/events/1');

    expect(
      blocking,
      `Accessibility violations on /events/1:\n${formatViolations(blocking, '/events/1')}`,
    ).toHaveLength(0);
  });

  test('guest list page has no critical or serious a11y violations', async ({ page }) => {
    // Navigate directly to guest list for first event
    const { blocking } = await runAxeAudit(page, '/events/1/guests');

    expect(
      blocking,
      `Accessibility violations on /events/1/guests:\n${formatViolations(blocking, '/events/1/guests')}`,
    ).toHaveLength(0);
  });

  test('budget page has no critical or serious a11y violations', async ({ page }) => {
    // Navigate directly to budget for first event
    const { blocking } = await runAxeAudit(page, '/events/1/budget');

    expect(
      blocking,
      `Accessibility violations on /events/1/budget:\n${formatViolations(blocking, '/events/1/budget')}`,
    ).toHaveLength(0);
  });
});
