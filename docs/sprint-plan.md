# Festival Event Planner — Sprint Plan

> 8-sprint delivery roadmap for a 5-member team using 2-week sprints (16 weeks total).
> Sprints follow Kanban principles: pull from backlog when capacity exists.
> Read alongside [module-development-plan.md](module-development-plan.md).

---

## Sprint Summary

| Sprint | Duration | Theme | Key Deliverables |
|---|---|---|---|
| S1 | Weeks 1–2 | Foundation | Repo setup, CI/CD, DB schema, Auth backend |
| S2 | Weeks 3–4 | Auth Complete | Auth frontend, RBAC middleware, profile backend |
| S3 | Weeks 5–6 | Events Core | Event CRUD backend + UI |
| S4 | Weeks 7–8 | Tasks & RSVPs | Task + RSVP backend + UI |
| S5 | Weeks 9–10 | Admin & Profiles | Admin panel, profile edit, photo upload |
| S6 | Weeks 11–12 | Dashboard + Polish | Dashboard, analytics, error handling, a11y |
| S7 | Weeks 13–14 | Testing & Hardening | Integration tests, coverage ≥ 80%, security review |
| S8 | Weeks 15–16 | Release Prep | Staging validation, performance, v1.0 release |

---

## Sprint 1 — Foundation (Weeks 1–2)

**Goal**: Working development environment, CI passing, auth backend operational.

### Member Tasks

| Member | Task | Issue Template | Module |
|---|---|---|---|
| M1 | Set up repo structure, branch protection rules | Theme | Infrastructure |
| M1 | Implement `users` + `sessions` DB tables | Task | M1-Auth |
| M1 | Implement `POST /auth/register` + `POST /auth/login` | Task | M1-Auth |
| M5 | Configure `ci-unified.yml` + branch protection | Task | CI/CD |
| M5 | Configure `notify-on-sync-failure.yml` + secrets | Task | CI/CD |
| M4 | Scaffold frontend: Vite + React + MUI + routing | Task | Infrastructure |
| M2 | Scaffold backend: Express + SQLite init + health endpoint | Task | Infrastructure |
| All | Set up local dev environments, run Docker Compose | Sub-Task | Infrastructure |

### Definition of Done for S1

- [ ] `npm ci && npm test` passes on CI for all packages
- [ ] `develop`, `test`, `stage`, `main` branches exist and protected
- [ ] Auto-sync: push to `develop` creates PR to `test`
- [ ] `POST /auth/register` and `POST /auth/login` return correct responses
- [ ] `docker compose up` starts both services successfully

---

## Sprint 2 — Auth Complete (Weeks 3–4)

**Goal**: Full authentication flow working end-to-end with RBAC enforced.

### Member Tasks

| Member | Task | Module |
|---|---|---|
| M1 | `POST /auth/logout`, `GET /auth/me`, token refresh, heartbeat | M1-Auth |
| M1 | Password reset flow (`forgot-password` + `reset-password`) | M1-Auth |
| M1 | RBAC middleware (`authorizeRole`, `authorizePermission`) | M3-RBAC |
| M1 | Account lockout after 5 failed attempts | M1-Auth |
| M3 | `LoginForm` component + `AuthContext` provider | M1-Auth |
| M3 | `RegisterForm` component + `ProtectedRoute` | M1-Auth |
| M3 | `ForgotPasswordForm` + `ResetPasswordForm` | M1-Auth |
| M4 | `RoleGate` component | M3-RBAC |
| M5 | Backend auth integration tests | M1-Auth |

### Definition of Done for S2

- [ ] User can register, verify email, log in, log out
- [ ] JWT refresh token rotation works
- [ ] Password reset emails sent (check Nodemailer test config)
- [ ] `RoleGate` hides restricted UI from Attendees
- [ ] All auth tests pass with ≥ 80% coverage on auth module

---

## Sprint 3 — Events Core (Weeks 5–6)

**Goal**: Full event lifecycle working — create, list, update, delete with correct RBAC.

### Member Tasks

| Member | Task | Module |
|---|---|---|
| M2 | `events` table migration | M4-Events |
| M2 | `GET /api/events`, `POST /api/events`, `PATCH /api/events/:id`, `DELETE /api/events/:id` | M4-Events |
| M2 | `PATCH /api/events/:id/status` (lifecycle transitions) | M4-Events |
| M2 | Soft-delete + filter `deleted_at IS NULL` in all queries | M4-Events |
| M3 | `EventList` + `EventCard` components | M4-Events |
| M3 | `EventForm` (create/edit) with validation | M4-Events |
| M3 | `EventDetail` page layout | M4-Events |
| M3 | `EventStatusBadge` chip | M4-Events |
| M5 | Events controller integration tests | M4-Events |

### Definition of Done for S3

- [ ] Organizer can create, edit, soft-delete events
- [ ] Attendees can only view `Active` events
- [ ] Admin can manage all events regardless of owner
- [ ] `EventList` renders with filter by status
- [ ] CI passes including events tests

---

## Sprint 4 — Tasks & RSVPs (Weeks 7–8)

**Goal**: Task assignment and RSVP collection working per event.

### Member Tasks

| Member | Task | Module |
|---|---|---|
| M2 | `tasks` + `rsvps` table migrations | M5, M6 |
| M2 | Full CRUD for `/api/events/:eventId/tasks` | M5-Tasks |
| M2 | Full CRUD for `/api/events/:eventId/rsvps` | M6-RSVPs |
| M2 | Unique constraint: one RSVP per email per event | M6-RSVPs |
| M3 | `TaskList` + `TaskItem` + `TaskForm` components | M5-Tasks |
| M3 | `PublicRsvpForm` (no auth required) | M6-RSVPs |
| M3 | `RsvpList` for Organizers | M6-RSVPs |
| M5 | Tasks + RSVPs integration tests | M5, M6 |

### Definition of Done for S4

- [ ] Organizer can add/edit/complete tasks on an event
- [ ] Task completion progress shown on EventDetail
- [ ] Public user can submit RSVP without login
- [ ] Duplicate email RSVP returns 409 conflict
- [ ] All tests pass; CI green on `develop`

---

## Sprint 5 — Admin & Profiles (Weeks 9–10)

**Goal**: Admin panel functional; user profiles complete with photo upload.

### Member Tasks

| Member | Task | Module |
|---|---|---|
| M4 | `user_profiles` table + profile CRUD endpoints | M2-Profiles |
| M4 | Profile photo upload (Multer, MIME validation, 2 MB limit) | M2-Profiles |
| M4 | Email-change confirmation flow | M2-Profiles |
| M4 | Account deletion (soft-delete + session purge) | M2-Profiles |
| M4 | Admin: list users, assign role, lock account, soft-delete user | M7-Admin |
| M4 | Audit log entries for admin actions | M7-Admin |
| M3 | `ProfileView` + `ProfileEdit` components | M2-Profiles |
| M3 | `UserManagementTable` + `RoleAssignment` | M7-Admin |
| M5 | Profile + admin integration tests | M2, M7 |

### Definition of Done for S5

- [ ] User can update profile and upload photo
- [ ] Email change requires confirmation from new inbox
- [ ] Admin can promote user to Organizer
- [ ] Audit log records role changes
- [ ] All profile tests pass ≥ 80% coverage

---

## Sprint 6 — Dashboard & Polish (Weeks 11–12)

**Goal**: Dashboard operational; global error handling; accessibility pass.

### Member Tasks

| Member | Task | Module |
|---|---|---|
| M2 | `GET /api/dashboard/stats` + `GET /api/dashboard/activity` | M8-Dashboard |
| M3 | `DashboardPage` with `StatsCards`, `UpcomingEvents`, `RecentActivity` | M8-Dashboard |
| M3 | Error boundaries on all major routes | Cross-module |
| M3 | Loading skeletons / empty states for all lists | Cross-module |
| M1 | ARIA labels audit + keyboard navigation fixes | Accessibility |
| M4 | Navigation panel + role-conditional menu items | M3-RBAC |
| M5 | Dashboard tests; accessibility test setup | M8, a11y |

### Definition of Done for S6

- [ ] Dashboard shows correct stats scoped by user role
- [ ] All list views show loading/empty states
- [ ] No console errors on any page
- [ ] All buttons and forms keyboard-navigable
- [ ] CI passes; coverage ≥ 80% overall

---

## Sprint 7 — Testing & Hardening (Weeks 13–14)

**Goal**: Full test coverage, security review, performance baseline.

### Member Tasks

| Member | Task |
|---|---|
| M5 | Achieve ≥ 80% line coverage across all packages |
| M1 | Security review: OWASP Top 10 checklist |
| M1 | Rate limiting audit: all public endpoints limited |
| M1 | JWT expiry and rotation edge-case tests |
| M2 | SQL injection tests (parameterised queries audit) |
| M3 | XSS audit: no `dangerouslySetInnerHTML`, input escaping |
| M4 | File upload security: path traversal tests |
| All | Fix all high/critical issues found in review |

### Security Checklist

```
✅ All inputs validated server-side
✅ No raw SQL string interpolation
✅ JWT secrets in env vars only (not hardcoded)
✅ bcrypt cost factor ≥ 12
✅ Rate limits on /auth/login, /auth/register, /auth/forgot-password
✅ File uploads: MIME-type check, size limit, outside public dir
✅ CORS restricted to FRONTEND_URL
✅ HTTP-only cookies for refresh tokens
✅ Content-Security-Policy header set
✅ Sensitive audit log never exposed to non-Admins
✅ Soft-deleted users cannot log in
✅ Account locked users cannot log in
```

---

## Sprint 8 — Release Prep (Weeks 15–16)

**Goal**: `v1.0` release on `main`.

### Member Tasks

| Member | Task |
|---|---|
| M5 | Full smoke test on `stage` environment |
| M5 | Create `release/v1.0.0` branch from `stage` |
| M1 | Final PR review: `stage` → `main` |
| All | Update `CHANGELOG.md` with v1.0 entries |
| M4 | Create GitHub release with tag `v1.0.0` |
| M5 | Confirm `notify-on-sync-failure.yml` works in production |
| M1 | Confirm CODEOWNERS file is correct for v1.0 |

### Release Checklist

```
✅ All S1–S7 definition of done items complete
✅ CI green on stage branch
✅ All integration tests passing
✅ Coverage ≥ 80% on all packages
✅ CHANGELOG.md updated
✅ docker compose up --build succeeds from clean state
✅ 2 approvals on stage → main PR
✅ GitHub release created with v1.0.0 tag
✅ Production environment secret PRODUCTION_DEPLOY_TOKEN set
```

---

## Backlog (Post v1.0)

| Feature | Priority | Module |
|---|---|---|
| Event categories / tags | Medium | M4 |
| RSVP check-in scanning (QR) | Low | M6 |
| In-app notifications | Low | Cross |
| Event media attachments | Low | M4 |
| CSV export of RSVP list | Medium | M6 |
| PostgreSQL migration | Medium | Infrastructure |
| Mobile-responsive improvements | High | Frontend |
| Forgot-password resend throttle UI | High | M1 |
