# BRD v2 Migration Runbook

> **Status**: In progress  
> **Branch**: `feature/526-527-534-535-536-537-538-brd-v2-auth-rls-parity`  
> **Related Issues**: #526, #527, #534, #535, #536, #537, #538, #564–#573, #630–#638

---

## Overview

BRD v2 (Business Requirements Document version 2) delivers the following parity improvements across authentication, RBAC, Row Level Security, and the audit subsystem:

| Area            | What Changed                                                                                   | Issues           |
| --------------- | ---------------------------------------------------------------------------------------------- | ---------------- |
| 5-Role Model    | Added Collaborator (4), Guest (5), Viewer (6) roles                                            | #537, #573       |
| Audit Log       | Extended `audit_log` with actor_id, target_type, target_id, context, severity                  | #538, #572       |
| Audit Coverage  | Added audit events for login, logout, session expiry, role change, token refresh, upload scans | #538, #572       |
| Session Policy  | 30-min inactivity timeout enforced; SESSION_EXPIRED audit events emitted                       | #536, #571       |
| RLS Extension   | Enabled RLS on tasks, expenses, vendors, rsvps                                                 | #564, #632, #633 |
| Upload Scanning | Virus scanning on all file uploads (profile photos, event documents)                           | #565, #634       |
| Frontend RBAC   | Role checks use role names (not IDs); Collaborator/Viewer support added                        | #535, #573       |

---

## Database Migration

### Migration File

**File**: `database/migrations/v2-brd-auth-rbac-rls-parity.sql`

This is a fully idempotent migration that can be applied to any PostgreSQL database that was initialized with `database/init.sql`. All statements use `IF NOT EXISTS`, `ON CONFLICT DO UPDATE`, or equivalent guards.

### Applying the Migration

```bash
# Direct psql application
psql "$DATABASE_URL" -f database/migrations/v2-brd-auth-rbac-rls-parity.sql

# Via Docker
docker exec -i <postgres_container> psql -U <user> -d <db> \
  < database/migrations/v2-brd-auth-rbac-rls-parity.sql
```

### What the Migration Does

1. **Roles**: Inserts Collaborator/Guest/Viewer into `roles` table (ON CONFLICT UPDATE)
2. **Permissions**: Extends `permissions` table with rsvp/tasks/guests/budget/gallery/checkin/reports scopes
3. **Role-Permission Matrix**: Seeds `role_permissions` for all 6 roles
4. **Audit Log Columns**: Adds `actor_id`, `target_type`, `target_id`, `context` (JSONB), `severity` (CHECK)
5. **Audit Indexes**: Creates indexes on `action`, `user_id`, `created_at DESC`, `severity`
6. **RLS**: Enables RLS + FORCE on tasks, expenses, vendors, rsvps; creates event-member policies
7. **Audit Columns on Data Tables**: Adds `updated_by` FK to tasks, expenses, vendors, rsvps, gallery_items

### Rollback

**Warning**: Rollback is destructive if data exists in new columns.

```sql
-- Remove new roles (only safe if no users assigned to these roles)
DELETE FROM role_permissions WHERE role_id IN (4, 5, 6);
DELETE FROM roles WHERE id IN (4, 5, 6);

-- Remove new audit_log columns (data is lost)
ALTER TABLE audit_log DROP COLUMN IF EXISTS actor_id;
ALTER TABLE audit_log DROP COLUMN IF EXISTS target_type;
ALTER TABLE audit_log DROP COLUMN IF EXISTS target_id;
ALTER TABLE audit_log DROP COLUMN IF EXISTS context;
ALTER TABLE audit_log DROP COLUMN IF EXISTS severity;

-- Disable RLS
ALTER TABLE tasks DISABLE ROW LEVEL SECURITY;
ALTER TABLE expenses DISABLE ROW LEVEL SECURITY;
ALTER TABLE vendors DISABLE ROW LEVEL SECURITY;
ALTER TABLE rsvps DISABLE ROW LEVEL SECURITY;

-- Drop policies
DROP POLICY IF EXISTS rls_tasks_event_member ON tasks;
DROP POLICY IF EXISTS rls_expenses_event_member ON expenses;
DROP POLICY IF EXISTS rls_vendors_event_member ON vendors;
DROP POLICY IF EXISTS rls_rsvps_access ON rsvps;
```

---

## Runtime Initialization Changes

The Node.js backend applies BRD v2 changes at startup via `backend/src/db/database.ts`:

1. **5-Role INSERT**: Upserts all 6 roles on every startup (idempotent)
2. **Audit Column Migrations**: `ALTER TABLE IF NOT EXISTS` blocks run on startup
3. **RLS v2**: Enabled by default — applies policies to tasks/expenses/vendors/rsvps in addition to events/event_members

### Environment Variables

| Variable                    | Default            | Description                                          |
| --------------------------- | ------------------ | ---------------------------------------------------- |
| `SESSION_TIMEOUT_MS`        | `1800000` (30 min) | Inactivity session timeout                           |
| `VIRUS_SCAN_ENABLED`        | `false`            | Enable ClamAV virus scanning on uploads              |
| `VIRUS_SCAN_BLOCK_ON_ERROR` | `false`            | Fail-closed on scanner errors (production hardening) |

---

## Auth / RBAC Changes

### Audit Logging (`backend/src/utils/audit-log.ts`)

All security-relevant events are now persisted to `audit_log` via `logAuditEvent()`:

```typescript
import { logAuditEvent, AUDIT_ACTIONS } from '../utils/audit-log.js';

await logAuditEvent({
  db,
  userId: user.id,
  email: user.email,
  action: AUDIT_ACTIONS.LOGIN_SUCCESS,
  description: 'User logged in',
  ipAddress: req.ip,
  severity: 'INFO',
});
```

**Severity Levels**: `INFO | WARN | ERROR | CRITICAL`

**Covered Events**:

- LOGIN_SUCCESS / LOGIN_FAILURE / LOGIN_ACCOUNT_LOCKED
- LOGOUT / LOGOUT_ALL_SESSIONS
- TOKEN_REFRESH_SUCCESS / TOKEN_REFRESH_FAILURE
- SESSION_EXPIRED
- ROLE_CHANGE
- PERMISSION_DENIED
- PASSWORD_RESET_REQUEST / PASSWORD_RESET_COMPLETED
- UPLOAD_SCAN_PASS / UPLOAD_SCAN_FAIL / UPLOAD_REJECTED

### Session Inactivity Policy (#536, #571)

- **Timeout**: `SESSION_TIMEOUT_MS` (default 30 min)
- **Enforcement**: `authenticateToken` middleware deletes the session and returns HTTP 401 with `code: 'SESSION_TIMEOUT'`
- **Audit**: `SESSION_EXPIRED` event emitted on timeout

### Role-Based Permission Enforcement

Frontend role checks use `frontend/src/utils/roles.ts`:

```typescript
import { canEditEvent, isAdmin, isViewOnly } from '../../utils/roles';

const canEdit = canEditEvent(user.roleName); // Organizer, Admin, Collaborator
const admin = isAdmin(user.roleName); // Admin only
const readOnly = isViewOnly(user.roleName); // Viewer or Guest
```

**Do NOT use `user.roleId >= N` comparisons** — role IDs are not ordinal with BRD v2.

---

## Upload Security (#565, #634)

File uploads are scanned via `backend/src/utils/virus-scan.ts`:

- **ClamAV mode** (`VIRUS_SCAN_ENABLED=true`): calls `clamscan --no-summary <file>`
- **Stub mode** (default): rejects EICAR test files and embedded scripts in images
- **Fail-closed** (`VIRUS_SCAN_BLOCK_ON_ERROR=true`): scanner errors reject the upload

Covered upload endpoints:

- `POST /api/profile/photo` (profile photos)
- `POST /api/events/:eventId/documents` (event documents)

---

## Testing

```bash
# Backend unit + integration tests
cd backend && npm test

# Specific BRD v2 test suites
cd backend && npx vitest run __tests__/brd-v2-five-role-model.test.ts
cd backend && npx vitest run __tests__/brd-v2-auth-audit.test.ts

# Frontend type check
cd frontend && npm run build
```

---

## Deployment Checklist

- [ ] Apply `database/migrations/v2-brd-auth-rbac-rls-parity.sql` to target DB
- [ ] Verify all 6 roles exist: `SELECT id, name FROM roles ORDER BY id;`
- [ ] Verify audit_log columns: `\d audit_log` in psql
- [ ] Verify startup role does not have `BYPASSRLS` in production/staging
- [ ] (Optional) Set `VIRUS_SCAN_ENABLED=true` and ensure `clamscan` is installed
- [ ] (Optional) Set `VIRUS_SCAN_BLOCK_ON_ERROR=true` for fail-closed upload policy
- [ ] Run backend tests: `cd backend && npm test`
- [ ] Deploy backend, verify startup logs show `[RLS] RLS policies on tasks, expenses, vendors, rsvps applied.`
