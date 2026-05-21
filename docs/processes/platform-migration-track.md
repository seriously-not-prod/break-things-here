# Platform Migration Track

> **Status:** Proposed — requires BRD parity sign-off before work begins.
>
> This document covers the three platform shifts needed to reach strict BRD
> compliance beyond the current feature-parity baseline.

---

## Why a Separate Track?

The current stack (Express + React SPA + PostgreSQL) already delivers functional
parity with the BRD. The items below are _platform_ migrations — they change the
execution environment, not just features — and carry significant risk if mixed
into normal sprint work. Each should be treated as its own project stream with
dedicated branch, environment, and rollback plan.

---

## Track 1 — Azure Entra ID (formerly Azure AD)

### Goal

Replace username/password + JWT sessions with OIDC tokens issued by Azure Entra ID,
enabling SSO, conditional access policies, and MFA managed at the tenant level.

### Current gap

The app uses its own `users` table with `bcrypt` password hashes, short-lived JWT
access tokens, and refresh-token rotation in the `sessions` table.

### Migration steps

| Step | Action                                                                                                               |
| ---- | -------------------------------------------------------------------------------------------------------------------- |
| 1    | Register an App Registration in your Azure tenant (reply URL, scopes).                                               |
| 2    | Add `passport-azure-ad` (or `@azure/msal-node`) to the backend.                                                      |
| 3    | Add an OIDC callback route (`/auth/entra/callback`) alongside existing `/auth/login`.                                |
| 4    | Store the `oid` claim (Entra object ID) in `users.external_id`; keep local `users` row for profile data.             |
| 5    | Replace `authenticateToken` middleware with one that validates Entra-issued JWTs against the tenant's JWKS endpoint. |
| 6    | Replace the React login screen with the MSAL redirect / popup flow.                                                  |
| 7    | Run both auth paths in parallel (feature flag) until cutover is validated.                                           |
| 8    | Remove local password columns after tenant-wide cutover.                                                             |

### Key decisions required

- Multi-tenant vs single-tenant registration.
- Whether guest RSVP users (unauthenticated public path) remain outside Entra scope.
- Service account strategy for background/scheduled jobs.

---

## Track 2 — Next.js App Router

### Goal

Replace the Vite + React SPA with a Next.js 14+ App Router application to enable
server-side rendering, React Server Components, and file-based routing.

### Current gap

The frontend is a client-only Vite SPA; there is no SSR, no file-based routing,
and no colocation of server logic with UI components.

### Migration steps

| Step | Action                                                                                                                                                             |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1    | Scaffold a new `apps/web` Next.js workspace alongside the existing `frontend/`.                                                                                    |
| 2    | Map each React Router `<Route>` to an App Router `page.tsx` under `app/(routes)/`.                                                                                 |
| 3    | Convert data-fetching hooks (`useEffect` + `fetch`) to Server Components with `async/await` where SSR is beneficial; keep Client Components for interactive pages. |
| 4    | Move shared auth session state into Next.js `cookies()` / middleware (`middleware.ts`) to enable protected routes server-side.                                     |
| 5    | Update the Express API to serve only `/api/*`; point Next.js `next.config.ts` rewrites at it.                                                                      |
| 6    | Migrate Vitest component tests to `@testing-library/react` + Next.js testing utilities.                                                                            |
| 7    | Run behind a feature flag in staging; verify SEO, Core Web Vitals, and TTFB before switching DNS.                                                                  |

### Key decisions required

- Monorepo setup (Turborepo / pnpm workspaces) vs separate repo.
- Whether to adopt Next.js API Routes to replace Express entirely (out of scope for initial migration).
- Image optimisation: use `next/image` to replace current static serving of event covers.

---

## Track 3 — PostgREST Auto-generated API

### Goal

Replace (or supplement) hand-written Express CRUD controllers with a
[PostgREST](https://postgrest.org) sidecar that auto-generates a REST API directly
from the PostgreSQL schema, reducing controller boilerplate and keeping the API
schema-driven.

### Current gap

Every resource (tasks, budgets, RSVPs, vendors, …) has a hand-written controller
that duplicates validation and SQL. PostgREST would eliminate this for standard
CRUD while keeping Express for business-logic-heavy endpoints (auth, notifications,
email blasts, CSV import/export, AI suggestions).

### Migration steps

| Step | Action                                                                                                                                                           |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | Add PostgREST as a Docker service in `docker-compose.yml`, pointing at `DATABASE_URL` with a dedicated read-write role.                                          |
| 2    | Define PostgreSQL Row-Level Security (RLS) policies to enforce event ownership and membership checks at the DB layer (mirroring the `requireEventAccess` guard). |
| 3    | Expose PostgREST under `/api/v2/` via Nginx (or Express proxy) while `/api/` continues to serve the existing controllers during transition.                      |
| 4    | Migrate read-heavy, low-logic endpoints first (vendors list, timeline, shopping lists, seating tables).                                                          |
| 5    | Replace corresponding Express controllers with thin forwards to PostgREST once RLS is validated.                                                                 |
| 6    | Retain Express handlers for: auth, password reset, file uploads, email dispatch, AI endpoint, CSV import/export, analytics aggregations, and event cloning.      |

### Key decisions required

- JWT signing secret shared between Express and PostgREST (PostgREST consumes the same JWT for user ID claim).
- Schema versioning strategy — PostgREST surfaces every column; need explicit `SECURITY DEFINER` views to hide sensitive fields (`password_hash`, `refresh_token`, etc.).
- Whether to adopt `supabase-js` client on the frontend to consume PostgREST directly, removing the need for many of the frontend API helper modules.

---

## Recommended Sequence

```
Phase 0 (now):   Feature-parity on current stack — DONE
Phase 1 (next):  Azure Entra ID auth (Track 1) — highest security ROI
Phase 2:         Next.js App Router migration (Track 2) — improves DX and SEO
Phase 3:         PostgREST for CRUD controllers (Track 3) — reduces maintenance cost
```

Each track should open a Theme-level issue and be broken down into User Stories
per the [issue hierarchy guidelines](../../.github/copilot-instructions.md).
