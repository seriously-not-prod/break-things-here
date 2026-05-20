# Architecture Migration Plan

**Document:** Architecture Decision & Migration Roadmap  
**Date:** 2026-05-19  
**Status:** Pending decision — requires team sign-off before implementation begins  
**Scope:** Two outstanding architectural gaps from TRD v1.0 compliance assessment

---

## Overview

The compliance assessment identified two architectural mismatches against TRD v1.0 specifications
that require a formal decision before migration can begin. Both require significant effort and have
broad blast-radius across all layers of the application.

---

## ADR-001: Frontend Framework — Vite/React Router → Next.js 14 App Router

### Requirement (TRD v1.0 §4.1)

> "Frontend: Next.js 14 with App Router, React 18, TypeScript, MUI v5, Zustand, TanStack Query v5,
> React Hook Form + Zod"

### Current State

- **Framework:** Vite 5.4 + React Router DOM v6
- **Serving:** Nginx static file server
- **Routing:** `<Route>` declarative routing in `frontend/src/App.tsx`
- **Build:** `vite build` → static assets
- **Libraries added (2026-05-19):** Zustand, TanStack Query v5, React Hook Form, Zod ✅

### Gap

- No Next.js meta-framework (SSR, API Routes, Middleware, `next/image`, App Router)
- No automatic code splitting per App Router conventions
- No built-in Next.js middleware for auth edge cases

### Migration Scope

| Area                                             | Impact                                        | Effort |
| ------------------------------------------------ | --------------------------------------------- | ------ |
| `frontend/src/App.tsx` router → `app/` directory | Full rewrite of routing layer                 | HIGH   |
| `frontend/vite.config.ts` → `next.config.ts`     | Build config replacement                      | MEDIUM |
| API calls pattern                                | TanStack Query already added; stays           | LOW    |
| All `<Route path>` → file-system routes          | 30+ pages need reorganisation                 | HIGH   |
| Auth middleware → Next.js `middleware.ts`        | Rewrite auth guard logic                      | MEDIUM |
| `index.html` → `app/layout.tsx`                  | Root layout change                            | LOW    |
| SSR requirements                                 | Determine which pages need SSR vs client-only | MEDIUM |
| Docker: Nginx → Next.js dev/prod server          | `Dockerfile.frontend` update                  | MEDIUM |

### Decision Required

Option A — **Migrate to Next.js** (spec-compliant; high effort; ~3–4 sprint weeks)  
Option B — **Document Vite as the chosen alternative** (update TRD; low effort; acceptable for training repo)

### Recommendation

For a **training repository** (as this is per `AGENTS.md`), Option B is pragmatic. Document the
rationale: Vite was chosen for its faster DX and the team added the required state-management
libraries (Zustand, TanStack Query, RHF+Zod). A separate spike/branch should prototype the
Next.js migration without disrupting the training workspace.

**Migration branch:** `feature/next-js-migration` (not yet created)

---

## ADR-002: Database Primary Keys — SERIAL → UUID

### Requirement (TRD v1.0 §4.2)

> "Primary key types: UUID (gen_random_uuid())"

### Current State

All core tables use `SERIAL PRIMARY KEY` (32-bit auto-increment integers).
All frontend TypeScript types reference `id: number`.
All backend queries pattern-match on integer IDs.

### Gap

- Sequential integer IDs expose entity count (OWASP ID enumeration risk)
- Cannot safely distribute ID generation across shards/regions
- Does not match TRD architectural specification

### Migration Scope

| Area                                                    | Impact                                 | Effort |
| ------------------------------------------------------- | -------------------------------------- | ------ |
| `database/init.sql` — all PK column definitions         | ~64 tables                             | HIGH   |
| All FK references (`user_id`, `event_id`, etc.)         | ~200+ FK columns                       | HIGH   |
| Backend API routes (`/events/:id` etc.)                 | Integer → UUID parsing                 | MEDIUM |
| Frontend TypeScript types (`id: number` → `id: string`) | ~20+ type definitions                  | MEDIUM |
| All WHERE clauses and JOIN conditions                   | Parameterized queries ok; types change | MEDIUM |
| Data migration (existing data)                          | Generate UUIDs for all existing rows   | HIGH   |
| `SERIAL` sequences removed                              | Simple                                 | LOW    |

### Migration Path

1. Add `pgcrypto` extension: `CREATE EXTENSION IF NOT EXISTS pgcrypto;`
2. Add UUID shadow columns: `ALTER TABLE events ADD COLUMN uuid_id UUID DEFAULT gen_random_uuid();`
3. Back-fill all UUID columns
4. Add FK UUID shadow columns and back-fill
5. Drop integer PKs and rename UUID columns
6. Update all backend queries
7. Update all frontend types
8. Run integration test suite

### Decision Required

Option A — **Migrate to UUID** (spec-compliant; very high effort; ~4–6 sprint weeks; data migration risk)  
Option B — **Document SERIAL as chosen alternative** (update TRD with rationale; low effort; acceptable for training repo)

### Recommendation

Option B for the training repository. Document rationale: SERIAL provides sufficient uniqueness
for a single-node deployment. UUID migration should be planned as a dedicated epic with a
proper database migration sprint, separate from other feature work.

**Migration branch:** `feature/uuid-primary-keys` (not yet created — create when team is ready)

---

## Status Summary

| ADR                        | Decision | Status            | Branch                      |
| -------------------------- | -------- | ----------------- | --------------------------- |
| ADR-001: Next.js migration | Pending  | 🟡 Needs sign-off | `feature/next-js-migration` |
| ADR-002: UUID primary keys | Pending  | 🟡 Needs sign-off | `feature/uuid-primary-keys` |

---

## Completed Compliance Fixes (2026-05-19)

All other gaps from the compliance assessment have been addressed:

| Item                                    | Fix                                                     | Status  |
| --------------------------------------- | ------------------------------------------------------- | ------- |
| ENTRA_AUTH_ENABLED default              | Set to `true` in docker-compose + .env.example          | ✅ Done |
| ENTRA_MFA_REQUIRED default              | Set to `true`                                           | ✅ Done |
| Entra group-to-role sync on every login | FR-AUTH-003 fix in entra-auth-controller.ts             | ✅ Done |
| File upload limits                      | All uploads set to 10MB/file                            | ✅ Done |
| Storage quota                           | Changed default from 500MB to 100MB/event               | ✅ Done |
| Health path mismatch (/api/health)      | Added /health alias in server.js                        | ✅ Done |
| PostgREST container                     | Added to docker-compose.yml                             | ✅ Done |
| Automated DB backup                     | Added db-backup service in docker-compose.yml           | ✅ Done |
| Audit columns (all tables)              | Migration v13 adds missing cols to 20+ tables           | ✅ Done |
| RLS coverage                            | Migration v13 enables RLS on 14 additional tables       | ✅ Done |
| Zustand state management                | Installed + auth/event/ui stores created                | ✅ Done |
| TanStack Query v5                       | Installed + QueryClientProvider + hooks                 | ✅ Done |
| React Hook Form + Zod                   | Installed + validation-schemas.ts created               | ✅ Done |
| OpenAPI/Swagger docs                    | swagger-jsdoc + swagger-ui-express at /api-docs         | ✅ Done |
| Prettier config                         | .prettierrc + .prettierignore created                   | ✅ Done |
| Pre-commit hooks                        | .githooks/pre-commit + lint-staged                      | ✅ Done |
| Load testing                            | k6 load-test.js + stress-test.js in tests/load/         | ✅ Done |
| WCAG 2.1 AA tests                       | @axe-core/playwright e2e suite in accessibility.spec.ts | ✅ Done |
| Global Ctrl+K palette                   | GlobalCommandPalette component in AppShell              | ✅ Done |
