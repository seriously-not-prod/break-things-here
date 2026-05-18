/**
 * Accessibility baseline E2E tests (#681, #675).
 */
import { test, expect } from '@playwright/test';

test.describe('Accessibility baseline', () => {
  test('login page has no obvious ARIA issues', async ({ page }) => {
    await page.goto('/login');
    // All inputs should have accessible labels
    const inputs = await page.locator('input').all();
    for (const input of inputs) {
      const type = await input.getAttribute('type');
      if (type === 'hidden') continue;
      const id = await input.getAttribute('id');
      const ariaLabel = await input.getAttribute('aria-label');
      const ariaLabelledby = await input.getAttribute('aria-labelledby');
      const placeholder = await input.getAttribute('placeholder');
      // At least one of these should be present for accessibility
      expect(id || ariaLabel || ariaLabelledby || placeholder).toBeTruthy();
    }
  });

  test('buttons have accessible labels', async ({ page }) => {
    await page.goto('/login');
    const buttons = await page.getByRole('button').all();
    for (const btn of buttons) {
      const text = await btn.innerText();
      const ariaLabel = await btn.getAttribute('aria-label');
      expect((text?.trim() || ariaLabel || '').length).toBeGreaterThan(0);
    }
  });
});
