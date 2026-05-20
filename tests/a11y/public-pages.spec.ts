/**
 * Axe-core accessibility audit — Public pages (#815).
 *
 * Audits pages that do not require authentication:
 *   - Login page
 *   - RSVP portal (public event RSVP form)
 *
 * Fails on critical or serious WCAG 2.1 AA violations not in the baseline.
 */
import { expect, test } from '@playwright/test';
import { formatViolations, runAxeAudit } from './helpers';

test.describe('Accessibility — Public pages', () => {
  test('login page has no critical or serious a11y violations', async ({ page }) => {
    const { blocking } = await runAxeAudit(page, '/login');

    expect(
      blocking,
      `Accessibility violations on /login:\n${formatViolations(blocking, '/login')}`,
    ).toHaveLength(0);
  });

  test('RSVP portal has no critical or serious a11y violations', async ({ page }) => {
    const { blocking } = await runAxeAudit(page, '/rsvp');

    expect(
      blocking,
      `Accessibility violations on /rsvp:\n${formatViolations(blocking, '/rsvp')}`,
    ).toHaveLength(0);
  });
});
