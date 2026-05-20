-- ============================================================================
-- v22: Notification preferences — channel × category matrix  (#786)
-- ============================================================================
-- Replaces the per-type boolean columns (email_enabled, in_app_enabled,
-- push_enabled) with a normalised (user_id, channel, category, enabled) model.
-- This lets users opt out of specific channels per notification category.
--
-- Steps:
--   1. Rename the legacy table so existing code can be migrated incrementally.
--   2. Create the new `notification_preferences` table with the required schema.
--   3. Migrate existing preference data into the new format.
--   4. Seed default-enabled rows for every existing user × channel × category
--      combination that does not already exist.
-- ============================================================================

BEGIN;

-- ── Step 1: Rename legacy table ──────────────────────────────────────────────
ALTER TABLE IF EXISTS notification_preferences
  RENAME TO notification_type_preferences;

ALTER INDEX IF EXISTS idx_notif_pref_user_id
  RENAME TO idx_notif_type_pref_user_id;

-- ── Step 2: Create new normalised table ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS notification_preferences (
  id         SERIAL       PRIMARY KEY,
  user_id    INTEGER      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  channel    TEXT         NOT NULL CHECK (channel IN ('email', 'in_app')),
  category   TEXT         NOT NULL CHECK (category IN (
    'task_due', 'task_overdue', 'task_assigned', 'budget_alert',
    'rsvp_submitted', 'event_update', 'chat_message', 'event_reminder'
  )),
  enabled    BOOLEAN      NOT NULL DEFAULT TRUE,
  updated_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (user_id, channel, category)
);

CREATE INDEX idx_notif_pref_user ON notification_preferences(user_id);

-- ── Step 3: Migrate data from legacy table ───────────────────────────────────
-- Flatten the old boolean columns into individual channel rows.
INSERT INTO notification_preferences (user_id, channel, category, enabled)
SELECT user_id, 'email', notification_type, email_enabled
FROM   notification_type_preferences
WHERE  notification_type IN (
  'task_due', 'task_overdue', 'task_assigned', 'budget_alert',
  'rsvp_submitted', 'event_update', 'chat_message', 'event_reminder'
)
ON CONFLICT (user_id, channel, category) DO NOTHING;

INSERT INTO notification_preferences (user_id, channel, category, enabled)
SELECT user_id, 'in_app', notification_type, in_app_enabled
FROM   notification_type_preferences
WHERE  notification_type IN (
  'task_due', 'task_overdue', 'task_assigned', 'budget_alert',
  'rsvp_submitted', 'event_update', 'chat_message', 'event_reminder'
)
ON CONFLICT (user_id, channel, category) DO NOTHING;

-- ── Step 4: Seed default-enabled rows for all existing users ─────────────────
-- Every user gets an enabled row for every channel × category combination that
-- does not already have a preference recorded.
INSERT INTO notification_preferences (user_id, channel, category, enabled)
SELECT u.id, ch.channel, cat.category, TRUE
FROM   users u
CROSS JOIN (VALUES ('email'), ('in_app')) AS ch(channel)
CROSS JOIN (VALUES
  ('task_due'), ('task_overdue'), ('task_assigned'), ('budget_alert'),
  ('rsvp_submitted'), ('event_update'), ('chat_message'), ('event_reminder')
) AS cat(category)
WHERE  u.deleted_at IS NULL
ON CONFLICT (user_id, channel, category) DO NOTHING;

COMMIT;
