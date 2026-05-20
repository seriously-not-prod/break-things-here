# Requirement Compliance Assessment

Date: 2026-05-16

Scope: full repository review of documented requirements and design intent versus the current codebase, live Docker deployment, database schema, API surface, UI behavior, and available automated tests.

Assessed sources:

- `docs/requirements/festival-event-planner-brd-final.docx`
- `docs/requirements/festival-event-planner-frd-final.docx`
- `docs/requirements/festival-event-planner-trd-final.docx`
- `docs/requirements/festival-event-planner-usecases-final.docx`
- `docs/requirements/festival-event-planner-personas-final.docx`
- `docs/FestivalPlanner.jsx`
- `docs/entra-auth-rollout.md`
- `docs/postgrest-pilot.md`
- `docs/processes/brd-v2-migration-runbook.md`
- `docs/processes/platform-migration-track.md`

Observed runtime:

- Docker deployment from `docker-compose.yml`
- Frontend reachable at `http://localhost:8081`
- Backend reachable at `http://localhost:4000`
- PostgreSQL reachable in `festival-db`

Method:

- Read the requirement and design corpus.
- Reviewed frontend, backend, route, schema, and configuration files.
- Queried the live database schema and runtime flags.
- Exercised the deployed UI and selected HTTP endpoints.
- Ran available automated test suites where practical.

## Executive Summary

The application is functionally broad and materially more capable than a minimal MVP in several domains. The live implementation includes substantial modules for events, guests, budgets, tasks, shopping, vendors, timeline, gallery, analytics, notifications, seating, check-in, messaging, templates, and reports.

The largest gaps are not basic feature absence. They are architecture, identity, security model, and data-contract divergence from the documented requirements.

Current overall status:

- Functional breadth: substantial
- Requirement parity: partial
- Architecture parity: non-compliant
- Identity and authorization parity: partial to non-compliant
- Database contract parity: partial
- UI parity: partial
- Deployment parity: non-compliant
- Test confidence: mixed

Bottom line:

- The repository does not currently match the documented system exactly.
- Zero-gap compliance has not been achieved.
- The most important blockers are the runtime architecture, Entra-first authentication model, PostgREST and RLS enforcement, and several core schema and workflow mismatches.

## What Is Implemented Well

- The deployed stack is healthy and starts successfully through Docker Compose.
- The frontend includes a real authenticated workspace with dashboard, events, calendar, guests, budget, tasks, vendors, shopping, timeline, gallery, analytics, messaging, seating, check-in, profile, and admin routes.
- The backend exposes a large Express API surface with controllers for most BRD domains.
- The database schema contains 64 live public tables, covering far more than the 11-table baseline described in the requirements.
- Entra support exists in code, including configuration validation, callback handling, token validation, account linking, and optional MFA enforcement.
- Budget, timeline, gallery, notifications, and vendor workflows are materially richer than the FRD minimum in some places.
- The running frontend demonstrates live navigation, dashboard summaries, and role-aware application shell behavior.

## Critical Findings

### 1. Runtime architecture does not match the documented target architecture

Documented requirement:

- BRD and TRD describe a Next.js 14 application with App Router, PostgREST API generation, and a frontend service on port 3000.

Observed implementation:

- The live deployment is React + Vite + React Router on the frontend and Express on the backend.
- `docker-compose.yml` defines `db`, `db-test`, `backend`, and `frontend`, but no PostgREST service.
- The deployed frontend is served by nginx on port 8081, not a Next.js dev server on 3000.
- The backend API is Express under `/api`, not a PostgREST surface on port 3001.

Evidence:

- `frontend/package.json`
- `frontend/src/App.tsx`
- `backend/src/index.ts`
- `docker-compose.yml`
- `docs/requirements/festival-event-planner-trd-final.docx`

Impact:

- This is a first-order compliance failure because the core system architecture differs from the requirements, deployment model, and API contract.

Required remediation:

- Decide whether the requirements remain authoritative or the codebase architecture is now the source of truth.
- If the requirements remain authoritative, either migrate to Next.js and PostgREST or revise the requirement documents and supporting design docs to reflect the actual Express plus Vite architecture.

### 2. Entra-first authentication is not the live authentication model

Documented requirement:

- FR-AUTH-001 says users must authenticate using Azure Entra ID via OpenID Connect.
- BRD positions Entra ID as the primary identity provider with SSO and MFA support.

Observed implementation:

- The login page defaults to local email and password auth and advertises demo credentials.
- The Microsoft sign-in button only appears when `/api/auth/entra/config` returns enabled.
- The running deployment returns `{"enabled":false}` for Entra config.
- The live UI therefore does not expose Entra sign-in.

Evidence:

- `frontend/src/components/login-form/login-form.tsx`
- `backend/src/config/entra.ts`
- `backend/src/controllers/entra-auth-controller.ts`
- runtime `GET /api/auth/entra/config` returned `{"enabled":false}`

Impact:

- The application currently behaves as a local-auth-first system with optional Entra support, not the Entra-first system described in the FRD and TRD.

Required remediation:

- Enable and validate Entra in deployed environments.
- Remove local-auth-first language and demo-credential dependence if Entra remains mandatory.
- If dual-auth is intentional, update the FRD, TRD, and BRD explicitly to document that model.

### 3. Azure group-to-role mapping is not implemented as documented

Documented requirement:

- FR-AUTH-003 and the BRD require authorization determined by Azure Entra ID group membership.
- The persona and use case docs describe five Entra groups: Admins, Organizers, Collaborators, Guests, and Viewers.

Observed implementation:

- The Entra callback links or provisions users but does not fetch Microsoft Graph groups or map Azure groups to application roles.
- The callback simply keeps or returns the existing `role_id` on the user record.
- The live roles table contains `Attendee`, `Organizer`, `Admin`, `Collaborator`, `Guest`, and `Viewer`.

Evidence:

- `backend/src/controllers/entra-auth-controller.ts`
- `database/init.sql`
- live SQL query of `roles`

Impact:

- Role assignment is not driven by Azure group membership as documented.
- IT administrator and RBAC use cases are therefore not compliant end to end.

Required remediation:

- Integrate Microsoft Graph or group claims-based role resolution.
- Define the exact mapping from Entra groups to application roles.
- Remove or formally document the extra `Attendee` role if it is retained.

### 4. Database Row Level Security is not active in the running deployment

Documented requirement:

- BRD, FRD, and TRD require PostgreSQL Row Level Security as a core enforcement mechanism.

Observed implementation:

- RLS-related code and migrations exist.
- The live database reports `relrowsecurity = false` and `relforcerowsecurity = false` for `events`, `event_members`, `tasks`, `expenses`, `vendors`, and `rsvps`.
- `docs/postgrest-pilot.md` and the runbook indicate this is feature-flagged behind `RLS_PILOT_ENABLED`.

Evidence:

- `backend/src/db/database.ts`
- `database/migrations/v2-brd-auth-rbac-rls-parity.sql`
- `docs/postgrest-pilot.md`
- live SQL query against `pg_class`

Impact:

- Database-level access control is not enforcing the documented security model in the running system.
- Current protection depends primarily on controller-level checks.

Required remediation:

- Enable RLS in the deployed environment when the required validation work is complete.
- Add deployment checks that fail startup or release if the target environment is expected to enforce RLS but does not.

### 5. PostgREST is not implemented in the deployed stack

Documented requirement:

- TRD section 3 defines PostgREST-generated endpoints as the API architecture.

Observed implementation:

- No `postgrest` Docker service exists.
- No `/rest` or `/api/v2` PostgREST endpoint is exposed.
- The live API is entirely controller-driven Express routing.
- Supporting docs explicitly describe PostgREST as a planned pilot, not a completed implementation.

Evidence:

- `docker-compose.yml`
- `backend/src/routes/api-routes.ts`
- `docs/postgrest-pilot.md`
- `docs/processes/platform-migration-track.md`

Impact:

- The system is not compliant with the documented API generation and runtime architecture.

Required remediation:

- Either implement PostgREST and its auth binding, or revise the requirements to reflect the current Express architecture.

## High-Severity Functional and Data-Contract Gaps

### Event status workflow is incomplete versus the requirement set

Documented requirement:

- BRD and TRD require `Draft`, `Planning`, `Confirmed`, `Active`, `Completed`, and `Cancelled`.

Observed implementation:

- The `events` constraint allows `Draft`, `Active`, `Completed`, and `Cancelled`.
- `Planning` and `Confirmed` are not in the live table constraint.

Evidence:

- `database/init.sql`

Impact:

- Event lifecycle workflows, filters, reporting, and audit semantics cannot exactly match the requirement documents.

### Core table shapes do not match the documented data model

Documented requirement:

- TRD calls for UUID keys, `owner_id` on events, `azure_user_id`, a `guests` table, and a simpler 11-table model.

Observed implementation:

- Live schema uses integer `SERIAL` keys.
- `events` uses `created_by`, not `owner_id`.
- `users` uses local auth fields such as `password_hash`, `email_verification_token`, and lockout metadata.
- There is no separate `guests` table. Guest information is carried primarily in `rsvps`.
- The live schema contains 64 public tables.

Evidence:

- `database/init.sql`
- live column inspection of `events` and `rsvps`
- live table list from PostgreSQL

Impact:

- TRD data contracts, integrations, and database documentation are materially out of date.

### Audit-column requirement is not met across the schema

Documented requirement:

- FRD and BRD require `created_at`, `created_by`, `updated_at`, and `updated_by` on all tables.

Observed implementation:

- Many live tables are missing one or more required audit columns.
- Examples include `activity_feed`, `audit_log`, `communication_log`, `event_members`, `notifications`, `password_reset_tokens`, `rsvps`, `sessions`, `shopping_items`, `task_comments`, `vendor_communication_log`, and others.
- The live audit query returned 56 public tables missing at least one required audit column.

Evidence:

- live SQL audit-column query against `information_schema.columns`

Impact:

- This is a structural non-compliance issue that affects traceability, auditability, and consistency with the documented data governance model.

### API contract differs from the documented contract

Documented requirement:

- TRD requires PostgREST endpoints, Authorization-header JWT handling, and flexible query conventions.

Observed implementation:

- The actual API is Express routes under `/api`.
- State-changing requests require an HMAC CSRF token obtained from `/api/csrf-token`.
- Authentication supports encrypted HttpOnly cookies and also exposes an access token in non-production for Entra callback flow.
- The backend exposes `/health`, not `/api/health`.

Evidence:

- `backend/src/index.ts`
- `backend/src/routes/api-routes.ts`
- runtime endpoint probing

Impact:

- External clients built to the documented TRD contract will not interoperate without translation.

### Security header behavior does not fully match the TRD

Documented requirement:

- TRD requires `X-Frame-Options: DENY`.

Observed implementation:

- The live backend response returned `X-Frame-Options: SAMEORIGIN`.

Evidence:

- runtime `GET /api/auth/entra/config` response headers

Impact:

- The deployed security posture does not precisely match the documented standard.

## Medium-Severity Functional Gaps

### RSVP status taxonomy differs from the FRD and BRD

Documented requirement:

- Required statuses include `Pending`, `Confirmed`, `Declined`, `Maybe`, and `No Response`.

Observed implementation:

- Live schema allows `Pending`, `Going`, `Maybe`, `Not Going`, and `Declined`.
- Dashboard UI also surfaces `Going` rather than `Confirmed`.

Evidence:

- `database/init.sql`
- live dashboard observation at `/dashboard`

Impact:

- Reporting, guest copy, and acceptance criteria are not aligned.

### Keyboard shortcut behavior does not match the documented command palette requirement

Documented requirement:

- BRD calls for `Ctrl+K` command palette behavior for power users.

Observed implementation:

- The live app implements `?`, `F1`, and `g` chord shortcuts with an overlay help dialog.
- No evidence was found of a `Ctrl+K` command palette.

Evidence:

- `frontend/src/App.tsx`

Impact:

- Power-user navigation is present, but not in the form documented.

### Login and identity UX differ from the personas and use cases

Documented requirement:

- Personas and use cases assume Entra-centric enterprise auth for planners and frictionless RSVP for guests.

Observed implementation:

- Organizer and admin login use local credentials in the running environment.
- Guest RSVP token flow exists, but the organizer and administrator authentication story is different from the documented enterprise story.

Evidence:

- `frontend/src/components/login-form/login-form.tsx`
- `frontend/src/components/auth/entra-callback.tsx`

Impact:

- The deployed user journey does not fully match the documented personas, especially the administrator persona.

### File upload limits do not cleanly match the documented constraints

Documented requirement:

- BRD lists 10 MB per file and 100 MB per event total.

Observed implementation:

- Profile photo upload is limited to 2 MB.
- Event document upload is limited to 5 MB.
- Vendor contracts are limited to 10 MB.
- Event-level aggregate quota behavior exists through storage columns, but the documented numeric contract is not consistently enforced across upload types.

Evidence:

- `backend/src/routes/api-routes.ts`
- live `events` table column inspection shows storage quota fields

Impact:

- File handling behavior is inconsistent with the documented upload policy.

## Areas That Are Broadly Aligned or Better Than Minimum

### Event management

Status: mostly aligned, with workflow-state differences.

Implemented evidence:

- event creation, editing, detail pages, templates, cloning, bulk actions, calendar, filters, search, tags, map coordinates, waitlist indicators, and archive support.

Evidence:

- `frontend/src/components/events/`
- `backend/src/controllers/event-controller.ts`
- `backend/src/controllers/event-templates-controller.ts`
- `backend/src/controllers/event-bulk-controller.ts`

### Guest and RSVP management

Status: strongly implemented, partially divergent in terminology and some contract details.

Implemented evidence:

- guest add and import flows, duplicate detection and merge, public RSVP token flows, RSVP questions, meal options, confirmations, ICS downloads, QR generation, waitlist promotion, and export formats.

Evidence:

- `backend/src/controllers/rsvps-controller.ts`
- `backend/src/controllers/rsvp-token-controller.ts`
- `backend/src/controllers/guest-merge-controller.ts`
- `backend/src/controllers/rsvp-questions-controller.ts`
- `backend/src/controllers/waitlist-controller.ts`

### Budget management

Status: strongly implemented and in some areas richer than the FRD.

Implemented evidence:

- categories, templates, planning rates, forecasting, comparison, approval and reimbursement workflow, OCR extraction, reconciliation logs, and reporting.

Evidence:

- `frontend/src/components/budget/budget-page.tsx`
- `backend/src/controllers/budget-controller.ts`
- `backend/src/controllers/budget-forecast-controller.ts`
- `database/init.sql`

### Tasks, vendors, shopping, timeline, gallery, notifications, and seating

Status: substantially implemented.

Implemented evidence:

- Kanban tasks, dependencies, templates, time entries, workload, vendors with bookings and schedules, shopping-to-budget sync, timeline comparison, gallery shares and moderation, notifications, attendance, QR check-in, and seating groups.

Evidence:

- `frontend/src/components/tasks/`
- `frontend/src/components/vendors/`
- `frontend/src/components/shopping/`
- `frontend/src/components/timeline/`
- `frontend/src/components/gallery/`
- `frontend/src/components/checkin/`
- `frontend/src/components/seating/`
- `backend/src/routes/api-routes.ts`
- `database/init.sql`

## UI Behavior Assessment

Observed directly in the deployed application:

- Login page routes to `/login` and shows a polished auth shell.
- Local sign-in works with demo credentials in the live environment.
- The Entra button is hidden because Entra is disabled in runtime config.
- The authenticated dashboard includes KPI cards, upcoming events, RSVP breakdown, task summary, budget overview, quick access, notifications entry point, profile access, admin entry, and grouped navigation.
- The sidebar structure is coherent and the route inventory is broad.

Compliance assessment:

- Responsive, component-based, Material-style UI is present.
- Forms and page shells appear consistent.
- Core organizer workflows are discoverable.
- The exact documented auth and command-palette interaction model is not present.

## Deployment and Operational Assessment

Compliant or positive:

- Docker Compose startup works.
- Health endpoint exists.
- Security middleware is active.
- CSRF protection exists.
- Rate limiting exists.

Non-compliant or divergent:

- No PostgREST container.
- Frontend runtime port differs from requirement docs.
- Next.js runtime is absent.
- RLS is disabled in the live environment.
- No evidence found for documented backup scheduling, disaster recovery, or production monitoring integrations.

## Test and Quality Assessment

Frontend:

- The dedicated frontend test run showed at least 17 passing test files and 143 passing tests before output truncation.
- No frontend test failures were captured in the observed run.
- Warnings were emitted for `act(...)` wrapping and invalid DOM nesting in the shopping UI tests.

Backend:

- The backend test run was unstable and did not complete cleanly in the observed session.
- Output showed repeated failing or hanging areas around scheduled reports, shopping price comparison, JWT refresh, communication endpoints, session timeout, and schema expectations.

Tooling gaps versus TRD:

- No evidence found of Playwright.
- No evidence found of Prettier configuration.
- No evidence found of OpenAPI or Swagger API documentation.
- No evidence found of Flyway migrations.
- Frontend and backend both use Vitest, not the Jest-first tooling described in the TRD.

## Requirement Compliance by Domain

| Domain                  | Status                   | Notes                                                                           |
| ----------------------- | ------------------------ | ------------------------------------------------------------------------------- |
| Architecture            | Non-compliant            | Vite plus Express deployed, not Next.js plus PostgREST                          |
| Authentication          | Partial                  | Entra implemented in code, disabled in runtime, local auth primary              |
| RBAC                    | Partial                  | Rich role system exists, but not Azure group-driven as specified                |
| RLS                     | Partial to non-compliant | Implemented behind flag, disabled live                                          |
| Event management        | Partial to strong        | Broad feature coverage, status workflow mismatch remains                        |
| Guest and RSVP          | Strong but divergent     | Extensive coverage, status taxonomy and contract differ                         |
| Budget                  | Strong                   | Meets or exceeds many documented needs                                          |
| Tasks                   | Strong                   | Broadly aligned and in some areas richer                                        |
| Shopping                | Strong                   | Implemented with collaboration and budget sync                                  |
| Vendors                 | Strong                   | Implemented with lifecycle and scheduling                                       |
| Timeline                | Strong                   | Implemented with planned-vs-actual support                                      |
| Gallery                 | Strong                   | Implemented with moderation, albums, shares, comments                           |
| Analytics and reporting | Partial to strong        | Present, but custom builder and some delivery contracts need verification       |
| Notifications           | Partial to strong        | Implemented, but full schedule and preference parity should be rechecked        |
| Collaboration           | Partial                  | Activity feed, chat, versions exist; true real-time WebSocket parity unclear    |
| Database contract       | Partial                  | Rich schema exists, but not the documented one                                  |
| Deployment contract     | Non-compliant            | Ports, services, and runtime stack differ                                       |
| Testing and tooling     | Partial                  | Good test presence, but tooling diverges from TRD and backend suite is unstable |

## Priority Remediation Plan

### P0: Decide the source of truth

- Choose whether the requirement corpus or the current implementation architecture is authoritative.
- This decision must happen before further parity work. Otherwise the team will continue shipping into a moving target.

### P1: Close architectural and identity mismatches

- Align the architecture docs to the code, or implement the missing Next.js and PostgREST runtime.
- Make Entra the default auth path if the FRD remains authoritative.
- Implement Azure group-to-role mapping.
- Enable and validate RLS in the target environment.

### P2: Repair core data-contract mismatches

- Normalize event status workflow to the required lifecycle.
- Normalize RSVP taxonomy to the required terms.
- Decide whether guest data should remain inside `rsvps` or be split into a first-class `guests` table, then align docs or schema.
- Bring audit columns to a defined standard across all tables.

### P3: Align API and operational contracts

- Either expose the documented PostgREST surface or revise the TRD and integration docs to the real Express contract.
- Align health-check path, security-header expectations, port mappings, and deployment documentation.
- Add missing operational evidence for backups, monitoring, and recovery if those remain required.

### P4: Stabilize verification

- Repair the unstable backend tests first.
- Add explicit requirement-to-test traceability for auth, RLS, role mapping, event lifecycle, RSVP taxonomy, and deployment checks.
- Add a release gate that validates runtime flags and schema invariants against the chosen source of truth.

## 3.1.3 Data Security - Detailed Compliance (Current Branch)

Requirement baseline (exact):

- HTTPS/TLS 1.3 for all communications
- Database encryption at rest
- SQL injection prevention via parameterized queries
- XSS protection with Content Security Policy
- CSRF protection with token validation
- Input validation and sanitization
- Secure file upload with virus scanning
- Rate limiting to prevent abuse

Implementation assessment and evidence:

1. HTTPS/TLS 1.3 for all communications

- Status: implemented in app layer, with production/staging HTTPS enforcement added.
- Evidence: `backend/src/index.ts`
- Details:
  - Production/staging now enforce HTTPS via trusted proxy headers and reject/redirect insecure HTTP requests.
  - HSTS is configured with long max-age, subdomain coverage, and preload.
  - TLS 1.3 termination remains an infrastructure responsibility (reverse proxy / ingress), but the application now enforces HTTPS-only access behavior.

2. Database encryption at rest

- Status: enforced via production/staging startup attestation gate.
- Evidence: `backend/src/db/database.ts`
- Details:
  - In production/staging, startup now hard-fails unless `DB_ENCRYPTION_AT_REST_VERIFIED=true` is set.
  - Database transport is constrained to verified TLS modes (`sslmode=verify-ca|verify-full`) with certificate verification enabled.
  - This converts at-rest encryption from a soft operational note into an explicit deployment gate.

3. SQL injection prevention via parameterized queries

- Status: implemented.
- Evidence: `backend/src/db/database.ts`, `backend/src/controllers/*.ts`
- Details:
  - Queries consistently use placeholders (`$1`, `$2`, etc.) with parameter arrays.
  - Database adapter converts `?` placeholders to PostgreSQL parameter bindings before execution.

4. XSS protection with Content Security Policy

- Status: implemented.
- Evidence: `backend/src/index.ts`
- Details:
  - Helmet CSP is active with restrictive defaults (`default-src 'self'`, `object-src 'none'`, `frame-ancestors 'none'`) and controlled `connect-src`.

5. CSRF protection with token validation

- Status: implemented.
- Evidence: `backend/src/index.ts`
- Details:
  - Stateless HMAC CSRF token generation and verification is enforced for all state-changing `/api` requests.
  - Dedicated CSRF token endpoint is rate-limited.

6. Input validation and sanitization

- Status: implemented (sanitization globally; validation endpoint-specific).
- Evidence: `backend/src/middleware/sanitize-input.ts`, `backend/src/controllers/*.ts`
- Details:
  - Recursive request sanitization is applied for params/query/body.
  - Controllers include domain-specific validation rules for accepted values, lengths, and formats.

7. Secure file upload with virus scanning

- Status: implemented and now extended to vendor contracts.
- Evidence: `backend/src/controllers/profile-controller.ts`, `backend/src/controllers/event-documents-controller.ts`, `backend/src/controllers/vendors-controller.ts`, `backend/src/utils/virus-scan.ts`
- Details:
  - Upload flows enforce MIME and size limits.
  - Malware scanning (ClamAV or secure stub path) is executed before persistence.
  - Rejected uploads are deleted and audit-logged.

8. Rate limiting to prevent abuse

- Status: implemented.
- Evidence: `backend/src/middleware/rate-limit.ts`, `backend/src/index.ts`, `backend/src/routes/api-routes.ts`
- Details:
  - Global API limits, auth limits, CSRF token limits, health limits, public endpoint limits, tracking limits, and GDPR action limits are active.

Conclusion for 3.1.3:

- The codebase now enforces all listed 3.1.3 controls through implementation plus production/staging startup gates.
- If any required security control is missing, backend startup is blocked.

## Final Assessment

This application is not missing whole product areas. It is missing exact compliance with the documented architecture, identity model, security posture, and several core data and workflow contracts.

If the goal is strict requirement conformance, the current implementation should be treated as a partial match with major architectural divergence.

If the goal is to ship the current system as the product baseline, the requirements and design documents must be updated aggressively, because they no longer describe the running application accurately enough for implementation, QA, integration, or operational teams to rely on them.
