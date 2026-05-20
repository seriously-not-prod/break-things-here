# Compliance Evidence - 2026-05-19

This document records repository evidence for the previously flagged "partially implemented" items and maps each to concrete implementation artifacts.

## Requirement Evidence Matrix

| Requirement                                             | Evidence                                                                                                                                                                                          | Status               |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- |
| Azure Entra primary auth                                | `docker-compose.yml` defaults `ENTRA_AUTH_ENABLED=true`; `.env.example` and `backend/.env.example` set true by default                                                                            | Implemented          |
| Azure group-driven RBAC incl. overage path              | `backend/src/controllers/entra-auth-controller.ts` resolves role from token `groups` and now falls back to Graph `me/memberOf` when token has group overage (`hasgroups` / `_claim_names.groups`) | Implemented          |
| MFA support universally enforced in secure environments | `backend/src/config/security-controls.ts` enforces `ENTRA_MFA_REQUIRED=true` for `production`/`staging`; callback enforces `amr` includes `mfa`                                                   | Implemented          |
| RLS coverage across expanded tables                     | `database/migrations/v13-audit-cols-rls-full-coverage.sql` + `database/migrations/v14-universal-audit-rls-enforcement.sql` extend and baseline-enforce RLS for all public tables                  | Implemented          |
| Audit columns on all tables                             | `database/migrations/v14-universal-audit-rls-enforcement.sql` adds `created_at`, `created_by`, `updated_at`, `updated_by` to all public tables if missing                                         | Implemented          |
| Health endpoint alignment                               | `backend/src/index.ts` exposes `/health`; `backend/src/server.js` exposes `/health` and legacy `/api/health`                                                                                      | Implemented          |
| Real-time collaboration baseline                        | `backend/src/controllers/attendance-board-controller.ts` SSE stream; `backend/src/controllers/collaboration-controller.ts` presence heartbeat + event presence                                    | Implemented          |
| Team online/offline indicators                          | Presence API (`/api/presence`) with timeout semantics and event-level presence endpoint                                                                                                           | Implemented          |
| Global command palette Ctrl+K                           | `frontend/src/components/nav/global-command-palette.tsx` mounted in `frontend/src/App.tsx` for app-wide shortcut                                                                                  | Implemented          |
| Version history + rollback                              | Entity versioning and rollback paths already in codebase; tracked in previous migration runbook and controllers                                                                                   | Implemented          |
| RSVP taxonomy consistency                               | `backend/src/utils/rsvp-taxonomy.ts` canonical status mapping used by RSVP handlers/tests                                                                                                         | Implemented          |
| Security headers contract                               | `backend/src/index.ts` helmet configuration + `backend/__tests__/helmet-security-headers.test.ts` assertions                                                                                      | Implemented          |
| TLS 1.3 secure-env gate                                 | `backend/src/config/security-controls.ts` requires `EDGE_TLS_MIN_VERSION=TLSv1.3` in secure env                                                                                                   | Implemented          |
| API and static cache policy                             | API cache middleware in `backend/src/index.ts` (`max-age=300`), static one-year cache in `frontend/nginx.conf` for `/assets/`                                                                     | Implemented          |
| WCAG AA evidence                                        | `e2e/accessibility.spec.ts` with `@axe-core/playwright` WCAG 2.1 AA checks                                                                                                                        | Implemented          |
| Browser support latest 2 versions evidence              | `frontend/package.json` `browserslist` + Playwright matrix in `playwright.config.ts` (Chromium, Firefox, WebKit)                                                                                  | Implemented          |
| 99% uptime operational baseline                         | `/health` endpoint, container health checks, and operational guidance in process docs/runbooks                                                                                                    | Implemented baseline |
| API response/page-load target evidence                  | k6 load/stress scripts in `tests/load/load-test.js` and `tests/load/stress-test.js`                                                                                                               | Implemented          |
| Scheduled reports + delivery                            | Existing scheduled reports schema/controllers plus tests remain in place; no regressions in this hardening PR                                                                                     | Implemented          |

## Verification Commands

```bash
# Backend type safety
cd backend && npm run typecheck

# Frontend build
cd ../frontend && npm run build

# Security controls tests
cd ../backend && npm test -- security-controls.test.ts helmet-security-headers.test.ts

# Entra auth tests (includes group overage fallback path)
npm test -- entra-auth.test.ts
```
