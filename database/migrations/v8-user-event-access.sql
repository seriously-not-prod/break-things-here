-- =============================================================
-- v8 — User Event Access / Scoped Event Membership
-- Purpose:
--   Ensure Collaborator, Guest, Viewer roles exist so non-admin
--   users can be assigned to specific events and only see those
--   events.  event_members already exists; this migration just
--   ensures role rows are present and adds a helpful view.
-- =============================================================

-- 1. Ensure extended roles exist (idempotent)
INSERT INTO roles (name, description) VALUES
  ('Collaborator', 'Event collaborator with limited management access'),
  ('Guest',        'Guest user with RSVP and view access'),
  ('Viewer',       'Read-only viewer')
ON CONFLICT (name) DO NOTHING;

-- 2. Ensure event_members index exists (idempotent)
CREATE INDEX IF NOT EXISTS idx_event_members_user_id  ON event_members(user_id);
CREATE INDEX IF NOT EXISTS idx_event_members_event_id ON event_members(event_id);

-- 3. Convenience view: users with their accessible event count
CREATE OR REPLACE VIEW v_user_event_access AS
SELECT
  u.id            AS user_id,
  u.email,
  u.display_name,
  r.name          AS role_name,
  r.id            AS role_id,
  -- Admins/Organizers see all events; others only assigned ones
  CASE WHEN r.id IN (2, 3)   -- Organizer, Admin
       THEN (SELECT COUNT(*) FROM events WHERE deleted_at IS NULL)
       ELSE (SELECT COUNT(*) FROM event_members em WHERE em.user_id = u.id)
  END             AS accessible_event_count
FROM users u
JOIN roles r ON u.role_id = r.id
WHERE u.deleted_at IS NULL;
