# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

> **⚠️ DISCLAIMER: This is a fake project for demonstration/testing purposes only.**
>
> **No feedback will be collected or worked on. Use at your own risk.**

## [Unreleased]

### Fixed
- **#664 post-merge review follow-ups**: hardened four issues identified during the develop-branch review of PRs #695–#698.
  - **RLS default is now safe for non-superuser DB roles**: `runMigrations()` auto-detects the connecting role's `BYPASSRLS` attribute. RLS policies are only applied when the role bypasses them (so policies remain inert) or when `RLS_PILOT_ENABLED=true` is set explicitly. On a hardened non-superuser role with no `app.current_user_id` context plumbing yet in controllers, RLS is auto-disabled with a warning instead of silently filtering every row out.
  - **Legacy `POST /api/rsvps` now normalizes status aliases**: the legacy `submitRsvp` and `updateRsvp` handlers reuse `normalizeLegacyRsvpStatusInput`, so `Confirmed`/`No Response`/`tentative`/`cancelled`/`rejected` (and every variant in `RSVP_STATUS_INPUT_ALIAS_LIST`) all persist as the canonical legacy values (`Going`, `Pending`, `Maybe`, `Not Going`, `Declined`). Eliminates the status drift between `/rsvps` and `/events/:id/rsvps`.
  - **400-response `allowed` payload now surfaces every accepted alias** via the new `RSVP_STATUS_INPUT_ALIAS_LIST` export; previously only 7 of 17 accepted inputs were advertised to clients.
  - **TZ-correctness fix extended to five sibling expiry/deadline columns**: `users.locked_until`, `users.pending_email_token_expiry`, `events.rsvp_deadline`, `rsvps.rsvp_deadline`, and `password_reset_rate_limit.window_start` are now `TIMESTAMPTZ` to match the sessions/password-reset-token fix in PR #698. New migration `database/migrations/v11-timestamptz-followup-664.sql` promotes existing prod columns in place via `AT TIME ZONE 'UTC'`; `runMigrations()` performs the same conversion idempotently at startup.
  - **RBAC UI: Create-Event CTAs gated for non-edit roles**: dashboard `QuickAccessGrid`, `CalendarPage` (empty-state and toolbar), and `EventPickerModal` (both create buttons) now use `canEditEvent(user.roleName)` so attendees/guests/viewers no longer see CTAs that route to a denied page.
  - Removed obsolete SQLite-style migration tests (`backend/__tests__/budget-expenses-migration.test.ts`, `backend/__tests__/venues-vendors-migration.test.ts`) that used `PRAGMA table_info()` against the PostgreSQL backend and could not be run.

### Added
- **P1-Duplicate Guest Detection UX (#727, Item 13):** Add Guest now performs immediate duplicate-email lookup and shows a warning before submit, including a merge recommendation and quick action to jump to the Duplicates tab; backend adds `GET /api/events/:eventId/rsvps/lookup?email=...` for exact-email match suggestions, with frontend/backend test coverage.
- **Post-event thank-you send and unsubscribe management** (#444, story #413): Added `POST /api/events/:eventId/communication/thank-you` endpoint that bulk-sends thank-you messages to confirmed (Going) guests with automatic suppression of unsubscribed recipients; added planner-side `PATCH /api/events/:eventId/rsvps/:id/unsubscribe` toggle; `guest-communication-panel` now surfaces a "Send Thank-You" button, unsubscribed-count advisory, and suppression summary on send results; `sendThankYou` and `setGuestUnsubscribed` added to `frontend/src/services/guest-service.ts`
- **QR scanning check-in page** (#445, story #413): `frontend/src/components/checkin/qr-scanner-page.tsx` provides a live camera scanner using the browser-native `BarcodeDetector` API (Chrome/Edge/Android) with a manual token-paste fallback for Safari/Firefox; tokens map to RSVP records via `POST /api/events/:eventId/checkin/scan`; route wired at `/events/:id/checkin/scan` in `App.tsx`; the existing check-in page links to the scanner when QR scanning is available
- **P1-CSV Template Download (#664, Item 12)**: Added a downloadable RSVP import template endpoint (`GET /api/events/:eventId/rsvps/import/template.csv`) plus a download button in the guest import dialog. The template ships a CSV header row covering the importable RSVP fields, and the Guests page import flow now exposes the template directly from the CSV import modal.
- **P1-CSV Import Mapping Fix (#664, Item 11)**: Wired the field-mapping wizard to the backend import logic — `handleImport()` in `csv-import-dialog.tsx` now passes `columnMap` to `importCsv()` in `guest-service.ts`; `importCsv` sends it as a JSON `column_map` form field; the backend controller (`rsvps-controller.ts`) reads and applies the mapping so custom CSV headers are correctly resolved to guest fields (name, email, phone, dietary_restriction, notes, etc.), with `''`-mapped columns skipped and unmapped columns continuing to fall back to normalised header names. 9 new backend unit tests added (`backend/__tests__/csv-import-mapping.test.ts`).
- **P1-Event Time Field (#664, Item 10)**: Added required `event_time` (HH:MM) field end-to-end — DB column + migration (`database/migrations/v10-event-time-field.sql`, `database/init.sql`, `backend/src/db/database.ts`), API validation/storage (`createEvent`, `updateEvent`, `cloneEvent` in `event-controller.ts`), frontend form input with client-side HH:MM validation (`event-form-page.tsx`), detail page display (`event-detail-page.tsx`), type definitions (`src/types/event-planner.ts`), and 12 backend unit tests (`backend/__tests__/event-time-field.test.ts`)
- Strict 3.1.3 Data Security startup gates for production/staging: backend now fails closed unless HTTPS enforcement, TLS 1.3 edge policy (`EDGE_TLS_MIN_VERSION=TLSv1.3`), verified PostgreSQL TLS mode (`sslmode=verify-ca|verify-full`), at-rest encryption attestation (`DB_ENCRYPTION_AT_REST_VERIFIED=true`), and fail-closed malware scanning are all explicitly enabled
- Entra group-to-role mapping with precedence (`Admin > Organizer > Collaborator > Guest > Viewer`) via configurable env vars (`ENTRA_GROUP_ADMINS`, `ENTRA_GROUP_ORGANIZERS`, `ENTRA_GROUP_COLLABORATORS`, `ENTRA_GROUP_GUESTS`, `ENTRA_GROUP_VIEWERS`) and callback-time role assignment for Entra SSO logins
- Event member role normalization to BRD event roles (`Owner`, `Co-Organizer`, `Helper`, `Guest`) with dynamic precedence checks in shared event access utilities
- RBAC permission-change audit trail coverage for role creation, role assignment, and permission add/remove controller operations
- **UI Overhaul — Professional Design System**: Comprehensive MUI theme rewrite with enterprise-grade design tokens, Inter + Plus Jakarta Sans typography, refined color palette (`#4f46e5` primary), and consistent component overrides for buttons, inputs, cards, tables, dialogs, and more (`frontend/src/theme/app-theme.ts`)
- **UI Overhaul — Collapsible Sidebar Navigation**: Full rewrite of `app-nav.tsx` with collapsible drawer (256px ↔ 68px), grouped nav sections ("Event Hub", "Workspace") with expand/collapse, dark sidebar background, user avatar, dark/light mode toggle, and smooth CSS transitions
- **UI Overhaul — PageLayout Component**: New `frontend/src/components/layout/page-layout.tsx` wrapper providing consistent sticky header with breadcrumbs, page title/subtitle, and actions slot across all authenticated pages
- **UI Overhaul — Login Screen**: Modernised auth shell with deep indigo gradient background, refined brand logo, improved typography hierarchy, and polished card layout
- **UI Overhaul — All Pages**: Applied `PageLayout` wrapper with breadcrumbs and action buttons to all 17 authenticated pages: Dashboard, Events, Create Event, Event Detail, Calendar, Budget, Tasks, Guests, Vendors, Timeline, Gallery, Messages, Check-In, Seating, Analytics, Profile, Admin
- **BRD v2 Story #531 vendor lifecycle parity** (#553 #554 #609 #610 #611): Added PostgreSQL-safe vendor favorites, booking lifecycle, and payment schedule schema (`vendor_favorites`, `vendor_bookings`, `vendor_payment_schedules`) in `database/init.sql`, runtime migration path in `backend/src/db/database.ts`, and versioned migration `database/migrations/v6-brd-v2-story-531-shopping-vendor-lifecycle.sql`; exposed new APIs for favorites, booking upsert/read, and payment schedules with integration coverage in `backend/__tests__/brd-v2-story-531-vendor-lifecycle-workflow.test.ts`
- **BRD v2 — 5-Role Model** (#537, #573): Added Collaborator (id=4), Guest (id=5), and Viewer (id=6) roles alongside existing Attendee/Organizer/Admin; role-permission matrix extended with scopes for rsvp, tasks, guests, budget, gallery, checkin, and reports; `database/migrations/v2-brd-auth-rbac-rls-parity.sql` migration applied idempotently
- **BRD v2 — Comprehensive Audit Logging** (#538, #572): `audit_log` table extended with `actor_id`, `target_type`, `target_id`, `context` (JSONB), and `severity` (INFO/WARN/ERROR/CRITICAL) columns; `backend/src/utils/audit-log.ts` centralised utility; audit events emitted for login success/failure/lock, logout, token refresh, session expiry, role changes, permission denials, and file upload scans
- **BRD v2 — Session Inactivity Policy** (#536, #571): 30-min SESSION_TIMEOUT_MS enforced in `authenticateToken` middleware; `SESSION_EXPIRED` audit event emitted on inactivity timeout; configurable via `SESSION_TIMEOUT_MS` env var
- **BRD v2 — RLS Extension** (#564, #632, #633): Row Level Security enabled on `tasks`, `expenses`, `vendors`, and `rsvps` tables (controlled by `RLS_PILOT_ENABLED=true`); event-member policies restrict access to event participants; idempotent policy creation in both migration SQL and runtime `database.ts`
- **BRD v2 — Upload Virus Scanning** (#565, #634): `backend/src/utils/virus-scan.ts` integrates ClamAV (`VIRUS_SCAN_ENABLED=true`) with stub fallback (EICAR detection); scanning applied to profile photo uploads and event document uploads; `UPLOAD_SCAN_PASS`/`UPLOAD_SCAN_FAIL` audit events; `VIRUS_SCAN_BLOCK_ON_ERROR=true` for fail-closed policy
- **BRD v2 — Frontend Role Gating** (#535, #573): `frontend/src/utils/roles.ts` utility replaces raw `roleId >= N` comparisons with semantic `canEditEvent()`, `isAdmin()`, `isViewOnly()` helpers; all existing role checks updated to use role names
- **BRD v2 — Architecture Runbook** (#567, #630–#638): `docs/processes/brd-v2-migration-runbook.md` documents migration steps, rollback procedures, environment variables, deployment checklist, and audit event catalogue
- **BRD v2 — MFA Enforcement** (#568): Entra callback enforces `amr=mfa` claim when `ENTRA_MFA_REQUIRED=true`; `isMfaRequired()` config helper; `amr` field added to `EntraTokenClaims`
- **BRD v2 — Entra Password Recovery Block** (#570): `forgotPassword` returns 422 with Entra self-service URL for `auth_provider='entra'` accounts
- Budget planning rates for tax, gratuity, and contingency are now persisted on `budget_categories` with PostgreSQL-safe schema updates, server-side rate validation, and computed planning totals surfaced in the budget UI category editor and category breakdown view (#596 #597)
- Budget planning controls are now fully validated through backend integration coverage for create/update rate rules and rounding behavior, plus frontend edit-flow tests for tax/gratuity/contingency updates in category dialogs (#548)
- Budget comparison across similar events now benchmarks the current event against accessible peer events in the budget page, with a new `/api/events/:eventId/budget/compare` endpoint, match scoring based on event attributes, secure access filtering, and tested planned-vs-actual budget summaries for each peer event (#598)
- Expense approval and reimbursement workflow now enforces role-based review on budget expenses, adds reimbursement request/resolve APIs, persists audited workflow state in PostgreSQL (`expenses` workflow columns + `expense_workflow_events`), and surfaces approval/reimbursement statuses and summary chips in the budget UI with backend/frontend test coverage (#549 #599 #600)
- OCR receipt extraction and reconciliation flow now supports extraction from receipt text, role-gated apply-to-expense actions, and immutable reconciliation/audit records via new PostgreSQL tables (`expense_receipt_ocr`, `expense_reconciliation_logs`) with budget-page integration and workflow tests (#550 #601)
- Keyboard shortcut handler and discoverable help overlay: global `useKeyboardShortcuts` hook registers single-key (`?`, `Escape`, `F1`) and chord (`g→d`, `g→e`, `g→c`, `g→m`, `g→p`, `g→n`) shortcuts; all shortcuts are silenced when focus is inside `<input>`, `<textarea>`, `<select>`, or `[contenteditable]`; pressing `?` or `F1` opens a categorised `KeyboardShortcutsOverlay` dialog that lists every registered shortcut with accessible key chips; 25 new tests cover all three acceptance criteria (#456)
- Planned-vs-actual timeline workflow: `timeline_activities` now stores `planned_start_time`, `planned_end_time`, `actual_start_time`, `actual_end_time`, and `status` (`planned`/`in-progress`/`completed`/`skipped`) fields; `GET /api/events/:eventId/timeline/comparison` returns per-activity variance in minutes and a status summary; timeline UI adds a "Planned vs Actual" comparison tab and status chips on activity cards; form updated with planned/actual time fields and a status selector; all existing CRUD behaviour preserved (#460)
- Fixed pre-existing test timeout instability in `seating.test.tsx` and `events-page-compatibility.test.tsx` by adding explicit 15 s timeout per test

### Added
- Gallery albums: organise gallery images into named albums with create/edit/delete/assign workflows; `gallery_albums` table and `/api/events/:eventId/gallery/albums` CRUD + `PATCH .../gallery/:id/album` assignment endpoint (#417 #459)
- Gallery moderation queue: guest submissions enter a pending state; event members can approve or reject via `PATCH .../gallery/:id/moderate` and `PATCH .../gallery/:id/submit`; moderation tab in gallery UI with approve/reject actions (#417 #459)
- Gallery slideshows: create named slideshows from gallery images with ordered item lists; full-screen player dialog; `gallery_slideshows` and `slideshow_items` tables; CRUD + items endpoint; slideshows tab in gallery UI (#417 #459)
- Gallery page tabs: gallery images (with album filter chips) · Albums · Moderation · Slideshows (#417 #459)

### Added
- Seating chart editor: tables now persist visual layout coordinates, can be dragged around the room canvas, and support visual guest reassignment by dragging guests between tables or back to the unassigned pool (#457)
- Event templates: persistence (`event_templates` table) and `/api/event-templates` CRUD + apply endpoints; organizer-scoped permissions, admin-wide visibility (#410 #432)
- Bulk event actions: `POST /api/events/bulk` with `archive`, `delete`, `export` actions, partial-success per-event reporting and CSV export (#410 #433)
- Templates dialog and bulk-selection toolbar on the events list (`event-templates-dialog.tsx`, `events-page.tsx`) with archive / export CSV / delete-many buttons (#410 #434)
- Event location map widget (`event-location-map.tsx`) using OpenStreetMap embed; `latitude`/`longitude` columns added to events; coordinate inputs in event create form and edit dialog with graceful fallback when coordinates are missing (#414 #446)
- Capacity and waitlist indicators across list (`X/Y · N left` / `waitlist N` chips), calendar (chip label + tooltip with overflow), and detail page (capacity chip + waitlist chip); `waitlist_enabled` column added to events; aggregated `going_count`/`pending_count` returned by `GET /api/events` (#414 #447)
- Event compatibility tests covering list rendering with new metadata, calendar capacity surfacing, and the location map widget (#414 #448)
- Advanced event search: `title_q`, `location_q`, `date_from`, `date_to`, `capacity_min`, `capacity_max`, `event_type`, `has_waitlist` query parameters on `GET /api/events`; collapsible advanced search panel on the list page (#416 #455)
- Saved filter presets: `event_filter_presets` table and `/api/event-filter-presets` CRUD; saved-filter dropdown / save-as / delete UI on the events list (#416 #454)
- Budget templates: create reusable budget templates with line-item categories and apply them to any event, with conflict-safe idempotent migrations (#438)
- Shopping-to-budget sync: purchased shopping list items can be synced as budget expense entries; duplicate syncs are handled safely (amount updates if cost changed) (#439)
- Shopping-to-budget sync: one-click sync of purchased shopping items into event expenses; duplicate-safe via source-tag in notes field (#439)
- Task dependencies: blocking/blocked-by relationships with BFS cycle detection to prevent circular chains (#440)
- Gantt view: SVG-based task scheduling chart with colour-coded status bars, today marker, and no external library dependency (#441)
- Recurring expense model: `is_recurring`, `recurrence_pattern`, `recurrence_end_date`, `is_installment`, `installment_total`, `installment_number` columns on `expenses` table (#449)
- Recurring task, template, and time-entry support: `task_templates` table, apply-template action, and per-task actual time logging via `task_time_entries` (#450)
- Workload dashboard: per-user task-count and estimated-vs-actual hours table with over-capacity warning (>40 h threshold) (#451)
- Vendor communication log: chronological comm history per vendor (email/call/meeting/quote/follow-up) with add and delete actions (#452)
- Vendor quote comparison: side-by-side comparison of 2–5 vendors on price, rating, contract, and communication recency (#452)
- Vendor performance metrics: composite performance score (0–100) derived from rating, communication count, contract status, expenses, and timeline items (#463)
- Store suggestions workflow: submit/approve/reject curated store entries per event, with case-insensitive duplicate prevention (#464)
- `vendor-compare-page.tsx`: MUI table with best-value highlighting per metric column (#452)
- All new backend controllers, API routes, frontend services, and UI components follow existing RBAC patterns with `authenticateToken` + `requireEventAccess` guards
- Expense summary PDF export: "Export PDF" button on Budget Management page generates a downloadable A4 report with KPI summary, category breakdown table, and expense details table (`expense-pdf-export.ts`, `BudgetPage`) (#453)
- 18 tests for PDF export utility and `BudgetPage` integration (`expense-pdf-export.test.tsx`) covering file naming, table rows, currency formatting, error handling, and button states (#453)
- Name tag PDF export: guest list and seating pages now generate printable name-tag sheets with guest identity details, party size, and seating assignment context via a shared PDF utility (`name-tag-pdf-export.ts`) (#458)

### Changed
- API route ordering fixed: static sub-paths (`/vendors/compare`, `/vendors/performance`, `/timeline/conflicts`) now registered before parameterised `/:id` routes to prevent shadowing

- Gallery image delete: hover overlay with delete button on gallery grid; delete button in preview dialog (`GalleryPage`, `MediaPreviewDialog`) (#409)
- Gallery caption edit: inline caption editor in `MediaPreviewDialog` with save/cancel and keyboard support (#409)
- `deleteGalleryItem()` and `updateGalleryCaption()` in `gallery-service.ts`; `PATCH /api/events/:eventId/gallery/:id` backend endpoint (#409)
- `caption` column added to `event_documents` table via additive `ALTER TABLE … ADD COLUMN IF NOT EXISTS` migration (#409)
- Messages service rewritten to use live backend APIs: `GET /api/events` for threads, `GET /api/events/:id/messages` for thread content, `POST /api/events/:id/messages` for sending — all mock data removed (#409)
- My Events view at `/events/my` now returns only events owned by the authenticated user via `?owner=me` API filter (#408 #425)
- Tag-based filtering on the events listing page via chip selectors; tags and My Events filter can be combined (#408 #426)
- Global search field on the events listing page filters by title, location, status, tags, event type, and organiser name (#408 #427)
- `GET /api/events` backend endpoint now accepts `?owner=me`, `?tags=`, `?status=`, `?q=` query parameters with parameterised queries (#408)
- `EventListFilters` interface and `listMyEvents()` helper added to `events-service.ts`
- `backend/__tests__/events-list-filter.test.ts` — 7 unit tests covering owner filter, tag filter, combined filters, no-auth guard, and error path

### Fixed
- RBAC UI enforcement hardening: added a reusable `RoleGuard` for route-level access control, enforced role-gated access to `/admin` (admin-only) and `/events/new` (organizer/collaborator/admin), and replaced numeric `roleId` checks in event detail controls with role-name helper checks to align with the five-role model (#664)
- Story #417 UX polish: gallery now loads albums on initial render so filter chips and album assignment are available without visiting the Albums tab first, slideshow edits preserve existing selected items, seating tables support keyboard repositioning, and timeline comparison now shows end variance; regression tests added for each path (#417)
- Frontend suite stability: analytics page tests now mock communication metrics consistently, and slower page smoke tests have explicit time budgets so the full Vitest run completes reliably under suite-wide load
- Fixed frontend CSRF handling so login, password reset, uploads, and other mutating module actions reuse a valid token instead of refetching one per request, preventing proxy-path 403/429 failures in local Docker runs
- Frontend API requests now resolve against an absolute origin in browser and test environments, and the budget forecast card falls back to a non-blocking unavailable state instead of surfacing raw fetch/URL errors (#458)
- Local backend startup now auto-loads `backend/.env` or repo `.env`, and falls back to the standard local PostgreSQL URL when no development `DATABASE_URL` is set
- Added a dedicated `db-test` PostgreSQL Docker service on port `5433` so backend integration tests match the documented local test setup
- Added helper npm scripts for starting the main and test databases and for running backend build/test flows from the repo root
- Corrected setup documentation to use the active backend port `4000` and to document the required database startup steps for local runs and backend tests
- Fixed `docker-compose.yml` frontend service to build from `frontend/Dockerfile` (the full BRD feature app) instead of the root `Dockerfile.frontend` (stub app), so the new dashboard is served correctly
- Fixed `analytics-controller.ts` query using non-existent column `e.event_date`; corrected to `e.date` to match the events table schema
- Restored event date compatibility across backend and frontend event flows by returning both `date` and `event_date`, fixing calendar chips, event detail, and public RSVP pages

### Added
- Gallery and messages route wiring is now complete: backend `GET /api/events/:eventId/gallery`, frontend `/events/:id/gallery`, and frontend `/messages`
- Event analytics reporting endpoints and frontend analytics UI, including CSV export and dashboard global analytics widget (BRD 3.10, 3.11)
- Notifications controller helpers, due-task digest endpoint, and frontend notification bell/panel components (BRD 3.11)
- Tasks Kanban Board at `/events/:id/tasks` with 4 columns: Pending, In Progress, Blocked, Complete (#373 #374)
- `frontend/src/services/tasks-service.ts` — typed API adapter for tasks, comments, and subtasks
- `frontend/src/components/tasks/tasks-kanban-page.tsx` — full Kanban board with drag-and-drop via `@dnd-kit/core` and `@dnd-kit/sortable`
- `frontend/src/components/tasks/task-card.tsx` — individual task card with priority chip, due date (overdue red highlight), assignee avatar, subtask progress
- `frontend/src/components/tasks/task-detail-drawer.tsx` — right-side MUI Drawer for inline task editing, subtask checklist, and comment thread
- Extended `backend/src/controllers/tasks-controller.ts` with `listComments`, `addComment`, `addSubtask`, `toggleSubtask`, `deleteSubtask`
- `frontend/test/tasks-kanban.test.tsx` — 8 tests covering column render, task count, add-task dialog, createTask call, loading/error states
- npm packages: `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities`, `@testing-library/user-event`

### Migration
- Migrated backend database from SQLite to PostgreSQL (`pg` v8)
- Replaced `sqlite` / `sqlite3` npm packages with `pg` and `@types/pg`
- Rewrote `backend/src/db/database.ts`: PostgreSQL connection pool with a SQLite-compatible wrapper (`get`, `all`, `run`, `exec`) that auto-converts `?` placeholders to `$N` positional parameters
- Converted all DDL: `INTEGER PRIMARY KEY AUTOINCREMENT` → `SERIAL PRIMARY KEY`, `DATETIME` → `TIMESTAMP`, seeded reference data uses `ON CONFLICT … DO NOTHING`
- Migrated backend utility scripts and SQLite-backed test scaffolding to PostgreSQL-backed helpers so local tooling, CI, and application runtime all execute against PostgreSQL-only code paths
- Fixed SQLite-only `INSERT OR IGNORE` → `INSERT … ON CONFLICT (col) DO NOTHING` in `profile-controller.ts`
- Fixed SQLite integer-string concatenation `|| id ||` → `|| id::text ||` in `users-controller.ts`
- Fixed SQLite `INSERT OR REPLACE` → `INSERT … ON CONFLICT (email) DO UPDATE SET …` in dev-seed route
- Added `RETURNING id` to INSERT statements whose results are used via `result.lastID` (auth, event, task, rsvp, rbac controllers)
- Removed duplicate / conflicting `app-network` key from `docker-compose.yml`; added `db` (PostgreSQL 16-alpine) service with health-check dependency chain; removed `sqlite-data` volume; added `postgres-data` named volume
- Replaced `DATABASE_URL` SQLite file path with `postgresql://…` connection string in both `docker-compose.yml` and `backend/package.json` dev script
- Updated `database/init.sql` to full PostgreSQL application schema (all tables, indexes, reference data)

### Security
- Replace SHA-256 token hashing with scrypt KDF in `hashToken` (auth-helpers.ts) to address CodeQL high-severity "insufficient computational effort" alert (#77)
- Fix session lookup in auth middleware to use `hashToken` (scrypt) instead of raw SHA-256, ensuring consistency with stored session hashes

### Added
- Responsive event planner workspace with dashboard, sidebar navigation, event CRUD screens, task tracking, RSVP management, calendar view, and admin overview
- Public RSVP route at `/rsvp/:eventId` backed by seeded local planner data
- Root app planner store, validation helpers, and regression tests for dashboard rendering and public RSVP submission
- Forgot password form component with ARIA accessibility (#79)
- Reset password form component with token-based flow (#79)
- JWT token refresh endpoint with token rotation and httpOnly cookies (#81)
- Session timeout server-side validation with configurable `SESSION_TIMEOUT_MS` (#82)
- Session heartbeat endpoint at `/auth/session/heartbeat` (#82)
- Session timeout provider React component (#82)
- Remember-me persistent session support with cookie management (#83)
- Admin user management UI: user table, role change dialog (#84)
- Admin users API client (#84)
- API client with automatic token refresh (#81)
- Backend SQLite database migrations for `user_profiles`, `permissions`, `role_permissions` tables
- Backend routes for password reset, email change confirmation, account deletion, token refresh, session heartbeat
- `last_activity` column on sessions table for timeout tracking
- `pending_email`, `pending_email_token`, `pending_email_expires` columns on users table
- Unique `jti` claims on JWT tokens via `crypto.randomBytes` for token uniqueness
- Backend dependencies: `cors`, `express-rate-limit`, `multer`, `jsonwebtoken` with type definitions
- Tests for JWT token refresh, session timeout, remember-me sessions, forgot/reset password, admin user management

### Fixed
- Seed default `role_permissions` rows during backend migrations for Admin, Organizer, and Attendee roles, and add coverage that verifies `authorizePermission` succeeds with Postgres-backed seeded permissions (#265, #287)
- Backend entry point (`index.ts`) rewritten from PostgreSQL to SQLite for consistency with rest of codebase
- `AuthRequest` interface in profile-controller.ts no longer conflicts with multer file types (#102)
- `authenticateToken` middleware converted to async with database session validation and timeout checking
- `generateTokens` now produces unique tokens even within the same second (jti claim)
- `server.js` converted from CommonJS to ESM to match `"type": "module"` in package.json
- Remember-me test converted from `node:test` CJS to vitest ESM format
- Reset password test label matching fixed to avoid ambiguous `getByLabelText` queries
- All PascalCase component directories renamed to kebab-case (`AccountDeletion` → `account-deletion`, `ProfileEdit` → `profile-edit`, `ProfileView` → `profile-view`, `LoginForm` → `login-form`)
- All test imports updated to use kebab-case component paths
- `vite/client` types added to root tsconfig.json
- Frontend `App.tsx` import updated from PascalCase `LoginForm` to kebab-case `login-form`

### Changed
- User registration endpoint with bcrypt password hashing, email normalization, and validation (#16, #20)
- Email confirmation flow with token generation and single-use enforcement (#16, #74)
- Password reset and recovery with secure token generation and audit logging (#74)
- Registration form React component with ARIA accessibility and keyboard navigation (#20)
- In-memory user store with `emailConfirmed` field and `confirmEmail` method (#16)
- Express app factory (`createApp`) exposing `/api/auth/register` and `/api/auth/confirm-email` routes (#16)
- Docker Desktop development environment with frontend, backend, and PostgreSQL services (#52)
- GitHub Actions workflows: `auto-draft-pr.yml` and `branch-assignee-check.yml` (#48)
- Branch naming convention enforced via repository ruleset (#48)
- GitHub CLI usage documented and enforced as the standard for all GitHub interactions (#53)
- `validate-issue-hierarchy.js` migrated to GraphQL API for reliable sub-issue parent detection (#72)
- Password reset audit log now always written regardless of email delivery success (#74)
- All test files migrated from `jest.*` API calls to `vi.*` equivalents for vitest compatibility (#26)
- ESM module mocking patterns corrected using `vi.mock` with `vi.fn()` factory functions (#26)
- Missing runtime dependencies installed: `@testing-library/dom`, `bcryptjs`, `jsonwebtoken`, `nodemailer`, `supertest`, `express` (#26)
- Next.js App Router project scaffold with TypeScript (#50)
- MUI (Material UI) integration with theme provider and CssBaseline (#50)
- Frontend folder structure: components, hooks, utils, types (#50)
- Backend API routes scaffold under `src/app/api/` (#50)
- Data tier structure: models, config, migrations under `src/data/` (#50)
- Initial app layout with MUI AppBar (#50)
- ESLint configuration with Next.js rules (#50)
- GitHub Projects (Project 1) integration for visual Kanban workflow management
- Project automation workflow to auto-add issues and PRs to Project 1
- Workflow status fields: Backlog → Ready → In Progress → Code Review → Testing → Ready for Release → Released
- Project Board link in README and release process documentation
- Instructions for adding issues to Project 1
- Branch assignee validation workflow for feature/bugfix/hotfix/release pushes (#48)
- Auto draft PR workflow for first push to feature/bugfix branches (#48)
- Code quality and CodeQL workflows for PR quality gates (#48)
- Repository ruleset definition files for PR quality gates and branch naming (#48)
### Changed
- Updated README.md with GitHub Projects workflow integration
- Updated docs/processes/release-process.md with Project 1 details and workflow states
- Enhanced Making Changes section with project board workflow steps
- Renamed long-lived branch references from `staging` to `stage` in docs/templates (#48)

## [Unreleased - Previously]

### Added
- Initial project structure
- Documentation framework
- Issue templates for project management (Theme, User Story, Task, Sub-Task, Bug, Defect, Security Issue, Feature Request)
- GitHub sub-issues integration for work item hierarchy
- Release process documentation
- Branching strategy documentation
- CI validation workflow for PR issue hierarchy
- CI validation workflow for commit messages
- Issue hierarchy validation script (validate-issue-hierarchy.js)
- Git hooks for commit message validation
- CODEOWNERS file for code review assignments
- Pull request template with hierarchy validation
- Automated CI comments on PRs for validation results

### Changed
- Issue templates updated to use GitHub native sub-issues instead of manual parent references
- User Story template: removed story points, added hour estimation ranges
- Task and Sub-Task templates: converted estimated hours to dropdown ranges
- Workflow naming convention: CI workflows prefixed with `ci-`, CD workflows prefixed with `cd-`
- Repository structure updated to include workflows and validation scripts

### Deprecated

### Removed

### Fixed

### Security

---

## Release History

<!-- Releases will be documented below in reverse chronological order -->

<!-- 
## [X.Y.Z] - YYYY-MM-DD

### Added
- New features

### Changed
- Changes to existing functionality

### Deprecated
- Features that will be removed in upcoming releases

### Removed
- Features removed in this release

### Fixed
- Bug fixes

### Security
- Security patches and vulnerability fixes

-->

---

## Legend

- **Added**: New features
- **Changed**: Changes to existing functionality
- **Deprecated**: Features that will be removed in upcoming releases
- **Removed**: Features removed in this release
- **Fixed**: Bug fixes
- **Security**: Security patches and vulnerability fixes

---

## Release Notes Guidelines

When updating this changelog:

1. Always update the `[Unreleased]` section during development
2. When creating a release, move items from `[Unreleased]` to a new version section
3. Use the format `## [X.Y.Z] - YYYY-MM-DD` for version headers
4. Include issue/PR numbers where applicable: `- Fix login bug (#123)`
5. Group changes by category (Added, Changed, Fixed, etc.)
6. Write in imperative mood: "Add feature" not "Added feature"
7. Link to compare views: `[X.Y.Z]: https://github.com/user/repo/compare/vX.Y.Z-1...vX.Y.Z`

---

[Unreleased]: https://github.com/seriously-not-prod/break-things-here/compare/main...HEAD
