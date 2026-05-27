# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

> **⚠️ DISCLAIMER: This is a fake project for demonstration/testing purposes only.**
>
> **No feedback will be collected or worked on. Use at your own risk.**

## [Unreleased]

### Added (Track E — AI Recommendation Phase Plan)

- **Story #955 — Generate Analytics Narrative Summaries**: Added `POST /api/ai/analytics-narrative` endpoint that fetches current and prior-period analytics metrics (RSVP counts/acceptance rate, task completion rate, budget utilisation) from the database and calls the AI model to produce a grounded narrative summary. Returns an `AnalyticsNarrativeResponse` with: `headline` (≤120 chars, references at least one concrete metric), `trendDirection` (`up`/`down`/`stable`), `summary` (1–3 sentence grounded narrative), `notableChanges` (max 5 metric-specific change statements), `suggestedActions` (max 3 actionable recommendations), `dataQuality` (`sufficient`/`sparse`), and `contextSummary` (`windowDays`, `currentPeriodGrounded`, `priorPeriodGrounded`) for traceability. Accepts optional `windowDays` parameter (1–90, default 7) for the prior-period comparison window and an optional `prompt` (max 500 chars) for organiser focus. Forces `dataQuality: 'sparse'` when total RSVPs < 5, total tasks < 3, and budget allocated = 0 — regardless of what the model returns. Grounding guarantee: system prompt strictly instructs the model not to invent metrics or draw unsupported conclusions; only metrics in the context are allowed. Applied prompt injection sanitisation (`sanitisePrompt`), system prompt hardening (`hardenSystemPrompt`), provider timeout (`withProviderTimeout`), output safety validation (`validateAiOutput`), per-user rate limiting, AI privacy controls, and AI request observability (`ai_request_logs`) consistently with prior AI stories. Added `parseAnalyticsNarrativeOutput` schema validator and `AnalyticsNarrativeSummarySchema` interface to `backend/src/lib/ai-schemas.ts` with typed `ParseResult<AnalyticsNarrativeSummarySchema>` — includes headline truncation (120 chars), notableChanges truncation (max 5), suggestedActions truncation (max 3), and safe enum defaults for unknown `trendDirection`/`dataQuality` values. Added route `POST /api/ai/analytics-narrative` (authenticated, `requireAiAccess`, `applyAiPrivacyControls`). Added frontend `frontend/src/services/analytics-narrative-service.ts` with typed `fetchAnalyticsNarrative()` service function. Added `frontend/src/components/analytics/analytics-narrative-panel.tsx` — a React component that renders the AI narrative inline in the analytics page with headline, trend direction icon and chip, summary text, notable changes list, suggested actions list, sparse-data warning chip, and a collapsible context footer. Integrated the panel into `frontend/src/components/analytics/analytics-page.tsx` below the KPI chips. Added `backend/__tests__/ai-analytics-narrative-story-955.test.ts` (28 tests) covering: input validation (400 for missing/zero/negative/float eventId; invalid windowDays range; oversized prompt), provider errors (503 none/partial Azure), entity not found (404), successful generation (all response fields, default windowDays, optional prompt inclusion in grounded message), sparse data override (dataQuality forced to sparse), prior period grounding flag, AI provider failure (502), and schema unit tests for `parseAnalyticsNarrativeOutput` (valid JSON, markdown fence stripping, missing required fields, invalid enum defaults, array truncation) (#955).

- **Story #954 — Add Timeline Conflict Resolution Suggestions**: Added `POST /api/ai/conflict-resolution` endpoint that fetches live timeline activity data for an event, runs deterministic conflict detection via the existing `timeline-conflict` service (`detectTimelineConflicts`), then calls the AI model with the grounded conflict data to produce advisory resolution suggestions. Returns a `ConflictResolutionResponse` with: `conflictCount` (server-side count from deterministic detection), `suggestions` array (each entry has `conflictId`, `activityAId`, `activityATitle`, `activityBId`, `activityBTitle`, `reason`, `suggestion`, `dependencyImpact`, `resourceImpact`, `alternativeSlots`), `summary`, `advisoryLabel` (must be surfaced in the UI), `raw` model output, and `contextSummary` (activityCount, groundedConflicts) for traceability. All suggestions are advisory-only — no changes are applied automatically. Hallucination prevention enforced by cross-validating all returned `activityAId`/`activityBId` values against the grounded set; fabricated IDs are silently dropped. Handles conflict-free events (returns empty suggestions array) without fabricating conflicts. Added `parseConflictResolutionOutput` schema validator to `backend/src/lib/ai-schemas.ts` with typed `ParseResult<ConflictResolutionOutputSchema>` including hallucination guard, fallback advisory label, and conflictId construction. Applied prompt injection sanitisation, system prompt hardening, provider timeout, output safety validation, per-user rate limiting, privacy filtering, and AI request observability consistently with prior AI workflow stories. Added route `POST /api/ai/conflict-resolution` (authenticated, `requireAiAccess`, `applyAiPrivacyControls`). Added frontend `frontend/src/services/timeline-conflict-resolution-service.ts` with typed `fetchConflictResolutionSuggestions()` service function. Added `frontend/src/components/timeline/conflict-resolution-panel.tsx` — a React component that renders one advisory suggestion card per detected conflict with expandable dependency/resource impact notes, alternative time slot chips, conflict reason chips, and a permanently-visible advisory disclaimer. Added `backend/__tests__/ai-conflict-resolution-story-954.test.ts` (25 tests) covering: input validation (400), provider errors (503), entity not found (404), rate limit (429), conflict-free inputs (empty suggestions), conflict-heavy inputs (grounded suggestions), hallucination prevention (fabricated activity IDs dropped), AI provider failure (502), advisory label always present, string eventId coercion, and schema unit tests for `parseConflictResolutionOutput` (#954).

- **Story #953 — Add Vendor Recommendation and Comparison Assistance**: Added `POST /api/ai/vendor-recommendation` endpoint that fetches live vendor records for an event (name, category, status, quoted amount, rating, contract file, communication count, last contact date) before calling the AI model to produce a ranked, scored advisory recommendation list. Returns a `VendorRecommendationResponse` with: `recommendations` array (each entry has `vendorId`, `vendorName`, `rank`, `score` 0–100, `rationale`, `strengths`, `concerns`), `summary`, `advisoryLabel` (must be surfaced in the UI), `raw` model output, and `contextSummary` (groundedFields, vendorCount) for traceability. Hallucination prevention is enforced by cross-validating all returned `vendorId` values against the grounded set fetched from the database — any fabricated vendor ID is silently dropped before the response is returned. The AI system prompt strictly forbids inventing vendor facts; scoring is grounded in rating (40%), quoted amount (30%), contract on file (15%), and communication engagement (15%). Added `parseVendorRecommendationOutput` schema validator to `backend/src/lib/ai-schemas.ts` with typed `ParseResult<VendorRecommendationOutputSchema>` including hallucination guard, score clamping (0–100), rank-ascending sort, and advisory-label fallback. Applied prompt injection sanitisation (`sanitisePrompt`), system prompt hardening (`hardenSystemPrompt`), provider timeout (`withProviderTimeout`), output safety validation (`validateAiOutput`), per-user rate limiting, and AI request observability (`ai_request_logs`) consistently with prior AI workflow stories. Added frontend `frontend/src/services/vendor-ai-recommendation-service.ts` with typed `fetchVendorRecommendation()` service function. Added `frontend/src/components/vendors/vendor-ai-recommendation-panel.tsx` — a React component that renders ranked vendor cards with score bars, rationale, strengths/concerns chips, and a permanently-visible advisory disclaimer. Integrated the panel into `vendor-compare-page.tsx` below the comparison table. Added route `POST /api/ai/vendor-recommendation` (authenticated, `requireAiAccess`, `applyAiPrivacyControls`). Added `backend/__tests__/ai-vendor-recommendation-story-953.test.ts` (22 tests) covering: input validation (400), provider errors (503), entity not found (404), no vendors (422), successful ranked output, hallucination prevention (IDs not in grounded set dropped), AI provider failure (502), rate limit (429), and schema unit tests for `parseVendorRecommendationOutput` (#953).

- **Story #967 — Define Phase Plan for Advanced AI Recommendations and ML Insights**: Created `docs/ai-recommendation-phase-plan.md` — a comprehensive, structured rollout plan for post-MVP AI recommendation capabilities. Defines the MVP boundary (Phase 0, issues #945–#966 delivered), three post-MVP phases (Phase 1: Extended Contextual Recommendations; Phase 2: Data-Driven Analytics; Phase 3: Automated Surfaces and Agent Orchestration), and all out-of-scope items from `REQUIREMENTS_BASELINE.md §6.3` and `ai-requirement-baseline.md §2.2`. Documents entry/exit criteria, dependency mapping, recommendation categories and use-cases, technical architecture direction, feature gating strategy (environment-variable flags), risk assessments per phase, privacy/security controls (permanent and phase-specific), observability and governance requirements, success metrics and validation strategy, integration points with existing AI workflows, technical debt items, ownership boundaries, and future scalability considerations. Establishes the human-in-the-loop invariant as a permanent constraint across all phases. Aligned with existing AI safety (`ai-safety.ts`), privacy (`ai-privacy.ts`, `ai-privacy-middleware.ts`), RBAC (`ai-rbac.ts`), and schema (`ai-schemas.ts`) infrastructure delivered in Phase 0 (#967).

### Added (Track E — AI Requirement Traceability)

- **Story #957 — AI Data Privacy and PII Minimization**: Added `backend/src/lib/ai-privacy.ts` — a reusable privacy utility module providing: a four-tier data sensitivity taxonomy (PUBLIC → INTERNAL → SENSITIVE → RESTRICTED) with a field-classification catalogue of 60+ known AI-bound fields; `redactPii()` that detects and replaces 9 PII categories (EMAIL, PHONE, SSN, CREDIT_CARD, IP_ADDRESS, DATE_OF_BIRTH, PASSPORT, ADDRESS, NATIONAL_ID) in free-text strings using regex patterns; `filterProviderPayload()` that excludes RESTRICTED fields entirely and redacts SENSITIVE fields from structured context objects before provider serialisation; `sanitiseForLog()` for PII-safe telemetry strings; `buildSafeLogContext()` for safe JSON serialisation of context objects; and `logAiPrivacyEvent()` for best-effort audit persistence to the new `ai_privacy_events` table. Added `backend/src/middleware/ai-privacy-middleware.ts` — Express middleware `applyAiPrivacyControls` that scans prompt fields for PII, blocks requests containing RESTRICTED categories (SSN, credit-card, passport) with a 400 response, redacts non-blocking PII (email, phone, IP, address) in-place so downstream handlers always receive clean text, and logs every privacy event for compliance audit. Applied `applyAiPrivacyControls` to all four AI routes (`POST /api/ai/suggest`, `/api/ai/grounded`, `/api/ai/task-breakdown`, `/api/ai/budget-insight`). Updated `sanitisePrompt()` in `ai-controller.ts` to apply a second PII-minimisation pass (via `redactPii`) after the existing injection-sanitisation pass, and applied `filterProviderPayload()` to structured context objects in the grounded workflow before prompt construction. Added `database/migrations/v27-ai-privacy-pii-minimization-957.sql` — idempotent migration creating `ai_privacy_events` with per-user, time-range, and event-type indexes for compliance queries. Added `backend/__tests__/ai-privacy.test.ts` (37 tests) covering all functions: `classifyField` (5 tests), `redactPii` (13 tests), `sanitiseForLog` (3 tests), `filterProviderPayload` (9 tests), `buildSafeLogContext` (2 tests), and `logAiPrivacyEvent` (3 tests). All 37 tests pass (#957).

- **Issue #963 — Enforce Role-Based Access for AI Capabilities**: Added `backend/src/middleware/ai-rbac.ts` — a dedicated RBAC enforcement middleware for all AI endpoints. The `requireAiAccess` middleware checks the `ai.access` permission (backed by a DB look-up against `role_permissions`) and logs every access decision (`AI_ACCESS_GRANTED` / `AI_ACCESS_DENIED`) to the audit log with full context (path, method, roleId, requiredPermission). Added `database/migrations/v26-ai-rbac-permissions-963.sql` — idempotent migration that seeds the `ai.access` permission and grants it to Admin (id=3) and Organizer (id=2) roles only; Attendee, Guest, Viewer, and Collaborator roles do not receive AI access by default. Applied `requireAiAccess` to all four AI routes (`POST /api/ai/suggest`, `/api/ai/grounded`, `/api/ai/task-breakdown`, `/api/ai/budget-insight`). Added `AI_ACCESS_GRANTED` and `AI_ACCESS_DENIED` constants to `AUDIT_ACTIONS` in `backend/src/utils/audit-log.ts`. Updated frontend `ai-assistant.tsx` with a `resolveAiErrorMessage` helper that surfaces a clear "You do not have permission to use AI features. Contact your administrator." message on 403 responses across all four AI tabs. Added `backend/__tests__/ai-rbac.test.ts` (12 tests) covering unauthorized (401), permission-denied (403 + audit event), and authorized (200 + audit event) paths with context-field assertions (#963).

- **Story #964 — Introduce Structured AI Output Schemas**: Added `backend/src/lib/ai-schemas.ts` — a zero-dependency, pure-TypeScript schema validation module shared across all AI workflows. Exports a `ParseResult<T>` discriminated union (`{ ok: true; data: T; errors: [] }` | `{ ok: false; data: null; errors: SchemaValidationError[] }`) enabling typed, actionable validation errors with `field`, `message`, and `received` properties. Provides `parseEventSuggestion`, `parseTaskSuggestion`, `parseRsvpSuggestion`, `parseGeneralSuggestion`, `parseRsvpCommunicationDraft`, `parseBudgetInsightOutput`, and `parseTaskBreakdownOutput` parsers plus a `parseGroundedOutput` dispatcher and `formatValidationErrors` helper. All existing AI controller parsers (`parseStructuredOutput`, `parseTaskBreakdownOutput`, `parseBudgetInsightOutput`) now delegate to the shared module, preserving their `T | null` return signatures for backward compatibility. Added `backend/__tests__/ai-schemas.test.ts` (67 tests) covering all parsers, the dispatcher, error formatting, and the `ParseResult` type shape (#964).

- **Story #950 — Generate Task Breakdowns From Event Context**: Added `POST /api/ai/task-breakdown` endpoint that fetches live event context (title, type, dates, capacity, tags, and existing task list) before calling the AI model, grounding the generated breakdown in real planner data. Returns a `TaskBreakdownResponse` containing an array of `TaskBreakdownItem` objects — each with `title`, `owner` suggestion, `dueWindow`, `dependencies`, `priority` (`low/medium/high/urgent`), and `timelineConstraint` — plus `raw` model output and a `contextSummary` (groundedFields, totalExistingTasks) for traceability. Null/empty event fields are omitted from the grounded user message to reduce noise. Prompt injection sanitisation, per-user rate limiting, and AI request observability (ai_request_logs) are applied consistently with prior grounded workflow stories. Added "Task Plan" tab (Tab 2) to the AI Planning Assistant frontend panel with per-task Copy buttons and a Copy All Tasks action to support the manual copy/apply workflow. Added `backend/__tests__/ai-task-breakdown-story-950.test.ts` (21 tests) covering all four acceptance criteria: AC1 (required fields in each task), AC2 (predictable schema), AC3 (copy/apply output), AC4 (schema unit tests via `parseTaskBreakdownOutput`), plus input validation (400/404), rate limiting (429), provider errors (503), AI failures (502), and contextSummary traceability (#950).

- **Story #949 — Ground Event Assistant Responses in Live Event Data**: Extended the grounded event workflow (`POST /api/ai/grounded`) to fetch richer normalized event fields (`event_type`, `end_date`, `event_time`, `tags`, `location`) before calling the AI model. Null/empty fields are now omitted from the grounded prompt to reduce noise (AC2). Fixed a SQL bug where `venue_name` (non-existent column) was queried instead of `location AS venue_name`. Fixed RSVP statistics queries to use `canonical_status` (v21+ schema) instead of the legacy `status` column. Added `contextSummary.groundedFields` to the `POST /api/ai/grounded` response for traceability — callers can audit exactly which event fields were included in the prompt. Updated frontend `GroundedResponse` interface and event output card to display grounded fields. Added `backend/__tests__/ai-grounded-story-949.test.ts` (9 tests) covering all four acceptance criteria. Updated `docs/ai-capability.md` feature table (#949).

- **Story #948 — Define AI Requirement Baseline and Traceability**: Created `docs/requirements/ai-requirement-baseline.md` establishing a structured AI requirement baseline for the current Vite + React Router + Express + PostgreSQL stack. Documents 12 AI requirements (AI-REQ-001 through AI-REQ-012) with measurable acceptance criteria, implementation status classification (7 Implemented, 4 Partial, 0 Missing), and a full traceability matrix linking requirements to GitHub issues (#945, #946, #947, #925, #926, #908). Clarifies four previously ambiguous requirement statements including the distinction between the in-scope interactive AI Planning Assistant and the out-of-scope automated recommendations engine. Updated `docs/requirements/REQUIREMENTS_BASELINE.md` §6.3 to correct the AI out-of-scope entry and added §6.4 referencing the new AI baseline document (#948).

### Added (Track A — Core Data Model)

- **Task #810 — @mentions parser + notification fanout**: Added `backend/src/services/mentions/parse.ts` with a regex-based `parseMentions()` function supporting `@handle` and `@"Quoted Name"` syntax, email false-positive guards, and deduplication. Added `backend/src/services/mentions/fanout.ts` with `processMentions()` that resolves handles scoped to event members, persists rows in the new `message_mentions` table, and fans out in-app notifications respecting per-user `mention` preferences. Added migration `database/migrations/v18-message-mentions-810.sql` with audit columns, UNIQUE constraint, and a `CHECK` constraint on `source_type`. Integrated fanout into `event-chat-controller.ts` and `tasks-controller.ts`. Added `'mention'` to the allowed notification preference types in `notifications-controller.ts` and `NOTIFICATION_TYPES` in the frontend `collaboration-service.ts` (with labels in both preferences UI components) (#810).

- **Task #771 — Guests first-class table model**: Added migration `database/migrations/v24-guests-table-771.sql` to replace the legacy `guests` view with a real `guests` table, add `rsvps.guest_id` FK linkage, backfill guest records for existing RSVP rows, and enforce a no-orphan validation guard. Updated fresh schema bootstrap in `database/init.sql` and runtime migration runner in `backend/src/db/database.ts` with idempotent behavior. Added guest-record CRUD controller `backend/src/controllers/guests-controller.ts` and routes under `/api/events/:eventId/guest-records*`. Added architecture decision record `docs/architecture/guests-table-decision.md` and updated TRD baseline notes in `docs/requirements/REQUIREMENTS_BASELINE.md` (#771).

### Added (Track D — Quality & Testing)

- **Task #824 — Disaster Recovery runbook**: Created `docs/operations/dr-runbook.md` covering: detection signals and commands, on-call escalation matrix with timeline, RTO/RPO targets (1-hour RPO / 4-hour RTO for the database), step-by-step restore procedure (evidence preservation → recovery point selection → service shutdown → PITR restore → migration replay → file-upload restore → restart/verify), initial/update/resolution communications templates, and a post-incident review template. References `docs/operations/pitr.md` (Story 1 task 11) throughout. Linked from `README.md` (Database Documentation section) and `SECURITY.md` (new Incident Response & Disaster Recovery section). Review date 2026-05-20 (#824).

- **Task #823 — Fix the two failing public-RSVP frontend tests**: Confirmed the existing `submits a public rsvp without requiring login` test passes (the store's `mapApiEventToPlanner` correctly converts numeric API ids to `event-{id}` string keys matching the route param). Added the companion sibling test `shows inline validation errors when required fields are left empty on the public rsvp form` — submitting without Name or Email now asserts `Name is required.` and `Email is required.` are rendered inline and the success message does not appear. All 353 root-level tests pass; no `xit` or `skip` introduced (#823).

- **Task #822 — Pre-commit hook adoption verification + onboarding doc**: Confirmed `npm prepare` script in root `package.json` automatically sets `core.hooksPath` to `.githooks` on every `npm install`, enforcing the existing `lint-staged` pre-commit hook (prettier + eslint) for all contributors. Applied repository-wide prettier formatting to resolve 302 pre-existing style drift files. Added `npm run format:check` step to the `lint-and-typecheck` CI job as a defensive mirror of the pre-commit hook, preventing format regressions when hooks are bypassed. Created `docs/operations/local-dev.md` onboarding guide documenting hook installation, expected output, available scripts, CI/hook parity table, and troubleshooting. Updated `CONTRIBUTING.md` with a new Pre-commit Hooks section (#822).

- **Task #821 — Coverage gate + PR comment with delta**: Added `@vitest/coverage-v8` to `backend` and configured `coverage` block in `backend/vitest.config.ts` with `json-summary`, `lcov`, and `text` reporters plus threshold enforcement (lines 25%, branches 20%, functions 20%, statements 25% — matching the frontend regression-guard floor). Added `test:coverage` script to `backend/package.json`. Updated `.github/workflows/ci-unified.yml`: backend job now runs `npm run test:coverage` and uploads a 14-day `coverage-backend` artifact; new `coverage-comment` job (PR-only) downloads both frontend and backend coverage artifacts, fetches the base-branch coverage snapshots, and invokes `scripts/post-coverage-comment.js` to post (or update in-place) a Markdown delta table as a PR comment. Created `docs/operations/test-quality.md` documenting threshold policy, reporters, delta-comment workflow, and the procedure for raising thresholds (#821).

- **Task #820 — Frontend coverage ≥80% with CI enforcement**: Configured `@vitest/coverage-v8` in `frontend/vitest.config.ts` with threshold enforcement (lines 80%, branches 75%, functions 80%, statements 80%). Updated `.github/workflows/ci-unified.yml` to run `npm run test:coverage` in the frontend job — CI now fails when thresholds regress and archives the coverage report as a 14-day artifact. Added 38 net-new tests across three files targeting the lowest-covered components: `events-list-coverage.test.tsx` (events page rendering, permissions, views), `budget-coverage.test.tsx` (loading, errors, CRUD, comparison), `tasks-board-coverage.test.tsx` (kanban columns, priorities, assignees, task lifecycle) (#820).

### Added (Track C — Auth & Identity)

- **Task #785 — End-to-end Entra login flow Playwright test (mocked OIDC)**: Added `e2e/entra-auth.spec.ts` with five tests that drive the full Microsoft sign-in → Azure redirect → callback → dashboard flow using Playwright route interception as a mocked OIDC issuer. Added `e2e/fixtures/oidc-mock.ts` providing reusable `setupOidcMock()` helper with pre-configured test users and well-known group IDs for role-mapping assertions (Admin, Organizer, Viewer, no-groups default). Added `.github/workflows/e2e.yml` CI workflow that builds the frontend, starts a preview server, installs Playwright Chromium, and runs the e2e suite. No live Azure tenant required (#785).

### Documentation

- **Task #794 — Document TLS termination ownership**: Added `docs/security/tls.md` documenting where TLS terminates (reverse proxy / ingress), required cipher suites (TLS 1.3 only), certificate source and renewal procedure, HSTS policy values (`max-age=31536000; includeSubDomains; preload`), database TLS requirements, and on-call ownership matrix. Linked from `SECURITY.md` and `README.md`. HSTS header values verified to match Helmet configuration in `backend/src/index.ts` (#794).

- **Task #791 — Document Entra rollout matrix and local-fallback policy**: Added environment rollout matrix table to `docs/entra-auth-rollout.md` documenting Entra on/off, local-fallback on/off, and signing keys source for production, staging, development, and test tiers. Created operations runbook `docs/operations/entra-outage.md` with step-by-step procedure for temporarily enabling local-credential fallback during an Azure Entra ID outage, including verification, communication, and restoration steps. Added Security & Identity documentation section to README linking to the rollout matrix and outage runbook (#791).

### Added (Track B — Notifications)

- **Task #793 — Task reminder + escalation background job**: Added `backend/src/jobs/task-reminders.ts` with `sendTaskReminders()` and `escalateOverdueTasks()` functions. Reminders are sent at configurable offsets before due date (env `TASK_REMINDER_OFFSETS_HOURS`, defaults `24,2`) to all task assignees (multi-assignee via `task_assignees` with legacy `assigned_user_id` fallback). Overdue tasks (>24 h past due date, configurable via `TASK_ESCALATION_THRESHOLD_HOURS`) escalate to the event organizer or a custom target from `task_escalation_rules`. Both paths respect per-user notification preferences via `isChannelEnabled()` (`task_due` / `task_overdue` categories) and use the batched in-app notification helper plus email via `sendMail()`. De-duplication via `task_reminder_log` table (auto-created) prevents double sends. Job registered in `backend/src/utils/job-scheduler.ts` on a 30-minute interval. Integration tests in `backend/__tests__/task-reminders.test.ts` cover reminder windows, de-duplication, multi-assignee dispatch, preference suppression, escalation path with custom rules, and threshold enforcement (#793).

- **Task #792 — Configurable RSVP reminder cadence + dispatcher job**: Added `rsvp_reminder_offsets INTEGER[]` column to `events` (default `{14,7,1}`) and `last_reminder_sent_at TIMESTAMPTZ` column to `rsvps` via migration `v23-event-rsvp-reminder-offsets.sql`. Created `backend/src/jobs/rsvp-reminders.ts` with `processRsvpReminders()` dispatcher that scans active events with future RSVP deadlines and enqueues email reminders for unconfirmed RSVPs (pending/maybe) at each configured offset. Reminders respect per-user notification preferences via `isChannelEnabled()` (`event_reminder` category). Double-fire prevention uses `last_reminder_sent_at` stamping per offset window. Unsubscribed guests are automatically suppressed. Job registered in `backend/src/utils/job-scheduler.ts` on an hourly interval. Integration tests in `backend/__tests__/rsvp-reminders.test.ts` cover schedule resolution, idempotency, preference suppression, and edge cases (#792).

- **Task #786 — Notification preferences — backend model and endpoints**: Added normalised `notification_preferences` table with `(user_id, channel, category, enabled)` schema (migration `v22-notification-preferences-matrix.sql`), replacing the legacy per-type boolean columns. Migration seeds default-enabled rows for every existing user × channel × category combination. Added `GET /api/users/me/notification-preferences` returning the full channel × category matrix and `PATCH /api/users/me/notification-preferences` accepting bulk updates. Created `backend/src/services/notifications/dispatch-guard.ts` with `isChannelEnabled()` helper. Outbound dispatchers (`createBatchedNotification`, `createBudgetAlert`, `createRsvpNotification`, `createTaskDueAlert`) now consult the preference matrix before sending. Integration tests in `backend/__tests__/notification-preferences.test.ts` verify endpoints, validation, and dispatch suppression (#786).

### Added (Track C — Auth & Identity)

- **Task #790 — Entra-first login copy refresh for the four personas**: Added MFA help text below the "Sign in with Microsoft" CTA to set expectations for multi-factor authentication prompts. Forgot-password and create-account links are gated to local-fallback mode only. Added snapshot tests for Entra-on (entra-only), Entra-on (with fallback), and Entra-off (local-only) variants in `frontend/test/login-form.test.tsx`. Appended persona review note to `docs/entra-auth-rollout.md` mapping Sarah/Marcus/Emily/David FRD personas to the login copy changes (#790).

### Added (Track B — Database & Infrastructure)

- **Task #777 — PITR / WAL archiving configuration**: Implemented Point-in-Time Recovery (PITR) infrastructure fulfilling NFR §5.4 with 14-day retention. Added WAL archiving to `docker-compose.yml` with `archive_mode=on`, `wal_level=replica`, and custom `archive_command` pointing to `scripts/archive-wal.sh`. Created `wal-archive` Docker volume for archived WAL segments. Implemented `wal-archive-cleanup` service using cron to remove WAL files older than 14 days, maintaining automated retention policy. Added `scripts/restore-drill.sh` for documented recovery testing against throwaway database. Created comprehensive operations runbook at `docs/operations/pitr.md` covering architecture, configuration, recovery procedures, monitoring, troubleshooting, and maintenance schedule (#777).

- **Task #778 — N-day permanent purge for soft-deleted events**: Implemented background job in `backend/src/jobs/purge-deleted-events.ts` that permanently removes events where `archived_at < NOW() - INTERVAL 'retention'` (configurable via `PURGE_RETENTION_DAYS` env var, default 30 days). Job is registered in the scheduler at midnight UTC daily to run alongside GDPR data-retention purge. Supports dry-run mode (`PURGE_DRY_RUN=true`) for testing, logging intent without deleting. Every purge is recorded in `audit_log` with row count, deleted event IDs, retention window, and severity level. Events cascade-delete all related data (tasks, rsvps, galleries, schedules, etc.). Comprehensive test suite in `backend/__tests__/purge-deleted-events.test.ts` covers retention math, dry-run branch, cascade deletes, boundary conditions (exactly at cutoff), no-op when empty, and audit-log recording (#778).

- **Task #787 — Notification preferences profile UI tab**: Added `frontend/src/components/profile/notification-preferences-tab.tsx` — a new Material-UI tab on the profile page that renders a category × channel matrix for notification preferences (In-App, Email, Push). Uses React Hook Form + Zod for form state, optimistic toggle saves via PUT endpoint with rollback on failure, and full keyboard/aria-label accessibility. Converted the profile page from a flat form to a tabbed layout (General Info + Notifications). Added 9 component tests in `frontend/test/notification-preferences-tab.test.tsx` covering initial load, toggle save, error rollback, accessibility, and table rendering (#787).

- **Task #785 — End-to-end Entra login flow Playwright test (mocked OIDC)**: Added `e2e/entra-auth.spec.ts` with five tests that drive the full Microsoft sign-in → Azure redirect → callback → dashboard flow using Playwright route interception as a mocked OIDC issuer. Added `e2e/fixtures/oidc-mock.ts` providing reusable `setupOidcMock()` helper with pre-configured test users and well-known group IDs for role-mapping assertions (Admin, Organizer, Viewer, no-groups default). Added `.github/workflows/e2e.yml` CI workflow that builds the frontend, starts a preview server, installs Playwright Chromium, and runs the e2e suite. No live Azure tenant required (#785).

### Documentation

- **Task #775 — PostgREST runtime decision and contract cleanup**: Removed the unused `postgrest` service from `docker-compose.yml`, recorded the "remove" decision and freed port `3001` in `docs/postgrest-pilot.md`, and updated TRD references in `docs/requirements/REQUIREMENTS_BASELINE.md` to declare Express `/api` as the active API contract (#775).

- **Task #774 — SERIAL to UUID primary-key migration spike**: Added `docs/architecture/uuid-migration-spike.md` with migration option analysis (dual-column phased cutover vs in-place ALTER), data-migration script outline, FK rewrite plan, frontend type-change footprint, backward-compatibility risks, and effort estimates. Recorded decision in `docs/requirements/REQUIREMENTS_BASELINE.md` TRD section 4.2 to defer UUID cutover for the current cycle and ratify SERIAL/sequence-backed keys as the active baseline while tracking UUID migration as future phased work (#774).

### Fixed

- **Task #674 — AI assistant Azure OpenAI integration hardening**: Updated `backend/src/controllers/ai-controller.ts` to use Azure OpenAI as the primary provider (`AZURE_OPENAI_ENDPOINT`/`ENDPOINT`, `AZURE_OPENAI_API_KEY`/`API_KEY`, `AZURE_OPENAI_DEPLOYMENT`, `AZURE_OPENAI_API_VERSION`) with OpenAI fallback (`OPENAI_API_KEY`). Added explicit partial-config detection (clear `503` for missing Azure fields), preserved `/api/ai/suggest` contract, and added regression tests in `backend/__tests__/ai-controller.test.ts` for Azure path, fallback behavior, and not-configured responses.

- **Task #901 — Event creation + budget comparison stability fixes**: Added required `event_time` input/validation to the Events list modal create/edit flow (`frontend/src/components/events/events-page.tsx`) so API `POST /api/events` requests always include valid `HH:MM` values. Also fixed SQL placeholder compatibility in backend similar-budget comparison prefilter query (`backend/src/controllers/budget-controller.ts`) to prevent runtime failures that surfaced as `Failed to compare budget data across similar events` (#901).

- **Task #776 — Add `/api/health` TRD-compatible alias**: Backend now serves `GET /api/health` as an alias of `GET /health` using a shared handler so both endpoints always return identical payload and status. In-code OpenAPI definition now documents both routes, and smoke coverage in `backend/__tests__/health-endpoints.test.ts` asserts both endpoints return `200` and matching response bodies (#776).

### Added (Track E — Performance & Observability)

### Security

### Added (Track F — DevOps & Dependency Management)

- **Task #819 — Backend test stabilisation**: Fixed three categories of flaky/hanging backend tests. (1) `jwt-token-refresh` and `session-timeout`: added `audit_log` table to isolated test schemas so `logAuditEvent()` writes to the test schema instead of `public.audit_log`, eliminating FK violation noise on every test run. (2) `scheduled-reports-email`: migrated from `initializeDatabase()` (which ran all pending migrations and crashed on existing seed data violating a new constraint) to the isolated `createPostgresTestDatabase` pattern; retry tests now use `vi.useFakeTimers()` so backoff delays are instant (~15 ms vs ~3 s previously). (3) Added `communication-templates.test.ts` (18 tests) covering the previously-untested communication templates controller — full CRUD + personalization preview (#819).

- **Task #818 — Dependabot / Renovate setup**: Added `.github/dependabot.yml` enabling weekly automated dependency update PRs for npm (root, `/backend`, `/frontend`), GitHub Actions, and Docker base images. Non-breaking minor/patch dev-dependencies are grouped into a single PR per ecosystem. Security updates are automatically labelled `security-issue` and auto-merged (squash) once CI passes via `.github/workflows/dependabot-auto-merge.yml`. Operational runbook documented in `docs/operations/dependency-updates.md` (#818).

### Added (Track E — Performance & Observability)

- **Task #817 — Load-test suite (k6) + nightly + PR smoke gate**: Added comprehensive k6 load test scenarios in `tests/load/k6/` covering login, dashboard, RSVP submission, event create, and guest import endpoints. Full run uses 100 VUs for 5 minutes with p95 < 500 ms and error rate < 1% thresholds. Smoke variant (10 VU, 30s) runs on every PR via `.github/workflows/load-smoke.yml`. Full variant runs nightly at 02:00 UTC via `.github/workflows/load-nightly.yml` (also manually dispatchable). Baseline performance numbers documented in `tests/load/baseline.md` (#817).

### Fixed

- **Task #780 — Align task priority parity for `Urgent`**: Added migration `database/migrations/v23-task-priority-urgent-780.sql` and runtime/bootstrap schema updates so both `tasks.priority` and `task_templates.priority` accept `Urgent`. Backend task and task-template validation now allow the value, frontend task priority pickers now expose `Urgent` with a stronger visual treatment, and tests cover urgent-priority create/update flows (#780).
- **Issue #770 — Collapse dual RSVP status columns to single source of truth**: Consolidated `rsvps.status` (legacy) and `rsvps.canonical_status` (canonical) columns by dropping the legacy `status` column entirely. `canonical_status` is now the single source of truth with values `pending`, `confirmed`, `declined`, `maybe`, `waitlist`, `cancelled`, `checked_in`, `no_show`. All backend controllers updated to read/write canonical_status only; legacy status input is still accepted and mapped to canonical via `toCanonicalStatus()` for backward compatibility. Frontend types updated to use canonical_status instead of status. Database migration `v21-rsvp-status-collapse.sql` backfills any remaining NULL canonical_status values and drops the status column. All RSVP-related tests and seed data updated. Issue addresses data consistency issues where dual columns could diverge (#770).

### Added (Track D — Real-time)

- **Task #809 — Unified realtime SSE stream**: Introduced a multiplexed Server-Sent Events endpoint `GET /api/realtime/stream?topics=events,tasks,budgets,activity,presence` that fans out messages to subscribers for any combination of the five supported topics. Backed by an in-memory `RealtimeHub` singleton (`backend/src/services/realtime/hub.ts`) and a Postgres `LISTEN/NOTIFY` bridge (`backend/src/services/realtime/pg-bridge.ts`) that keeps multiple process replicas in sync. A heartbeat comment is sent every 30 s; the legacy `GET /api/events/:eventId/realtime/stream` remains fully back-compatible. Added `useRealtime()` React hook (`frontend/src/hooks/use-realtime.ts`) with automatic reconnect logic. Integration test covers subscribe → publish → receive → disconnect lifecycle (#809).
- **Task #811 — Online/offline user presence**: Added `user_presence` table (`database/migrations/v19-user-presence-811.sql`) tracking per-user online/idle/offline status via periodic heartbeats. New presence service (`backend/src/services/realtime/presence.ts`) maintains in-memory map with DB snapshots, computes idle (15 min) and offline (30 min) thresholds, and runs periodic sweeps. New controller endpoints: `POST /api/user-presence/heartbeat`, `DELETE /api/user-presence/leave`, `GET /api/user-presence/online`. SSE topic `presence` broadcasts `presence.join` and `presence.leave` diffs. Frontend `usePresenceHeartbeat` hook sends 30s heartbeats. `TeamPresenceList` component mounted in sidebar shows green/grey dots for online/idle team members (#811).
- **Task #812 — Custom report builder**: Added `builder_config JSONB` column to `scheduled_reports` and extended `report_type`/`frequency` constraints via `database/migrations/v20-report-builder-812.sql`. New `build-report` service (`backend/src/services/reports/build-report.ts`) executes safe allowlist-validated dynamic queries across five domains (events / guests / budget / tasks / vendors) supporting field selection, filter operators, group-by, and sort — no user strings ever interpolated into SQL. New `reports-builder-controller.ts` exposes `GET /api/reports/builder/domains`, `POST /api/events/:eventId/reports/builder/run` (JSON / CSV / XLSX output via ExcelJS), and `POST /api/events/:eventId/reports/builder/save`. Frontend builder at `frontend/src/components/reports/builder/` uses React Hook Form + Zod with `FieldSelector`, `FilterEditor`, and the full `ReportBuilderForm` page component with accessible ARIA labels. 25 integration tests covering all domains, filter operators, injection guards, and controller validations (#812).
- **Task #813 — PDF report renderer (server-side)**: Added `pdfkit` dependency and new PDF renderer service at `backend/src/services/reports/pdf.ts`. Supports three report types: guest list, budget summary, and expense detail. Each PDF includes event header (title, date, location), tabular data with zebra striping and pagination, a "Generated at" timestamp, and page-number footers on every page. Report metadata tracks page count, byte length, and generation timestamp. 18 unit tests verify section presence, metadata accuracy, and file size under 5 MB (#813).

### Added (Track C — Import/Export & Media)

- **FR-GUEST-002 (XLSX import)**: Guest import wizard now accepts `.xlsx` and `.xls` files in addition to CSV. SheetJS (`xlsx`) parses the first sheet server-side (RSVP controller) and client-side (import dialog preview). The multer filter and file-input `accept` attribute are updated to allow Excel MIME types (#2, #14).
- **FR-GUEST-002 (Download Failed Rows)**: After a guest import, any rows that were skipped or rejected (missing name/email, duplicate email, or DB error) are returned in the API response as `failedRows`. The import dialog shows a count alert with a "Download Failed Rows" button that exports a CSV containing the original data and failure reason (#3).
- **FR-RPT-002 (Analytics PDF/Excel export)**: The analytics page Export button is replaced with a split-button dropdown offering CSV (existing), PDF (via jsPDF + jspdf-autotable), and Excel (via SheetJS) exports. PDF includes KPI summary, budget breakdown, and task breakdown sections; Excel has four sheets (Summary, Budget, Tasks, Dietary) (#9).
- **FR-GALLERY-001 (HEIC MIME handling and multi-file upload)**: Gallery document upload now accepts `image/heic`, `image/heif`, and `application/octet-stream` with `.heic`/`.heif` extension (iOS sends octet-stream for HEIC). The effective MIME type is normalised to `image/heic` in the database. The multer handler is changed from `.single()` to `.array('document', 20)` and the controller iterates all uploaded files, scanning and persisting each. The frontend file input gains the `multiple` attribute and appends all selected files in one FormRequest. Partial-success (207) is returned when some files fail (#12).
- **FR-RPT-001 (Scheduled report email dispatch)**: The `dispatchScheduledReports` job scheduler now calls `renderPayload()` from the reports controller to build a structured JSON body for each due report, then dispatches it via `sendMail()` to every recipient. Per-recipient failures are logged without aborting the batch. Delivery attempts are recorded in `scheduled_report_deliveries` for audit. `renderPayload` is exported from `reports-controller.ts` to allow reuse without HTTP round-trips (#8).

### Fixed

- **Task #769 — audit-column sweep and trigger enforcement**: added `database/migrations/v17-audit-columns-sweep-769.sql` and `database/functions/set_audit_columns.sql` to guarantee every public table has `created_at`, `created_by`, `updated_at`, and `updated_by`; added generic `set_audit_columns()` trigger semantics for write-time actor/timestamp population from `app.current_user_id`; and mirrored the same v17 logic in `backend/src/db/database.ts` startup migrations with a hard verification query that fails if any table is still missing required columns.
- **Task #767 — RLS default-on and pilot flag retirement**: backend migration/runtime no longer depends on `RLS_PILOT_ENABLED`; RLS policies are applied by default, startup now hard-fails in `production`/`staging` if the connecting DB role has `BYPASSRLS`, request middleware now sets both `app.current_user_id` and `app.current_role`, and regression tests now cover at least 3 read paths plus 3 write paths with explicit allow/deny assertions.
- **Task #768 — secondary-table RLS completion**: added `database/migrations/v16-rls-secondary-tables.sql` to explicitly enforce `ENABLE` + `FORCE` RLS and named policies across the full secondary-table acceptance list (tasks/timeline/shopping/rsvp/gallery/communication/reports/event metadata/attendance/vendor lifecycle tables), and added `backend/__tests__/rls-secondary-tables.test.ts` with positive and negative access assertions for each listed table plus fail-open context verification.
- **Entra group overage fallback for RBAC**: Entra callback now handles group overage tokens (`hasgroups` / `_claim_names.groups`) by fetching group IDs from Microsoft Graph `me/memberOf` when direct `groups` claims are omitted, ensuring role mapping remains accurate for high-membership users.
- **Secure-environment MFA/auth startup enforcement**: strict startup security controls now require `ENTRA_AUTH_ENABLED=true` and `ENTRA_MFA_REQUIRED=true` in `production`/`staging`, eliminating drift where Entra or MFA could be disabled in secure deployments.
- **API cache policy evidence**: API GET/HEAD responses now emit explicit cache headers (`Cache-Control: private, max-age=300`) with auth-safe `Vary` headers; integration tests assert the policy.
- **Entra role re-sync on every login (FR-AUTH-003)**: returning users matched by `entra_oid` were not getting their role re-synced from Azure group membership on subsequent logins — only initial provisioning updated the role. `entra-auth-controller.ts` now re-evaluates group membership and updates `role_id` on every Entra authentication, ensuring group changes in Azure AD propagate immediately.
- **`/health` canonical endpoint path**: Docker-compose healthcheck targets `/health` but only `/api/health` existed in `server.js`. Added canonical `GET /health` endpoint alongside the legacy `/api/health` alias so container healthchecks pass.

### Added (2026-05-19 compliance sprint)

- **Universal audit/RLS enforcement migration**: added `database/migrations/v14-universal-audit-rls-enforcement.sql` to baseline-enforce audit columns (`created_at`, `created_by`, `updated_at`, `updated_by`) and RLS enablement/policy coverage across all public tables.
- **Compliance evidence report**: added `docs/processes/compliance-evidence-2026-05-19.md` mapping each previously partial requirement to concrete implementation artifacts and verification commands.
- **Browser support evidence expansion**: Playwright matrix now includes Chromium, Firefox, and WebKit, and frontend declares explicit latest-2 browser support policy via `browserslist`.
- **PostgREST API gateway container**: Added `postgrest/postgrest:v12.2.3` service to `docker-compose.yml` on port 3001 with JWT auth pointed at the festival_planner database (TRD v1.0 §6).
- **Automated database backup service**: Added `db-backup` container to `docker-compose.yml` — hourly incremental backups with 14-day retention and daily full backups with 30-day retention, stored in persistent `db-backups` volume.
- **Database migration v13 — audit columns and full RLS coverage**: `database/migrations/v13-audit-cols-rls-full-coverage.sql` adds missing `created_by`, `updated_by`, `updated_at` audit columns to 30+ tables and enables RLS on 14 additional tables (timeline_activities, shopping_lists, shopping_items, task_comments, task_subtasks, task_dependencies, rsvp_questions, gallery_albums, event_messages, notifications, activity_feed, communication_log, store_suggestions, vendor_favorites, budget_categories, seating_tables, event_documents). Adds 14 new FK and performance indexes.
- **Zustand 4 state management stores**: Created `frontend/src/stores/auth-store.ts`, `frontend/src/stores/event-store.ts`, and `frontend/src/stores/ui-store.ts` with localStorage persistence where appropriate. Barrel exported from `frontend/src/stores/index.ts`.
- **TanStack Query v5 integration**: Wrapped app with `QueryClientProvider` in `frontend/src/main.tsx` (staleTime 5 min, gcTime 10 min, retry 2). Created `frontend/src/hooks/use-events.ts` with `useEvents`, `useEvent`, `useCreateEvent`, `useUpdateEvent`, `useDeleteEvent` hooks and optimistic updates.
- **React Hook Form + Zod validation schemas**: Created `frontend/src/lib/validation-schemas.ts` with complete Zod schemas for login, register, event CRUD, guest, RSVP, task, expense, and vendor entities along with inferred TypeScript types.
- **Swagger/OpenAPI interactive documentation**: Integrated `swagger-jsdoc` and `swagger-ui-express` into `backend/src/index.ts`. Interactive docs at `/api-docs` and raw spec at `/api-docs.json` (non-production environments only).
- **Prettier code formatting**: Added `.prettierrc` (printWidth 100, singleQuote, trailingComma all, endOfLine lf) and `.prettierignore`. Added `format` and `format:check` npm scripts to root `package.json`.
- **Lint-staged pre-commit hooks**: Added `lint-staged` with prettier + ESLint auto-fix on staged files. Created `.githooks/pre-commit`; `prepare` npm script activates the hook path via `git config core.hooksPath .githooks`.
- **k6 load and stress tests**: Created `tests/load/load-test.js` (NFR §5.1 — 100 concurrent VUs, p95 < 500 ms, ramp stages) and `tests/load/stress-test.js` (3x spike to 300 VUs with recovery verification).
- **WCAG 2.1 AA axe-core e2e test suite**: Replaced thin `e2e/accessibility.spec.ts` with a full `@axe-core/playwright` suite covering critical/serious violations, colour contrast, keyboard Tab traversal, and focus-indicator visibility across login, events, and dashboard pages.
- **Global Ctrl+K command palette**: Created `frontend/src/components/nav/global-command-palette.tsx` mounted in AppShell — pressing `Ctrl+K` / `Cmd+K` on any authenticated page opens the `PowerUserSearch` dialog; `Escape` closes it.
- **Architecture migration plan**: Created `docs/architecture-migration-plan.md` documenting ADR-001 (Next.js migration vs Vite) and ADR-002 (UUID primary keys vs SERIAL) with scope tables, migration step outlines, and decision status tracking.

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
- **QR scanning check-in page** (#445, story #413): `frontend/src/components/checkin/qr-scanner-page.tsx` provides a live camera scanner using the browser-native `BarcodeDetector` API (Chrome/Edge/Android) with a manual token-paste fallback for Safari/Firefox; tokens map to RSVP records via `POST /api/events/:eventId/checkin/scan`; route wired at `/events/:id/checkin/scan` in `App.tsx`; the existing check-in page always shows a QR Scanner button; the scanner page uses BarcodeDetector for camera scanning and falls back to manual token entry on unsupported browsers
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
