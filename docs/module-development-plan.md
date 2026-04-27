# Festival Event Planner — Module Development Plan

> Defines every feature module, its API endpoints, UI components, tests, and owner.
> Read alongside [team-development-guide.md](team-development-guide.md) and [database-design.md](database-design.md).

---

## Module Map

```
M1 · Authentication & Sessions
M2 · User Profiles & Account Management
M3 · Role-Based Access Control (RBAC)
M4 · Event Management
M5 · Task Management
M6 · RSVP Management
M7 · Admin Panel
M8 · Dashboard & Analytics
```

**Build order**: M1 → M3 → M2 → M4 → M5 → M6 → M8 → M7

---

## M1 — Authentication & Sessions

**Owner**: Member 1 (Tech Lead)  
**Status**: Partially implemented — needs test coverage completion and remember-me hardening

### Acceptance Criteria

- Users can register with email + password; email verification required before login
- Login returns a short-lived JWT access token (15 min) and a refresh token (7 days)
- Remember-me option extends refresh token to 30 days and sets persistent cookie
- Token refresh endpoint issues new access token from valid refresh token
- Session heartbeat extends inactivity timeout
- Logout invalidates session record in DB
- Account lock after 5 failed login attempts (15-minute lockout)
- Password reset via secure tokenised email link (1-hour expiry, single-use)

### Backend API Endpoints

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/api/auth/register` | Public | Create account + send verification email |
| POST | `/api/auth/verify-email` | Public | Confirm email token |
| POST | `/api/auth/login` | Public | Issue JWT + refresh token |
| POST | `/api/auth/logout` | JWT | Invalidate session |
| GET | `/api/auth/me` | JWT | Return current user payload |
| POST | `/api/auth/refresh` | Cookie/Body | Issue new access token |
| POST | `/api/auth/session/heartbeat` | JWT | Extend inactivity window |
| POST | `/api/auth/forgot-password` | Public | Send reset email |
| POST | `/api/auth/reset-password` | Public | Apply new password via token |

### Frontend Components

| Component | Path | Description |
|---|---|---|
| `LoginForm` | `frontend/src/components/login-form/` | Email/password + remember-me |
| `RegisterForm` | `frontend/src/components/register-form/` | Registration form + validation |
| `ForgotPasswordForm` | `frontend/src/components/forgot-password-form/` | Email input for reset |
| `ResetPasswordForm` | `frontend/src/components/reset-password-form/` | New password + confirm |
| `ProtectedRoute` | `src/components/protected-route/` | Route guard — redirects if unauthenticated |
| `AuthContext` | `src/contexts/` | Global auth state provider |

### Tests Required

```
backend/__tests__/
  auth.integration.test.ts        ← register, verify, login, logout, me
  jwt-token-refresh.test.ts       ← refresh token rotation
  remember-me-session.test.js     ← persistent cookie behaviour
  session-timeout.test.ts         ← inactivity auto-logout
  forgot-password.test.ts         ← email dispatch + token validation
  reset-password.test.ts          ← token use, expiry, single-use

src/__tests__/
  login-page.test.tsx             ← renders, submits, shows errors
  registration-form.test.tsx      ← validation, success redirect
```

### Security Requirements

- Passwords hashed with bcrypt (cost factor ≥ 12)
- JWTs signed with `HS256`; secrets stored in env vars only
- Refresh tokens stored hashed in `sessions` table
- Password reset tokens stored hashed, single-use, expire in 1 hour
- Rate limit: 5 requests / minute on `/auth/login` and `/auth/forgot-password`
- CORS restricted to `FRONTEND_URL` env var

---

## M2 — User Profiles & Account Management

**Owner**: Member 4 (Full-Stack Dev)  
**Status**: Partially implemented — profile photo upload exists, email change needs hardening

### Acceptance Criteria

- Authenticated user can view and edit their profile (name, bio, phone, address)
- Profile photo upload (JPEG/PNG/WebP, max 2 MB); served from outside web root
- Email change requires confirmation link sent to new address (token expires 24 h)
- Account deletion soft-deletes the record (sets `deleted_at`)
- User can view their own RSVP history

### Backend API Endpoints

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/profile` | JWT | Get current user full profile |
| PATCH | `/api/profile` | JWT | Update bio, phone, address fields |
| POST | `/api/profile/photo` | JWT | Upload profile photo (multipart) |
| DELETE | `/api/profile/photo` | JWT | Remove profile photo |
| POST | `/api/profile/confirm-email-change` | Token | Confirm new email address |
| GET | `/api/users/me` | JWT | Get lightweight self record |
| PATCH | `/api/users/me` | JWT | Update display name |
| DELETE | `/api/users/me` | JWT | Soft-delete own account |
| DELETE | `/api/profile/account` | JWT | Full account deletion flow |

### Frontend Components

| Component | Path | Description |
|---|---|---|
| `ProfileView` | `src/components/profile-view/` | Read-only profile display |
| `ProfileEdit` | `src/components/profile-edit/` | Edit form with photo upload |
| `AccountDeletion` | `src/components/account-deletion/` | Confirmation dialog + delete |
| `SettingsPanel` | `frontend/src/components/settings/` | Email change, password change |

### Tests Required

```
src/__tests__/
  profile-view.test.tsx
  profile-edit.test.tsx
  account-deletion.test.tsx
  profile-management.integration.test.tsx
  email-change.test.ts
```

### Security Requirements

- Profile photo stored in `uploads/profile-photos/` (outside `public/`)
- Multer MIME-type filter (not extension); max 2 MB enforced
- Email-change token single-use, hashed in DB
- Account deletion purges sessions; soft-delete hides user from queries

---

## M3 — Role-Based Access Control (RBAC)

**Owner**: Member 1 (Tech Lead)  
**Status**: Schema exists; permission checking middleware implemented; UI gates needed

### Roles & Permissions Matrix

| Permission | Attendee | Organizer | Admin |
|---|---|---|---|
| `events.view` | ✅ | ✅ | ✅ |
| `events.create` | ❌ | ✅ | ✅ |
| `events.edit` | ❌ | ✅ (own) | ✅ |
| `events.delete` | ❌ | ✅ (own) | ✅ |
| `tasks.view` | ❌ | ✅ | ✅ |
| `tasks.manage` | ❌ | ✅ | ✅ |
| `rsvps.view` | ❌ | ✅ | ✅ |
| `rsvps.manage` | ❌ | ✅ | ✅ |
| `users.view` | ❌ | ✅ | ✅ |
| `users.edit` | ❌ | ❌ | ✅ |
| `users.delete` | ❌ | ❌ | ✅ |
| `roles.manage` | ❌ | ❌ | ✅ |

### Backend Middleware

```typescript
// Usage in routes
router.post('/events', authenticateToken, authorizePermission('events.create'), eventsController.create);
router.delete('/users/:id', authenticateToken, authorizeRole('Admin'), usersController.deleteUser);
```

### Frontend Gates

| Component | Path | Description |
|---|---|---|
| `RoleGate` | `src/components/role-gate/` | Renders children only for allowed roles |
| `ProtectedRoute` | `src/components/protected-route/` | Route-level role protection |

```typescript
// Usage
<RoleGate roles={['Admin', 'Organizer']}>
  <CreateEventButton />
</RoleGate>
```

### Tests Required

```
src/__tests__/
  user-role.test.ts        ← role assignment, permission check logic
  users.test.ts            ← admin user management API calls
backend (inline in controller tests)
```

---

## M4 — Event Management

**Owner**: Member 2 (Backend) + Member 3 (Frontend)  
**Status**: Controller exists; UI components partially built

### Acceptance Criteria

- Organizers and Admins can create events with title, date, location, description
- Events have lifecycle: `Draft` → `Active` → `Completed` | `Cancelled`
- Events can be soft-deleted (sets `deleted_at`)
- Public attendees can view `Active` events only
- Organizers can only edit/delete their own events (Admins can manage all)
- Events list supports filtering by status and sorting by date

### Backend API Endpoints

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/events` | JWT | List all events (filtered by permission) |
| GET | `/api/events/:id` | JWT | Get single event |
| POST | `/api/events` | Organizer+ | Create event |
| PATCH | `/api/events/:id` | Organizer+ | Update event |
| DELETE | `/api/events/:id` | Organizer+ | Soft-delete event |
| PATCH | `/api/events/:id/status` | Organizer+ | Change event status |

### Frontend Components

| Component | Path | Description |
|---|---|---|
| `EventList` | `frontend/src/components/events/` | Paginated event cards |
| `EventCard` | `frontend/src/components/events/` | Single event summary card |
| `EventDetail` | `frontend/src/components/events/` | Full event view with tasks/RSVPs |
| `EventForm` | `frontend/src/components/events/` | Create/edit form |
| `EventStatusBadge` | `frontend/src/components/events/` | Status chip (Draft/Active/etc.) |

### Data Types (already defined in `src/types/event-planner.ts`)

```typescript
interface PlannerEvent {
  id: string;
  title: string;
  date: string;
  location: string;
  description: string;
  status: EventStatus;   // 'Active' | 'Draft' | 'Completed'
  createdAt: string;
  updatedAt: string;
}
```

### Tests Required

```
src/__tests__/
  event-planner-app.test.tsx    ← full app smoke test
backend/__tests__/
  events.integration.test.ts    ← CRUD, status transition, auth guards
```

---

## M5 — Task Management

**Owner**: Member 2 (Backend) + Member 3 (Frontend)  
**Status**: Controller stub exists; full implementation needed

### Acceptance Criteria

- Tasks belong to exactly one event
- Tasks have: title, assignee name, due date, notes, status (`Pending` / `In Progress` / `Completed`)
- Only Organizers+ can create/edit/delete tasks
- Task list on Event Detail page shows completion progress
- Overdue tasks (past due date, not completed) highlighted in UI

### Backend API Endpoints

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/events/:eventId/tasks` | Organizer+ | List tasks for event |
| GET | `/api/tasks/:id` | Organizer+ | Get single task |
| POST | `/api/events/:eventId/tasks` | Organizer+ | Create task |
| PATCH | `/api/tasks/:id` | Organizer+ | Update task |
| DELETE | `/api/tasks/:id` | Organizer+ | Delete task |

### Frontend Components

| Component | Path | Description |
|---|---|---|
| `TaskList` | `frontend/src/components/events/` | Task list with progress bar |
| `TaskItem` | `frontend/src/components/events/` | Single task row with status toggle |
| `TaskForm` | `frontend/src/components/events/` | Add/edit task modal |

### Data Types

```typescript
interface PlannerTask {
  id: string;
  eventId: string;
  title: string;
  assignee: string;
  dueDate: string;
  status: TaskStatus;  // 'Pending' | 'In Progress' | 'Completed'
  notes: string;
}
```

### Tests Required

```
backend/__tests__/
  tasks.integration.test.ts     ← CRUD, event scoping, auth guards
src/__tests__/
  tasks.test.tsx                ← TaskList, TaskItem interaction
```

---

## M6 — RSVP Management

**Owner**: Member 2 (Backend) + Member 3 (Frontend)  
**Status**: Controller stub exists; public RSVP form needed

### Acceptance Criteria

- Public users can RSVP to `Active` events without an account (public source)
- Authenticated Organizers can add RSVPs manually (internal source)
- RSVP statuses: `Going` / `Maybe` / `Not Going`
- Duplicate email per event rejected (one RSVP per email per event)
- Organizers can view and export RSVP list per event
- RSVP count displayed on event card and detail

### Backend API Endpoints

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/events/:eventId/rsvps` | Organizer+ | List RSVPs for event |
| POST | `/api/events/:eventId/rsvps` | Public | Submit public RSVP |
| POST | `/api/events/:eventId/rsvps/internal` | Organizer+ | Add internal RSVP |
| PATCH | `/api/rsvps/:id` | Organizer+ | Update RSVP status |
| DELETE | `/api/rsvps/:id` | Organizer+ | Remove RSVP |

### Frontend Components

| Component | Path | Description |
|---|---|---|
| `PublicRsvpForm` | `frontend/src/components/events/` | Public-facing RSVP form |
| `RsvpList` | `frontend/src/components/events/` | RSVP table for Organizers |
| `RsvpStatusChip` | `frontend/src/components/events/` | Going / Maybe / Not Going badge |

### Data Types

```typescript
interface PlannerRsvp {
  id: string;
  eventId: string;
  name: string;
  email: string;
  status: RsvpStatus;   // 'Going' | 'Maybe' | 'Not Going'
  notes: string;
  source: 'internal' | 'public';
}
```

### Tests Required

```
backend/__tests__/
  rsvps.integration.test.ts     ← public submit, duplicate check, auth
src/__tests__/
  rsvps.test.tsx                ← form submission, error states
```

---

## M7 — Admin Panel

**Owner**: Member 4 (Full-Stack Dev)  
**Status**: Controller and components partially implemented

### Acceptance Criteria

- Admins can view, search, and filter all users
- Admins can assign or revoke roles
- Admins can lock/unlock accounts
- Admins can soft-delete user accounts
- Audit log viewable by Admins (last 500 entries)
- Admin cannot demote themselves from Admin role

### Backend API Endpoints

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/admin/users` | Admin | List all users (paginated) |
| GET | `/api/admin/users/:id` | Admin | Get user details |
| PATCH | `/api/admin/users/:id/role` | Admin | Assign role |
| PATCH | `/api/admin/users/:id/lock` | Admin | Lock/unlock account |
| DELETE | `/api/admin/users/:id` | Admin | Soft-delete user |
| GET | `/api/admin/audit-log` | Admin | View audit log |
| GET | `/api/admin/stats` | Admin | System statistics |

### Frontend Components

| Component | Path | Description |
|---|---|---|
| `UserManagementTable` | `src/components/admin-user-management/` | Filterable user table |
| `RoleAssignment` | `src/components/admin-user-management/` | Role picker dropdown |
| `AuditLogView` | `frontend/src/components/admin/` | Paginated audit log |
| `AdminDashboard` | `frontend/src/components/admin/` | Stats overview |

### Tests Required

```
src/__tests__/
  admin-user-management.test.tsx
backend/__tests__/
  admin.integration.test.ts     ← role assignment, lock, delete, audit
```

---

## M8 — Dashboard & Analytics

**Owner**: Member 3 (Frontend) + Member 2 (Backend stats endpoint)  
**Status**: Dashboard component exists; stats API needed

### Acceptance Criteria

- Dashboard shows: total events, active events, upcoming events (next 7 days)
- Shows: pending tasks count, recent RSVPs (last 5)
- Organizer sees only their events; Admin sees all
- Recent activity feed (last 10 items: event created, task completed, RSVP received)
- Data refreshes on page focus or every 5 minutes

### Backend API Endpoints

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/dashboard/stats` | JWT | Aggregated stats for current user |
| GET | `/api/dashboard/activity` | JWT | Recent activity feed |

### Frontend Components

| Component | Path | Description |
|---|---|---|
| `DashboardPage` | `frontend/src/components/dashboard/` | Main dashboard layout |
| `StatsCards` | `frontend/src/components/dashboard/` | 4 stat cards |
| `UpcomingEvents` | `frontend/src/components/dashboard/` | Next 3 events list |
| `RecentActivity` | `frontend/src/components/dashboard/` | Activity feed list |
| `PendingTasksWidget` | `frontend/src/components/dashboard/` | Task count + link |

### Data Types

```typescript
interface DashboardStats {
  totalEvents: number;
  activeEvents: number;
  upcomingEvents: PlannerEvent[];
  recentRsvps: PlannerRsvp[];
  pendingTasks: number;
}
```

### Tests Required

```
src/__tests__/
  dashboard.test.tsx            ← renders stats, handles loading/error
backend (inline in controller tests)
```

---

## Cross-Module Concerns

### API Client Pattern (Frontend)

All API calls go through `src/api/api-client.ts`:

```typescript
// Base fetch wrapper with auth header injection
export async function apiRequest<T>(
  path: string,
  options?: RequestInit
): Promise<T> {
  const token = getAccessToken(); // from AuthContext
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options?.headers,
    },
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error ?? `HTTP ${response.status}`);
  }
  return response.json();
}
```

### Error Boundary

Wrap each major route with an error boundary:

```typescript
// src/components/error-boundary/error-boundary.tsx
export class ErrorBoundary extends React.Component<Props, State> { … }

// Usage in router
<ErrorBoundary fallback={<ErrorPage />}>
  <EventList />
</ErrorBoundary>
```

### Input Sanitisation

- Backend: validate all body fields with explicit type checks before DB writes
- Frontend: use controlled inputs; never use `dangerouslySetInnerHTML`
- File uploads: validate MIME type server-side (already enforced in multer config)
