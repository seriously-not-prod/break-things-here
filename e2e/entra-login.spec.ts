/**
 * Entra-first login E2E smoke (#781).
 *
 * Verifies the three render modes the login page selects between based on the
 * `/api/auth/entra/config` response. The Entra status endpoint is stubbed so
 * the suite runs without provisioning a real Azure tenant.
 */
import { test, expect, Route } from '@playwright/test';

async function stubEntraConfig(
  context: import('@playwright/test').BrowserContext,
  body: { enabled: boolean; allowLocalFallback?: boolean },
): Promise<void> {
  await context.route('**/api/auth/entra/config', (route: Route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(body),
    }),
  );
}

test.describe('Login form — Entra modes (#781)', () => {
  test('entra-only mode hides password field and offers only Microsoft sign-in', async ({
    page,
    context,
  }) => {
    await stubEntraConfig(context, { enabled: true, allowLocalFallback: false });

    await page.goto('/login');

    await expect(page.getByTestId('entra-sign-in')).toBeVisible();
    await expect(page.getByTestId('entra-only-notice')).toBeVisible();
    await expect(page.getByLabel(/password/i)).toHaveCount(0);
    await expect(page.getByLabel(/email address/i)).toHaveCount(0);
    await expect(page.getByTestId('local-fallback-disclosure')).toHaveCount(0);
  });

  test('entra + fallback reveals local form only after disclosure click', async ({
    page,
    context,
  }) => {
    await stubEntraConfig(context, { enabled: true, allowLocalFallback: true });

    await page.goto('/login');

    await expect(page.getByTestId('entra-sign-in')).toBeVisible();
    const disclosure = page.getByTestId('local-fallback-disclosure');
    await expect(disclosure).toBeVisible();
    await expect(page.getByLabel(/password/i)).toHaveCount(0);

    await disclosure.click();

    await expect(page.getByLabel(/email address/i)).toBeVisible();
    await expect(page.getByLabel(/^password$/i)).toBeVisible();
  });

  test('entra disabled keeps the legacy local-credential form', async ({ page, context }) => {
    await stubEntraConfig(context, { enabled: false });

    await page.goto('/login');

    await expect(page.getByLabel(/email address/i)).toBeVisible();
    await expect(page.getByLabel(/^password$/i)).toBeVisible();
    await expect(page.getByTestId('entra-sign-in')).toHaveCount(0);
  });
});

/**
 * #782 — Demo-credentials banner must never render when Entra is the active
 * identity path. Covers both the entra-only and entra-with-fallback modes,
 * since the banner historically leaked into the fallback form too.
 */
test.describe('Login form — demo credentials banner gating (#782)', () => {
  test('entra-only mode hides the demo credentials banner', async ({ page, context }) => {
    await stubEntraConfig(context, { enabled: true, allowLocalFallback: false });

    await page.goto('/login');

    await expect(page.getByTestId('entra-sign-in')).toBeVisible();
    await expect(page.getByTestId('demo-credentials-banner')).toHaveCount(0);
    await expect(page.getByText(/demo credentials/i)).toHaveCount(0);
  });

  test('entra + fallback hides the demo banner even after revealing the local form', async ({
    page,
    context,
  }) => {
    await stubEntraConfig(context, { enabled: true, allowLocalFallback: true });

    await page.goto('/login');

    const disclosure = page.getByTestId('local-fallback-disclosure');
    await expect(disclosure).toBeVisible();
    await disclosure.click();

    // Local form is now visible, but the demo banner must remain hidden
    // because Entra is the configured identity path.
    await expect(page.getByLabel(/^password$/i)).toBeVisible();
    await expect(page.getByTestId('demo-credentials-banner')).toHaveCount(0);
    await expect(page.getByText(/demo credentials/i)).toHaveCount(0);
  });
});
