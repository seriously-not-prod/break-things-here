-- =============================================================================
-- Migration: BRD v2 - Auth/RBAC/RLS/Audit Parity
-- Issues: #535, #536, #537, #538, #564, #568, #571, #572, #573
-- Applied: idempotent (safe to run on fresh or existing databases)
-- Rollback: see rollback section at the bottom of this file
-- =============================================================================

-- =============================================================================
-- SECTION 1: Five-Role Model Parity (#537, #573)
-- Add Collaborator, Guest (alias), and Viewer roles to complete the 5-role
-- model required by the BRD: Admin / Organizer / Collaborator / Guest / Viewer
-- =============================================================================

-- Add Collaborator role (id=4): can collaborate on events but not create
INSERT INTO roles (id, name, description) VALUES
  (4, 'Collaborator', 'Can contribute to events they are assigned to'),
  (5, 'Guest',        'Invited event attendee; can RSVP and check in'),
  (6, 'Viewer',       'Read-only access to public events and own RSVPs')
ON CONFLICT (id) DO UPDATE
  SET name        = EXCLUDED.name,
      description = EXCLUDED.description;

-- Keep the sequence ahead of all role IDs
SELECT setval('roles_id_seq', GREATEST((SELECT MAX(id) FROM roles), 6));

-- =============================================================================
-- SECTION 2: Permissions for new roles (#537, #573)
-- Extend role_permissions to assign appropriate permissions to each role
-- =============================================================================

-- Ensure all required permissions exist
INSERT INTO permissions (name, description) VALUES
  ('events.view',      'View events'),
  ('events.create',    'Create events'),
  ('events.edit',      'Edit events'),
  ('events.delete',    'Delete events'),
  ('rsvp.create',      'Submit an RSVP'),
  ('rsvp.view',        'View own RSVP'),
  ('rsvp.manage',      'Manage all RSVPs for an event'),
  ('tasks.view',       'View event tasks'),
  ('tasks.edit',       'Create and update tasks'),
  ('guests.view',      'View guest list'),
  ('guests.manage',    'Manage guest records'),
  ('budget.view',      'View budget'),
  ('budget.edit',      'Edit budget items'),
  ('gallery.view',     'View gallery'),
  ('gallery.upload',   'Upload gallery media'),
  ('gallery.moderate', 'Moderate gallery items'),
  ('users.view',       'View user profiles'),
  ('users.edit',       'Edit user profiles'),
  ('users.delete',     'Delete users'),
  ('roles.view',       'View roles'),
  ('roles.manage',     'Manage roles and permissions'),
  ('checkin.perform',  'Perform attendee check-in'),
  ('reports.view',     'View analytics and reports')
ON CONFLICT (name) DO NOTHING;

-- Admin (id=3): all permissions
INSERT INTO role_permissions (role_id, permission_id)
SELECT 3, id FROM permissions
ON CONFLICT DO NOTHING;

-- Organizer (id=2): manage events, guests, tasks, budget, gallery, reports
INSERT INTO role_permissions (role_id, permission_id)
SELECT 2, p.id FROM permissions p
WHERE p.name IN (
  'events.view', 'events.create', 'events.edit', 'events.delete',
  'rsvp.create', 'rsvp.view', 'rsvp.manage',
  'tasks.view', 'tasks.edit',
  'guests.view', 'guests.manage',
  'budget.view', 'budget.edit',
  'gallery.view', 'gallery.upload', 'gallery.moderate',
  'users.view',
  'roles.view',
  'checkin.perform',
  'reports.view'
)
ON CONFLICT DO NOTHING;

-- Collaborator (id=4): contribute to assigned events
INSERT INTO role_permissions (role_id, permission_id)
SELECT 4, p.id FROM permissions p
WHERE p.name IN (
  'events.view',
  'rsvp.view',
  'tasks.view', 'tasks.edit',
  'guests.view',
  'budget.view',
  'gallery.view', 'gallery.upload',
  'users.view',
  'checkin.perform'
)
ON CONFLICT DO NOTHING;

-- Guest (id=5): RSVP and check-in for own attendance
INSERT INTO role_permissions (role_id, permission_id)
SELECT 5, p.id FROM permissions p
WHERE p.name IN (
  'events.view',
  'rsvp.create', 'rsvp.view',
  'gallery.view'
)
ON CONFLICT DO NOTHING;

-- Viewer (id=6): read-only
INSERT INTO role_permissions (role_id, permission_id)
SELECT 6, p.id FROM permissions p
WHERE p.name IN (
  'events.view',
  'rsvp.view',
  'gallery.view'
)
ON CONFLICT DO NOTHING;

-- Attendee (id=1): legacy alias — treat same as Guest
INSERT INTO role_permissions (role_id, permission_id)
SELECT 1, p.id FROM permissions p
WHERE p.name IN (
  'events.view',
  'rsvp.create', 'rsvp.view',
  'gallery.view'
)
ON CONFLICT DO NOTHING;

-- =============================================================================
-- SECTION 3: Audit Log enhancements (#538, #572)
-- Add context and severity columns to audit_log for richer security events
-- =============================================================================

ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS actor_id      INTEGER REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS target_type   TEXT;
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS target_id     TEXT;
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS context       JSONB;
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS severity      TEXT DEFAULT 'INFO' CHECK (severity IN ('INFO', 'WARN', 'ERROR', 'CRITICAL'));

CREATE INDEX IF NOT EXISTS idx_audit_log_action     ON audit_log(action);
CREATE INDEX IF NOT EXISTS idx_audit_log_user_id    ON audit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_severity   ON audit_log(severity) WHERE severity IN ('WARN', 'ERROR', 'CRITICAL');

-- =============================================================================
-- SECTION 4: RLS completeness (#564, #632, #633)
-- Enable Row Level Security on key domain tables and create idempotent policies
-- =============================================================================

-- Enable RLS on tasks (owned by event members)
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks FORCE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'tasks' AND policyname = 'rls_tasks_event_member'
  ) THEN
    CREATE POLICY rls_tasks_event_member ON tasks
      USING (
        event_id IN (
          SELECT e.id FROM events e
          WHERE e.created_by = NULLIF(current_setting('app.current_user_id', true), '')::int
          UNION
          SELECT em.event_id FROM event_members em
          WHERE em.user_id = NULLIF(current_setting('app.current_user_id', true), '')::int
        )
        OR created_by = NULLIF(current_setting('app.current_user_id', true), '')::int
        OR NULLIF(current_setting('app.current_user_id', true), '') IS NULL
      );
  END IF;
END $$;

-- Enable RLS on expenses
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses FORCE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'expenses' AND policyname = 'rls_expenses_event_member'
  ) THEN
    CREATE POLICY rls_expenses_event_member ON expenses
      USING (
        event_id IN (
          SELECT e.id FROM events e
          WHERE e.created_by = NULLIF(current_setting('app.current_user_id', true), '')::int
          UNION
          SELECT em.event_id FROM event_members em
          WHERE em.user_id = NULLIF(current_setting('app.current_user_id', true), '')::int
        )
        OR NULLIF(current_setting('app.current_user_id', true), '') IS NULL
      );
  END IF;
END $$;

-- Enable RLS on vendors
ALTER TABLE vendors ENABLE ROW LEVEL SECURITY;
ALTER TABLE vendors FORCE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'vendors' AND policyname = 'rls_vendors_event_member'
  ) THEN
    CREATE POLICY rls_vendors_event_member ON vendors
      USING (
        event_id IN (
          SELECT e.id FROM events e
          WHERE e.created_by = NULLIF(current_setting('app.current_user_id', true), '')::int
          UNION
          SELECT em.event_id FROM event_members em
          WHERE em.user_id = NULLIF(current_setting('app.current_user_id', true), '')::int
        )
        OR NULLIF(current_setting('app.current_user_id', true), '') IS NULL
      );
  END IF;
END $$;

-- Enable RLS on rsvps (guests see own, organizers see all for their events)
ALTER TABLE rsvps ENABLE ROW LEVEL SECURITY;
ALTER TABLE rsvps FORCE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'rsvps' AND policyname = 'rls_rsvps_access'
  ) THEN
    CREATE POLICY rls_rsvps_access ON rsvps
      USING (
        -- Own RSVP
        user_id = NULLIF(current_setting('app.current_user_id', true), '')::int
        -- Or event organizer/member
        OR event_id IN (
          SELECT e.id FROM events e
          WHERE e.created_by = NULLIF(current_setting('app.current_user_id', true), '')::int
          UNION
          SELECT em.event_id FROM event_members em
          WHERE em.user_id = NULLIF(current_setting('app.current_user_id', true), '')::int
        )
        OR NULLIF(current_setting('app.current_user_id', true), '') IS NULL
      );
  END IF;
END $$;

-- =============================================================================
-- SECTION 5: Audit column consistency (#564, #633)
-- Ensure all domain tables have the four audit columns:
-- created_at, updated_at, created_by, updated_by
-- =============================================================================

-- tasks
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL;

-- expenses
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL;

-- vendors
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL;

-- rsvps
ALTER TABLE rsvps ADD COLUMN IF NOT EXISTS updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL;

-- gallery_items (if exists)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'gallery_items') THEN
    EXECUTE 'ALTER TABLE gallery_items ADD COLUMN IF NOT EXISTS updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL';
  END IF;
END $$;

-- =============================================================================
-- ROLLBACK NOTES
-- To rollback this migration:
--
-- 1. Remove new roles:
--    DELETE FROM roles WHERE id IN (4, 5, 6);
--
-- 2. Remove audit_log columns:
--    ALTER TABLE audit_log DROP COLUMN IF EXISTS actor_id;
--    ALTER TABLE audit_log DROP COLUMN IF EXISTS target_type;
--    ALTER TABLE audit_log DROP COLUMN IF EXISTS target_id;
--    ALTER TABLE audit_log DROP COLUMN IF EXISTS context;
--    ALTER TABLE audit_log DROP COLUMN IF EXISTS severity;
--
-- 3. Disable RLS on tables:
--    ALTER TABLE tasks DISABLE ROW LEVEL SECURITY;
--    ALTER TABLE expenses DISABLE ROW LEVEL SECURITY;
--    ALTER TABLE vendors DISABLE ROW LEVEL SECURITY;
--    ALTER TABLE rsvps DISABLE ROW LEVEL SECURITY;
--    DROP POLICY IF EXISTS rls_tasks_event_member ON tasks;
--    DROP POLICY IF EXISTS rls_expenses_event_member ON expenses;
--    DROP POLICY IF EXISTS rls_vendors_event_member ON vendors;
--    DROP POLICY IF EXISTS rls_rsvps_access ON rsvps;
--
-- 4. Remove updated_by columns:
--    ALTER TABLE tasks DROP COLUMN IF EXISTS updated_by;
--    ALTER TABLE expenses DROP COLUMN IF EXISTS updated_by;
--    ALTER TABLE vendors DROP COLUMN IF EXISTS updated_by;
--    ALTER TABLE rsvps DROP COLUMN IF EXISTS updated_by;
-- =============================================================================
