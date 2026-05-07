# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

> **⚠️ DISCLAIMER: This is a fake project for demonstration/testing purposes only.**
>
> **No feedback will be collected or worked on. Use at your own risk.**

## [Unreleased]

### Added
- Seating chart drag-and-drop editor: new "Chart Editor" tab on the Seating page lets planners drag unassigned guests onto table cards and drag assigned guests between tables; assignments persist via existing API (#457)
- `SeatingChartEditor` component (`seating-chart-editor.tsx`) built on `@dnd-kit/core` with `DragOverlay` ghost, capacity enforcement, and full ARIA labels (#457)
- 9 tests for `SeatingChartEditor` covering rendering, unassign button, delete table, error alert, empty states, drag aria-labels, and seat count labels (`seating-chart-editor.test.tsx`) (#457)
- Expense summary PDF export: "Export PDF" button on Budget Management page generates a downloadable A4 report with KPI summary, category breakdown table, and expense details table (`expense-pdf-export.ts`, `BudgetPage`) (#453)
- 18 tests for PDF export utility and `BudgetPage` integration (`expense-pdf-export.test.tsx`) covering file naming, table rows, currency formatting, error handling, and button states (#453)
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
- Fixed frontend CSRF handling so login, password reset, uploads, and other mutating module actions reuse a valid token instead of refetching one per request, preventing proxy-path 403/429 failures in local Docker runs
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
