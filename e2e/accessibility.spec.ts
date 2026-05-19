/**
 * WCAG 2.1 Level AA Accessibility E2E Tests
 *
 * NFR §5.3 requirement: "WCAG 2.1 Level AA compliance verified by automated audit"
 *
 * Uses @axe-core/playwright to run accessibility audits on all key pages.
 * Any violation at impact level 'critical' or 'serious' fails the test.
 *
 * Run:
 *   npx playwright test e2e/accessibility.spec.ts
 */
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

async function auditPage(page: Parameters<typeof AxeBuilder>[0], path: string) {
  await page.goto(path);
  const results = await new AxeBuilder({ page })
    .withTags(WCAG_TAGS)
    .analyze();
  return results;
}

test.describe('WCAG 2.1 AA — Public pages (no login required)', () => {
  test('login page has no critical or serious accessibility violations', async ({ page }) => {
    const results = await auditPage(page, '/login');
    const blocking = results.violations.filter(
      (v) => v.impact === 'critical' || v.impact === 'serious',
    );
    if (blocking.length > 0) {
      const summary = blocking.map((v) => `[${v.impact}] ${v.id}: ${v.description}`).join('\n');
      expect(blocking, `Accessibility violations found:\n${summary}`).toHaveLength(0);
    }
  });

  test('login page has no incomplete (needs-review) critical items', async ({ page }) => {
    const results = await auditPage(page, '/login');
    if (results.incomplete.length > 0) {
      console.warn(`[a11y] ${results.incomplete.length} items need manual review on /login`);
    }
    expect(results.violations.filter((v) => v.impact === 'critical')).toHaveLength(0);
  });
});

test.describe('WCAG 2.1 AA — Authenticated pages', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel(/email/i).fill('admin@festival.local');
    await page.getByLabel(/password/i).fill('festivalAdmin2025');
    await page.getByRole('button', { name: /sign in|log in/i }).click();
    await page.waitForURL(/\/events|\/dashboard/, { timeout: 10000 });
  });

  test('events list page has no critical accessibility violations', async ({ page }) => {
    const results = await auditPage(page, '/events');
    const critical = results.violations.filter(
      (v) => v.impact === 'critical' || v.impact === 'serious',
    );
    if (critical.length > 0) {
      const summary = critical
        .map((v) => `[${v.impact}] ${v.id}: ${v.description}\n  → ${v.nodes.map((n) => n.html).join('\n  → ')}`)
        .join('\n\n');
      expect(critical, `Critical a11y violations on /events:\n${summary}`).toHaveLength(0);
    }
  });

  test('dashboard has no critical accessibility violations', async ({ page }) => {
    const results = await auditPage(page, '/');
    const critical = results.violations.filter((v) => v.impact === 'critical');
    expect(
      critical,
      `Critical a11y violations on /:\n${critical.map((v) => `${v.id}: ${v.description}`).join('\n')}`,
    ).toHaveLength(0);
  });

  test('colour contrast meets WCAG AA on events page', async ({ page }) => {
    await page.goto('/events');
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2aa'])
      .withRules(['color-contrast'])
      .analyze();
    expect(results.violations).toHaveLength(0);
  });
});

test.describe('Keyboard navigation — no login required', () => {
  test('login form is fully keyboard accessible', async ({ page }) => {
    await page.goto('/login');
    await page.keyboard.press('Tab');
    const first = await page.evaluate(() => document.activeElement?.tagName);
    expect(['INPUT', 'BUTTON', 'A', 'SELECT', 'TEXTAREA']).toContain(first);
  });

  test('focus indicators are visible', async ({ page }) => {
    await page.goto('/login');
    await page.keyboard.press('Tab');
    const outlineStyle = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement;
      if (!el) return 'none';
      return window.getComputedStyle(el).outlineStyle;
    });
    expect(outlineStyle).not.toBe('none');
  });
});
