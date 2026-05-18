-- =============================================================
-- Migration: v3 BRD Tasks / Timeline / Collaboration / Notification Parity
-- Issues: #532 #555 #556 #557 #558 #559
--         #603 #604 #605 #606 #612 #613 #614 #615 #616
--         #623 #624 #625 #626 #627 #628 #629
-- =============================================================

-- ── #604: Extend task status lifecycle ────────────────────────────────────────
-- Add Cancelled and Verification states
ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_status_check;
ALTER TABLE tasks ADD CONSTRAINT tasks_status_check
  CHECK (status IN ('Pending', 'In Progress', 'Blocked', 'Complete', 'Cancelled', 'Verification'));

ALTER TABLE tasks ADD COLUMN IF NOT EXISTS cancelled_reason   TEXT;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS verified_by        INTEGER REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS verified_at        TIMESTAMP;

-- ── #603: Multi-assignee support ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS task_assignees (
  id          SERIAL PRIMARY KEY,
  task_id     INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  assigned_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(task_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_task_assignees_task_id ON task_assignees(task_id);
CREATE INDEX IF NOT EXISTS idx_task_assignees_user_id ON task_assignees(user_id);

-- ── #605: Overdue escalation policy ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS task_escalation_policies (
  id                   SERIAL PRIMARY KEY,
  event_id             INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  overdue_hours        INTEGER NOT NULL DEFAULT 24,
  escalate_to_user_id  INTEGER REFERENCES users(id) ON DELETE SET NULL,
  escalate_to_role_id  INTEGER REFERENCES roles(id) ON DELETE SET NULL,
  notify_on_escalation BOOLEAN DEFAULT TRUE,
  created_by           INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at           TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at           TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_escalation_event_id ON task_escalation_policies(event_id);

ALTER TABLE tasks ADD COLUMN IF NOT EXISTS escalated_at   TIMESTAMP;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS escalated_to   INTEGER REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS overdue_notified_at TIMESTAMP;

-- ── #613: Timeline templates by event type ───────────────────────────────────
CREATE TABLE IF NOT EXISTS timeline_templates (
  id          SERIAL PRIMARY KEY,
  name        TEXT NOT NULL,
  description TEXT,
  event_type  TEXT,
  is_global   BOOLEAN DEFAULT FALSE,
  created_by  INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS timeline_template_activities (
  id                  SERIAL PRIMARY KEY,
  template_id         INTEGER NOT NULL REFERENCES timeline_templates(id) ON DELETE CASCADE,
  title               TEXT NOT NULL,
  description         TEXT,
  offset_minutes      INTEGER NOT NULL DEFAULT 0,
  duration_minutes    INTEGER NOT NULL DEFAULT 60,
  buffer_before_mins  INTEGER NOT NULL DEFAULT 0,
  buffer_after_mins   INTEGER NOT NULL DEFAULT 0,
  location            TEXT,
  sort_order          INTEGER DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_tt_activities_template_id ON timeline_template_activities(template_id);

-- ── #614: Timeline buffer-time configuration ──────────────────────────────────
ALTER TABLE timeline_activities ADD COLUMN IF NOT EXISTS buffer_before_mins INTEGER NOT NULL DEFAULT 0;
ALTER TABLE timeline_activities ADD COLUMN IF NOT EXISTS buffer_after_mins  INTEGER NOT NULL DEFAULT 0;

-- ── #612: Drag-and-drop sort order already exists (sort_order column)
-- Ensure index for efficient reorder queries
CREATE INDEX IF NOT EXISTS idx_timeline_event_sort ON timeline_activities(event_id, sort_order);

-- ── #623: Notification preferences per notification type ─────────────────────
CREATE TABLE IF NOT EXISTS notification_preferences (
  id                SERIAL PRIMARY KEY,
  user_id           INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  notification_type TEXT NOT NULL,
  email_enabled     BOOLEAN DEFAULT TRUE,
  in_app_enabled    BOOLEAN DEFAULT TRUE,
  push_enabled      BOOLEAN DEFAULT FALSE,
  created_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, notification_type)
);

CREATE INDEX IF NOT EXISTS idx_notif_pref_user_id ON notification_preferences(user_id);

-- ── #624: Notification batching / anti-spam ───────────────────────────────────
CREATE TABLE IF NOT EXISTS notification_batch_rules (
  id                  SERIAL PRIMARY KEY,
  notification_type   TEXT NOT NULL UNIQUE,
  batch_window_mins   INTEGER NOT NULL DEFAULT 15,
  max_per_window      INTEGER NOT NULL DEFAULT 5,
  created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Seed default batch rules
INSERT INTO notification_batch_rules (notification_type, batch_window_mins, max_per_window)
VALUES
  ('task_due',          60,  3),
  ('task_overdue',      30,  5),
  ('budget_alert',      60,  2),
  ('rsvp_submitted',    15, 10),
  ('event_update',      30,  5),
  ('chat_message',       5, 20),
  ('task_assigned',     15,  5)
ON CONFLICT (notification_type) DO NOTHING;

ALTER TABLE notifications ADD COLUMN IF NOT EXISTS notification_type TEXT;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS batch_key         TEXT;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS batch_count       INTEGER DEFAULT 1;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS delivered_at      TIMESTAMP;

CREATE INDEX IF NOT EXISTS idx_notifications_batch_key ON notifications(batch_key) WHERE batch_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_notifications_delivered  ON notifications(user_id, delivered_at);

-- ── #627: Conflict resolution / optimistic locking ────────────────────────────
ALTER TABLE tasks              ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE timeline_activities ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE events             ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1;

-- ── #626: Collaborative editing presence indicators ───────────────────────────
CREATE TABLE IF NOT EXISTS edit_sessions (
  id           SERIAL PRIMARY KEY,
  entity_type  TEXT NOT NULL,  -- 'task' | 'event' | 'timeline_activity'
  entity_id    INTEGER NOT NULL,
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  started_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_seen_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(entity_type, entity_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_edit_sessions_entity ON edit_sessions(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_edit_sessions_user   ON edit_sessions(user_id);

-- ── #628: Event team chat ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS event_chat_messages (
  id          SERIAL PRIMARY KEY,
  event_id    INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body        TEXT NOT NULL,
  reply_to_id INTEGER REFERENCES event_chat_messages(id) ON DELETE SET NULL,
  edited_at   TIMESTAMP,
  deleted_at  TIMESTAMP,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_chat_event_id   ON event_chat_messages(event_id);
CREATE INDEX IF NOT EXISTS idx_chat_created_at ON event_chat_messages(event_id, created_at DESC);

-- ── #629: Version history and rollback ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS entity_versions (
  id           SERIAL PRIMARY KEY,
  entity_type  TEXT NOT NULL,
  entity_id    INTEGER NOT NULL,
  version      INTEGER NOT NULL,
  snapshot     JSONB NOT NULL,
  changed_by   INTEGER REFERENCES users(id) ON DELETE SET NULL,
  change_note  TEXT,
  created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_entity_versions_lookup ON entity_versions(entity_type, entity_id, version DESC);
