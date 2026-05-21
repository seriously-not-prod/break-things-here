/**
 * End-to-end Entra login flow with mocked OIDC issuer (#785).
 *
 * Drives the full sign-in → Azure redirect → callback → dashboard flow
 * using Playwright route interception as a lightweight OIDC mock.
 * No live Azure tenant is required.
 *
 * Acceptance criteria covered:
 * - e2e/entra-auth.spec.ts starts a mocked OIDC issuer           ✔
 * - Test drives sign-in, asserts redirect, asserts session cookie  ✔
 * - Test asserts group-to-role mapping                             ✔
 * - Test runs in CI as part of the e2e job                         ✔
 * - Does not require a live Azure tenant                           ✔
 */
import { test, expect } from '@playwright/test';
import { setupOidcMock, MOCK_USERS, MOCK_GROUPS } from './fixtures/oidc-mock';

test.describe('Entra login flow — mocked OIDC (#785)', () => {
  test('sign-in redirects through OIDC flow, sets session cookie, and lands on dashboard', async ({
    page,
    context,
  }) => {
    await setupOidcMock(context, { user: MOCK_USERS.organizer });

    await page.goto('/login');
    await expect(page.getByTestId('entra-sign-in')).toBeVisible();

    // Click "Sign in with Microsoft" — triggers the mocked OIDC redirect.
    await page.getByTestId('entra-sign-in').click();

    // The flow: /api/auth/entra/login → mock redirect → /auth/callback → POST callback → /dashboard
    await page.waitForURL('**/dashboard', { timeout: 15_000 });
    expect(page.url()).toContain('/dashboard');

    // Session cookies must be present after sign-in.
    const cookies = await context.cookies();
    const accessCookie = cookies.find((c) => c.name === 'accessToken');
    const refreshCookie = cookies.find((c) => c.name === 'refreshToken');
    expect(accessCookie).toBeTruthy();
    expect(refreshCookie).toBeTruthy();
  });

  test('admin group IDs map to Admin role', async ({ page, context }) => {
    const user = { ...MOCK_USERS.admin, groups: [MOCK_GROUPS.admins] };
    await setupOidcMock(context, { user });

    await page.goto('/login');
    await page.getByTestId('entra-sign-in').click();
    await page.waitForURL('**/dashboard', { timeout: 15_000 });
    await expect(page.getByRole('heading', { name: /welcome back/i })).toBeVisible({
      timeout: 5_000,
    });

    // Hard-coded expected values — validates the mapping independently of
    // the resolver used by the mock so regressions are not masked.
    const meResponse = await page.evaluate(() =>
      fetch('/api/auth/me', { credentials: 'include' }).then((r) => r.json()),
    );
    expect(meResponse).toMatchObject({
      role_name: 'Admin',
      role_id: 3,
      groups: user.groups,
    });
  });

  test('organizer group IDs map to Organizer role', async ({ page, context }) => {
    const user = { ...MOCK_USERS.organizer, groups: [MOCK_GROUPS.organizers] };
    await setupOidcMock(context, { user });

    await page.goto('/login');
    await page.getByTestId('entra-sign-in').click();
    await page.waitForURL('**/dashboard', { timeout: 15_000 });
    await expect(page.getByRole('heading', { name: /welcome back/i })).toBeVisible({
      timeout: 5_000,
    });

    const meResponse = await page.evaluate(() =>
      fetch('/api/auth/me', { credentials: 'include' }).then((r) => r.json()),
    );
    expect(meResponse).toMatchObject({
      role_name: 'Organizer',
      role_id: 2,
      groups: user.groups,
    });
  });

  test('viewer group IDs map to Viewer role', async ({ page, context }) => {
    const user = { ...MOCK_USERS.viewer, groups: [MOCK_GROUPS.viewers] };
    await setupOidcMock(context, { user });

    await page.goto('/login');
    await page.getByTestId('entra-sign-in').click();
    await page.waitForURL('**/dashboard', { timeout: 15_000 });
    await expect(page.getByRole('heading', { name: /welcome back/i })).toBeVisible({
      timeout: 5_000,
    });

    const meResponse = await page.evaluate(() =>
      fetch('/api/auth/me', { credentials: 'include' }).then((r) => r.json()),
    );
    expect(meResponse).toMatchObject({
      role_name: 'Viewer',
      role_id: 6,
      groups: user.groups,
    });
  });

  test('no group membership falls back to Attendee role', async ({ page, context }) => {
    await setupOidcMock(context, { user: MOCK_USERS.noGroups });

    await page.goto('/login');
    await page.getByTestId('entra-sign-in').click();
    await page.waitForURL('**/dashboard', { timeout: 15_000 });
    await expect(page.getByRole('heading', { name: /welcome back/i })).toBeVisible({
      timeout: 5_000,
    });

    // No group membership → default Attendee role (role_id=1 per init.sql).
    const meResponse = await page.evaluate(() =>
      fetch('/api/auth/me', { credentials: 'include' }).then((r) => r.json()),
    );
    expect(meResponse).toMatchObject({
      role_name: 'Attendee',
      role_id: 1,
      groups: [],
    });
  });
});
