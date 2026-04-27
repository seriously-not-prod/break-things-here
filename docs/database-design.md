# Festival Event Planner — Database Design

> SQLite schema reference. All tables are created via `backend/src/db/database.ts` migrations.
> For production migration to PostgreSQL, column types map 1:1 with minor syntax changes noted.

---

## Entity Relationship Overview

```
users ──────────────────┐
  │                     │ (created_by)
  │ 1:1 user_profiles   │
  │ 1:N sessions        ▼
  │ 1:N password_reset_tokens     events ──────────────────┐
  │ 1:N audit_log                   │ 1:N tasks            │
  └── role_id → roles               │ 1:N rsvps            │
                  │                 └──────────────────────┘
                  └── N:N role_permissions → permissions
```

---

## Tables

### `users`

Primary identity record. Soft-deletable via `deleted_at`.

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| `id` | INTEGER PK | No | AUTO | |
| `email` | TEXT UNIQUE | No | — | Lowercase, validated |
| `password_hash` | TEXT | No | — | bcrypt, cost ≥ 12 |
| `display_name` | TEXT | No | — | |
| `email_verified` | INTEGER | No | 0 | Boolean (0/1) |
| `email_verified_at` | DATETIME | Yes | NULL | |
| `email_verification_token` | TEXT | Yes | NULL | Hashed; cleared after use |
| `pending_email` | TEXT | Yes | NULL | New email awaiting confirmation |
| `pending_email_token` | TEXT | Yes | NULL | Hashed confirmation token |
| `pending_email_token_expiry` | DATETIME | Yes | NULL | 24 h from request |
| `role_id` | INTEGER FK→roles | No | 1 | Default: Attendee |
| `account_locked` | INTEGER | No | 0 | 1 = locked |
| `locked_until` | DATETIME | Yes | NULL | Auto-unlock after 15 min |
| `login_attempts` | INTEGER | No | 0 | Reset on successful login |
| `created_at` | DATETIME | No | NOW | |
| `updated_at` | DATETIME | No | NOW | |
| `deleted_at` | DATETIME | Yes | NULL | Soft-delete timestamp |

**Indexes**:
```sql
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_role_id ON users(role_id);
CREATE INDEX idx_users_deleted_at ON users(deleted_at);
```

---

### `sessions`

One record per active login session. Deleted on logout or expiry.

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| `id` | INTEGER PK | No | AUTO | |
| `user_id` | INTEGER FK→users | No | — | CASCADE DELETE |
| `token` | TEXT UNIQUE | No | — | Hashed JWT access token |
| `refresh_token` | TEXT UNIQUE | No | — | Hashed refresh token |
| `expires_at` | DATETIME | No | — | Access token expiry |
| `last_activity` | DATETIME | No | NOW | Updated on heartbeat |
| `created_at` | DATETIME | No | NOW | |

**Indexes**:
```sql
CREATE INDEX idx_sessions_user_id ON sessions(user_id);
CREATE INDEX idx_sessions_refresh_token ON sessions(refresh_token);
CREATE INDEX idx_sessions_expires_at ON sessions(expires_at);
```

---

### `password_reset_tokens`

Single-use tokens for the forgot-password flow.

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| `id` | INTEGER PK | No | AUTO | |
| `user_id` | INTEGER FK→users | Yes | NULL | SET NULL on user delete |
| `email` | TEXT | No | — | Stored for user-deleted case |
| `token` | TEXT UNIQUE | No | — | Hashed; 32-byte random |
| `expires_at` | DATETIME | No | — | 1 hour from creation |
| `used` | INTEGER | No | 0 | 1 = consumed |
| `used_at` | DATETIME | Yes | NULL | |
| `created_at` | DATETIME | No | NOW | |

---

### `password_reset_rate_limit`

Prevents brute-force of the forgot-password endpoint.

| Column | Type | Nullable | Notes |
|---|---|---|---|
| `id` | INTEGER PK | No | |
| `email` | TEXT UNIQUE | No | |
| `request_count` | INTEGER | No | Default 1 |
| `window_start` | DATETIME | No | Reset after 1 hour |

**Rule**: Max 3 requests per email per hour.

---

### `roles`

| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER PK | |
| `name` | TEXT UNIQUE | Attendee / Organizer / Admin |
| `description` | TEXT | |
| `created_at` | DATETIME | |

**Seed data**:
```sql
INSERT INTO roles (id, name) VALUES
  (1, 'Attendee'),
  (2, 'Organizer'),
  (3, 'Admin');
```

---

### `permissions`

Granular permission strings used by `authorizePermission` middleware.

| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER PK | |
| `name` | TEXT UNIQUE | e.g. `events.create` |
| `description` | TEXT | |
| `created_at` | DATETIME | |

**Seed data**:

```sql
INSERT INTO permissions (name) VALUES
  ('users.view'),
  ('users.edit'),
  ('users.delete'),
  ('events.view'),
  ('events.create'),
  ('events.edit'),
  ('events.delete'),
  ('tasks.view'),
  ('tasks.manage'),
  ('rsvps.view'),
  ('rsvps.manage'),
  ('roles.view'),
  ('roles.manage');
```

---

### `role_permissions`

Junction table linking roles to permissions.

| Column | Type | Notes |
|---|---|---|
| `role_id` | INTEGER FK→roles | Composite PK |
| `permission_id` | INTEGER FK→permissions | Composite PK |

**Assignments**:

| Role | Permissions |
|---|---|
| Attendee | `events.view` |
| Organizer | `events.view`, `events.create`, `events.edit`, `events.delete`, `tasks.view`, `tasks.manage`, `rsvps.view`, `rsvps.manage`, `users.view` |
| Admin | All permissions |

---

### `user_profiles`

Extended profile data in a separate 1:1 table (keeps `users` lean).

| Column | Type | Nullable | Notes |
|---|---|---|---|
| `id` | INTEGER PK | No | |
| `user_id` | INTEGER FK→users UNIQUE | No | CASCADE DELETE |
| `bio` | TEXT | Yes | Max 500 chars |
| `phone_number` | TEXT | Yes | Stored as string |
| `profile_photo_url` | TEXT | Yes | Relative path under uploads/ |
| `address` | TEXT | Yes | |
| `city` | TEXT | Yes | |
| `state` | TEXT | Yes | |
| `zip_code` | TEXT | Yes | |
| `country` | TEXT | Yes | |
| `created_at` | DATETIME | No | |
| `updated_at` | DATETIME | No | |

---

### `audit_log`

Immutable append-only security log. Never update or delete rows.

| Column | Type | Nullable | Notes |
|---|---|---|---|
| `id` | INTEGER PK | No | |
| `user_id` | INTEGER FK→users | Yes | SET NULL on delete |
| `email` | TEXT | Yes | Snapshot at time of action |
| `action` | TEXT | No | e.g. `LOGIN_SUCCESS`, `PASSWORD_RESET` |
| `description` | TEXT | Yes | Human-readable detail |
| `ip_address` | TEXT | Yes | From request headers |
| `created_at` | DATETIME | No | |

**Standard action codes**:

```
LOGIN_SUCCESS       LOGOUT             LOGIN_FAILED
PASSWORD_RESET      EMAIL_CHANGE       ACCOUNT_LOCKED
ACCOUNT_DELETED     ROLE_CHANGED       USER_CREATED
EVENT_CREATED       EVENT_DELETED      RSVP_SUBMITTED
```

**Index**:
```sql
CREATE INDEX idx_audit_log_user_id ON audit_log(user_id);
CREATE INDEX idx_audit_log_created_at ON audit_log(created_at);
```

---

### `events`

Core event records.

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| `id` | INTEGER PK | No | AUTO | |
| `title` | TEXT | No | — | Max 200 chars |
| `description` | TEXT | Yes | NULL | |
| `location` | TEXT | Yes | NULL | |
| `event_date` | TEXT | No | — | ISO 8601 date string |
| `status` | TEXT | No | `Draft` | CHECK: Draft/Active/Completed/Cancelled |
| `created_by` | INTEGER FK→users | No | — | SET NULL on user delete |
| `created_at` | DATETIME | No | NOW | |
| `updated_at` | DATETIME | No | NOW | |
| `deleted_at` | DATETIME | Yes | NULL | Soft-delete |

**Indexes**:
```sql
CREATE INDEX idx_events_status ON events(status);
CREATE INDEX idx_events_event_date ON events(event_date);
CREATE INDEX idx_events_created_by ON events(created_by);
CREATE INDEX idx_events_deleted_at ON events(deleted_at);
```

---

### `tasks`

Tasks scoped to a specific event.

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| `id` | INTEGER PK | No | AUTO | |
| `event_id` | INTEGER FK→events | No | — | CASCADE DELETE |
| `title` | TEXT | No | — | |
| `notes` | TEXT | Yes | NULL | |
| `assignee_name` | TEXT | Yes | NULL | Free text (no FK) |
| `due_date` | TEXT | Yes | NULL | ISO 8601 |
| `status` | TEXT | No | `Pending` | CHECK: Pending/In Progress/Completed |
| `created_by` | INTEGER FK→users | No | — | SET NULL on user delete |
| `created_at` | DATETIME | No | NOW | |
| `updated_at` | DATETIME | No | NOW | |

**Indexes**:
```sql
CREATE INDEX idx_tasks_event_id ON tasks(event_id);
CREATE INDEX idx_tasks_status ON tasks(status);
CREATE INDEX idx_tasks_due_date ON tasks(due_date);
```

---

### `rsvps`

RSVP records per event. Unique on (event_id, email).

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| `id` | INTEGER PK | No | AUTO | |
| `event_id` | INTEGER FK→events | No | — | CASCADE DELETE |
| `name` | TEXT | No | — | |
| `email` | TEXT | No | — | Validated email format |
| `status` | TEXT | No | `Pending` | CHECK: Going/Maybe/Not Going/Pending |
| `notes` | TEXT | Yes | NULL | |
| `source` | TEXT | No | `public` | CHECK: internal/public |
| `created_at` | DATETIME | No | NOW | |
| `updated_at` | DATETIME | No | NOW | |

**Unique constraint**:
```sql
CREATE UNIQUE INDEX idx_rsvps_event_email ON rsvps(event_id, email);
```

**Additional indexes**:
```sql
CREATE INDEX idx_rsvps_event_id ON rsvps(event_id);
CREATE INDEX idx_rsvps_status ON rsvps(status);
```

---

## Migration Strategy

### Current Approach

All tables are created in a single `runMigrations()` function using `CREATE TABLE IF NOT EXISTS`. This works for the current SQLite dev setup.

### Recommended: Numbered Migration Files

When the team scales, replace the single function with numbered migration files:

```
backend/database/migrations/
  001-initial-schema.sql
  002-add-tasks-assignee-user-fk.sql
  003-add-rsvps-unique-constraint.sql
  004-add-event-categories.sql
```

```typescript
// Pseudo-migration runner in database.ts
const migrations = await db.all("SELECT name FROM migrations ORDER BY id");
const applied = new Set(migrations.map(m => m.name));
for (const file of fs.readdirSync(MIGRATIONS_DIR).sort()) {
  if (!applied.has(file)) {
    await db.exec(fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8'));
    await db.run("INSERT INTO migrations (name) VALUES (?)", file);
  }
}
```

### Future Schema Additions (Planned)

| Table | Purpose | Priority |
|---|---|---|
| `event_categories` | Tag events with type (Music/Food/Sport) | Medium |
| `event_media` | Attach images/documents to events | Low |
| `notifications` | In-app notification records | Low |
| `rsvp_check_ins` | Gate check-in tracking | Low |
