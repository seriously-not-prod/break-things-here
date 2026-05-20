/**
 * Mocked OIDC issuer fixture for Entra e2e tests (#785).
 *
 * Intercepts all Entra-related API endpoints using Playwright route
 * handlers so the suite runs without provisioning a real Azure tenant.
 * Each helper configures a {@link BrowserContext} with deterministic
 * responses that mirror the backend's Entra callback contract.
 */
import { BrowserContext, Route } from '@playwright/test';

/* ------------------------------------------------------------------ */
/*  Public types                                                       */
/* ------------------------------------------------------------------ */

/** Claims the mocked OIDC provider returns inside the id_token. */
export interface OidcMockUser {
  /** Azure AD object ID (sub / oid claim). */
  oid: string;
  email: string;
  displayName: string;
  /** Entra security-group object IDs the mock user belongs to. */
  groups: string[];
}

export interface OidcMockOptions {
  /** The mock user that "authenticates" through the OIDC flow. */
  user: OidcMockUser;
  /** Application role name the callback should return (e.g. 'Admin'). */
  roleName: string;
  /** Numeric role ID matching the `roles` table. */
  roleId: number;
  /** Whether Entra auth is enabled. @default true */
  enabled?: boolean;
  /** Whether local-credential fallback is allowed. @default false */
  allowLocalFallback?: boolean;
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const MOCK_ACCESS_TOKEN = 'ey-mock-entra-access-token';
const MOCK_CSRF_TOKEN = 'mock-csrf-token-for-e2e';
const MOCK_STATE = 'e2e-mock-oauth2-state';
const MOCK_CODE = 'e2e-mock-authorization-code';

/** Well-known group object IDs used across role-mapping tests. */
export const MOCK_GROUPS = {
  admins: '00000000-0000-0000-0000-000000000001',
  organizers: '00000000-0000-0000-0000-000000000002',
  collaborators: '00000000-0000-0000-0000-000000000003',
  guests: '00000000-0000-0000-0000-000000000004',
  viewers: '00000000-0000-0000-0000-000000000005',
} as const;

/** Pre-configured test users with deterministic group memberships. */
export const MOCK_USERS = {
  admin: {
    oid: 'oid-admin-001',
    email: 'admin@contoso.com',
    displayName: 'E2E Admin',
    groups: [MOCK_GROUPS.admins],
  },
  organizer: {
    oid: 'oid-organizer-001',
    email: 'organizer@contoso.com',
    displayName: 'E2E Organizer',
    groups: [MOCK_GROUPS.organizers],
  },
  viewer: {
    oid: 'oid-viewer-001',
    email: 'viewer@contoso.com',
    displayName: 'E2E Viewer',
    groups: [MOCK_GROUPS.viewers],
  },
  noGroups: {
    oid: 'oid-nogroups-001',
    email: 'nogroups@contoso.com',
    displayName: 'E2E No Groups',
    groups: [],
  },
} satisfies Record<string, OidcMockUser>;

/* ------------------------------------------------------------------ */
/*  Setup helper                                                       */
/* ------------------------------------------------------------------ */

/**
 * Registers Playwright route handlers on {@link context} that simulate
 * a complete Entra OIDC sign-in flow:
 *
 * 1. `GET  /api/auth/entra/config`   → feature-flag response
 * 2. `GET  /api/csrf-token`          → deterministic CSRF token
 * 3. `GET  /api/auth/entra/login`    → 302 redirect to callback with code
 * 4. `POST /api/auth/entra/callback` → session creation + cookies
 * 5. `GET  /api/auth/me`             → authenticated user profile
 * 6. `POST /api/auth/refresh`        → token refresh
 * 7. `POST /api/auth/session/heartbeat` → session keep-alive
 */
export async function setupOidcMock(
  context: BrowserContext,
  options: OidcMockOptions,
): Promise<void> {
  const { user, roleName, roleId, enabled = true, allowLocalFallback = false } = options;

  // 1. Entra feature-flag endpoint
  await context.route('**/api/auth/entra/config', (route: Route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ enabled, allowLocalFallback }),
    }),
  );

  // 2. CSRF token (needed before any POST)
  await context.route('**/api/csrf-token', (route: Route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ csrfToken: MOCK_CSRF_TOKEN }),
    }),
  );

  // 3. Entra login redirect — simulates Azure authorize endpoint.
  //    Returns a small HTML page with a JS redirect to avoid cross-browser
  //    quirks with 302 responses from route.fulfill().
  await context.route('**/api/auth/entra/login', (route: Route) =>
    route.fulfill({
      status: 200,
      contentType: 'text/html',
      body: [
        '<!DOCTYPE html><html><head>',
        '<title>Mock OIDC Redirect</title>',
        `<script>location.replace('/auth/callback?code=${encodeURIComponent(MOCK_CODE)}&state=${encodeURIComponent(MOCK_STATE)}')</script>`,
        '</head><body></body></html>',
      ].join(''),
    }),
  );

  // 4. Entra callback — exchanges mock code for session.
  await context.route('**/api/auth/entra/callback', async (route: Route) => {
    // Simulate the httpOnly session cookies the real backend sets.
    await context.addCookies([
      {
        name: 'accessToken',
        value: 'mock-encrypted-access',
        domain: 'localhost',
        path: '/',
        httpOnly: true,
        sameSite: 'Strict',
      },
      {
        name: 'refreshToken',
        value: 'mock-encrypted-refresh',
        domain: 'localhost',
        path: '/',
        httpOnly: true,
        sameSite: 'Strict',
      },
    ]);

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        message: 'Entra login successful.',
        accessToken: MOCK_ACCESS_TOKEN,
        user: {
          id: 1,
          email: user.email,
          displayName: user.displayName,
          roleId,
        },
      }),
    });
  });

  // 5. Authenticated user profile
  await context.route('**/api/auth/me', (route: Route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id: 1,
        email: user.email,
        display_name: user.displayName,
        role_id: roleId,
        role_name: roleName,
      }),
    }),
  );

  // 6. Token refresh
  await context.route('**/api/auth/refresh', (route: Route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ accessToken: MOCK_ACCESS_TOKEN }),
    }),
  );

  // 7. Session heartbeat
  await context.route('**/api/auth/session/heartbeat', (route: Route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true }),
    }),
  );
}
