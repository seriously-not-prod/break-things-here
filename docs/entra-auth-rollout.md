# Entra ID Auth — Rollout and Rollback Guide

Issues: #420, #468, #469, #470, #471

---

## Overview

Azure Entra ID (formerly Azure AD) sign-in runs **in parallel** with the existing local email/password auth. The Entra path is hidden behind a feature flag (`ENTRA_AUTH_ENABLED`) and can be toggled without a deployment. Local auth continues to work at all times.

---

## Prerequisites

| Requirement           | Detail                                                                                                     |
| --------------------- | ---------------------------------------------------------------------------------------------------------- |
| Azure tenant          | Access to create an App Registration in Azure Portal                                                       |
| App Registration      | Configured with `openid profile email` scopes and the redirect URI                                         |
| Environment variables | `AZURE_TENANT_ID`, `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET`, `AZURE_REDIRECT_URI`                          |
| Database              | Column `entra_oid` and `auth_provider` added to `users` table (done in migration automatically on startup) |

---

## Azure App Registration Setup

1. Go to **Azure Portal → App registrations → New registration**.
2. Name the app (e.g. "Festival Planner Dev").
3. Set **Redirect URI** to `http://localhost:3000/auth/entra/callback` (or your production URL).
4. Under **Certificates & secrets**, create a new Client Secret. Copy it immediately.
5. Note the **Application (client) ID** and **Directory (tenant) ID** from the Overview page.
6. Under **API permissions**, ensure `openid`, `profile`, and `email` delegated permissions are granted.

---

## Rollout Steps

### 1. Set environment variables

Add to `.env` (or your deployment secrets):

```env
ENTRA_AUTH_ENABLED=true
AZURE_TENANT_ID=<your-tenant-id>
AZURE_CLIENT_ID=<your-client-id>
AZURE_CLIENT_SECRET=<your-client-secret>
AZURE_REDIRECT_URI=https://your-domain.com/auth/entra/callback
```

### 2. Restart the backend

The backend validates the config at startup. If any required variable is missing and the flag is `true`, the server will **refuse to start** with a clear error message — preventing misconfigured rollouts.

### 3. Verify the feature flag endpoint

```bash
curl http://localhost:4000/api/auth/entra/config
# Expected: {"enabled":true}
```

### 4. Test Entra login

- Navigate to `/login`.
- The **"Sign in with Microsoft"** button appears only when the feature flag is enabled.
- Clicking it redirects to Azure. After authentication, users are returned to `/auth/entra/callback`.

### 5. User provisioning behaviour

| Case                                                              | Outcome                                                     |
| ----------------------------------------------------------------- | ----------------------------------------------------------- |
| User signs in with Entra, email matches an existing local account | Existing account is linked (sets `entra_oid`)               |
| User signs in with Entra, no matching local email                 | New account is auto-provisioned (pre-verified, no password) |
| Returning Entra user (already linked)                             | OID lookup finds account directly                           |

---

## Risks

| Risk                                                             | Mitigation                                                                      |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Misconfigured client secret                                      | Server refuses to start with clear error                                        |
| Stale JWKS keys                                                  | Keys are cached 1 hour; cache is auto-invalidated on `kid` mismatch             |
| Duplicate accounts (same person registers locally and via Entra) | Linking by email at first Entra sign-in prevents duplicates                     |
| Entra-provisioned accounts have no password                      | By design — they authenticate via Entra only. Password reset is not applicable. |

---

## Rollback Steps

### Immediate rollback (zero-downtime)

1. Set `ENTRA_AUTH_ENABLED=false` in environment.
2. Restart the backend.
3. The "Sign in with Microsoft" button disappears from the frontend automatically.
4. All existing Entra-linked accounts retain their `entra_oid` column value — the link is preserved for re-enablement.
5. Entra-provisioned accounts (no local password) will not be able to log in until Entra is re-enabled. These accounts can be given a password via the admin panel.

### Database rollback (if schema changes must be reverted)

The `entra_oid` and `auth_provider` columns are added via `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` — they are non-breaking and can be left in place without impact to local auth. To remove:

```sql
ALTER TABLE users DROP COLUMN IF EXISTS entra_oid;
ALTER TABLE users DROP COLUMN IF EXISTS auth_provider;
```

---

## Operational Notes

- **Token caching:** JWKS keys from Azure are cached in memory with a 1-hour TTL. The cache is invalidated automatically when a token is signed with an unknown `kid`.
- **Session model:** Entra sessions use the same session table and expiry as local sessions — no separate session store is needed.
- **CSRF:** The Entra callback POST goes through the same CSRF middleware. The frontend `api-client` handles CSRF token fetching automatically.
- **Monitoring:** Check application logs for `[Entra]` prefixed messages to trace sign-in flow.

---

## Test Coverage

Tests in `backend/__tests__/entra-auth.test.ts`:

- Feature flag gates all Entra endpoints
- Config validation throws on missing variables
- New users are provisioned from Entra claims
- Existing users are linked by email
- OID lookup takes priority on repeat logins

---

## Persona Review — Entra-First Login Copy (#790)

The FRD defines four primary personas whose journeys presume enterprise SSO:

| Persona    | Role                      | SSO Expectation                                                        |
| ---------- | ------------------------- | ---------------------------------------------------------------------- |
| **Sarah**  | Event Organiser           | Signs in via corporate Microsoft account; expects seamless MFA         |
| **Marcus** | Volunteer Coordinator     | Uses shared department credentials; relies on Entra group membership   |
| **Emily**  | Attendee / External Guest | May use a personal Microsoft account; needs clear MFA guidance         |
| **David**  | Platform Administrator    | Manages Entra App Registration; expects local fallback for break-glass |

**Login copy changes applied (Task #790):**

1. **Primary CTA** — reads "Sign in with Microsoft" for all personas when Entra is enabled.
2. **MFA help text** — a notice below the CTA explains that multi-factor authentication may be required, setting expectations for Sarah, Marcus, and Emily who encounter MFA prompts.
3. **Local-fallback gating** — forgot-password and create-account links are hidden when Entra is the sole identity path, surfacing only when the operator has explicitly opted into `ALLOW_LOCAL_FALLBACK`. This matches David's break-glass scenario without confusing SSO-first users.
4. **Snapshot tests** — Entra-on (entra-only), Entra-on (with fallback), and Entra-off (local-only) variants are covered by snapshot tests in `frontend/test/login-form.test.tsx`.

---

## Environment Rollout Matrix

The following table is the single source of truth for which environments run Entra ID as the primary identity provider, whether local-credential fallback is permitted, and how signing keys are sourced.

| Environment     | `NODE_ENV`    | Entra ID                                                   | Local Fallback                                                                                          | Signing Keys Source                                                                                                                                        | Notes                                                                                                                                                         |
| --------------- | ------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Production**  | `production`  | **On** (enforced at startup)                               | **Off** by default; requires explicit `ENTRA_ALLOW_LOCAL_FALLBACK=true` for break-glass                 | Azure JWKS endpoint (`login.microsoftonline.com/.../discovery/v2.0/keys`); `JWT_SECRET`, `TOKEN_HASH_SECRET`, `REFRESH_TOKEN_ENC_KEY` from secrets manager | Startup assertion blocks boot if `ENTRA_AUTH_ENABLED` ≠ `true` or MFA is not enforced. Local login returns `410 Gone` unless fallback is explicitly opted in. |
| **Staging**     | `staging`     | **On** (enforced at startup)                               | **Off** by default; same gating as production                                                           | Azure JWKS endpoint; secrets injected via CI/CD pipeline environment                                                                                       | Mirrors production policy. Same startup assertion as prod. Used for UAT and pre-release validation.                                                           |
| **Development** | `development` | **On** (default `true`); can be toggled to `false` locally | **On** when Entra is disabled or `ENTRA_ALLOW_LOCAL_FALLBACK=true`; UI hides local form when Entra-only | Azure JWKS when Entra is enabled; dev-local `JWT_SECRET` from `.env` file; `CSRF_SECRET` is ephemeral per-process                                          | No startup assertion. Developers may disable Entra to work offline with seeded demo users (`admin@festival.local`, `alice@email.com`).                        |
| **Test (CI)**   | `test`        | **Off** (`ENTRA_AUTH_ENABLED=false` in vitest/Playwright)  | **On** (local auth is the sole path in automated tests)                                                 | Test-only `JWT_SECRET` hardcoded in `vitest.config.ts`; no Azure JWKS calls                                                                                | Entra callback endpoints return `404`. E2E Entra tests use mocked OIDC via Playwright route interception (`e2e/fixtures/oidc-mock.ts`).                       |

### Key Variables Controlling the Matrix

| Variable                     | Values                                            | Effect                                                                            |
| ---------------------------- | ------------------------------------------------- | --------------------------------------------------------------------------------- |
| `ENTRA_AUTH_ENABLED`         | `true` / `false`                                  | Gates all Entra endpoints and the "Sign in with Microsoft" button                 |
| `ENTRA_ALLOW_LOCAL_FALLBACK` | `true` / unset                                    | When unset (default), local login is blocked in production/staging if Entra is on |
| `ENTRA_MFA_REQUIRED`         | `true` / `false`                                  | Rejects Entra tokens whose `amr` claim does not include `mfa`                     |
| `NODE_ENV`                   | `production` / `staging` / `development` / `test` | Determines whether startup assertions run and HTTPS is enforced                   |

### Enforcement Checkpoints

1. **Startup assertion** (`backend/src/config/security-controls.ts`): Exits the process if `ENTRA_AUTH_ENABLED` or `ENTRA_MFA_REQUIRED` are not `true` in production/staging.
2. **Auth controller gate** (`backend/src/controllers/auth-controller.ts`): Returns `410 Gone` for `POST /api/auth/login` when Entra is on and fallback is not allowed.
3. **Frontend feature flag** (`/api/auth/entra/config`): Drives conditional rendering of login UI — SSO button vs. local form.

---

## Related Runbooks

- [Entra Outage — Temporary Fallback Toggle](operations/entra-outage.md)
