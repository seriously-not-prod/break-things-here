-- =============================================================
-- v10 — Foundation schema for story #523
--      (BRD parity for tasks, timeline, and collaboration).
--
-- Schema only — no controller wiring lives in this PR.
-- Mirrored by backend/src/db/database.ts:runMigrations() so app
-- startup applies the same delta. Every statement is idempotent
-- so re-running this file against an already-migrated database
-- is a no-op.
-- =============================================================

-- ─── 1. task_assignees (M:N replacement for tasks.assigned_user_id) ────
CREATE TABLE IF NOT EXISTS task_assignees (
  task_id     INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  is_primary  BOOLEAN NOT NULL DEFAULT FALSE,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (task_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_task_assignees_user ON task_assignees(user_id);

-- Backfill: copy the existing single assignee in as the primary row.
-- ON CONFLICT DO NOTHING means re-runs after B1.2 starts double-writing
-- won't clobber later state.
INSERT INTO task_assignees (task_id, user_id, is_primary)
SELECT id, assigned_user_id, TRUE
  FROM tasks
 WHERE assigned_user_id IS NOT NULL
ON CONFLICT DO NOTHING;

-- ─── 2. task_escalation_rules ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS task_escalation_rules (
  id                   SERIAL PRIMARY KEY,
  event_id             INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  status               TEXT NOT NULL,
  threshold_hours      INTEGER NOT NULL CHECK (threshold_hours > 0),
  escalate_to_user_id  INTEGER REFERENCES users(id) ON DELETE SET NULL,
  active               BOOLEAN NOT NULL DEFAULT TRUE,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_task_escalation_rules_event
  ON task_escalation_rules(event_id) WHERE active = TRUE;

-- ─── 3. timeline_templates + items ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS timeline_templates (
  id          SERIAL PRIMARY KEY,
  name        TEXT NOT NULL,
  description TEXT,
  event_type  TEXT,
  created_by  INTEGER REFERENCES users(id) ON DELETE SET NULL,
  is_public   BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS timeline_template_items (
  id               SERIAL PRIMARY KEY,
  template_id      INTEGER NOT NULL REFERENCES timeline_templates(id) ON DELETE CASCADE,
  title            TEXT NOT NULL,
  description      TEXT,
  offset_minutes   INTEGER NOT NULL,
  duration_minutes INTEGER NOT NULL DEFAULT 0,
  buffer_minutes   INTEGER NOT NULL DEFAULT 0,
  sort_order       INTEGER NOT NULL DEFAULT 0,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_timeline_template_items_template
  ON timeline_template_items(template_id);

-- Buffer-time slack on existing timeline_activities rows.
ALTER TABLE timeline_activities
  ADD COLUMN IF NOT EXISTS buffer_minutes INTEGER NOT NULL DEFAULT 0;

-- ─── 4. entity_change_history (versioned, append-only, used by rollback) ─
CREATE TABLE IF NOT EXISTS entity_change_history (
  id            BIGSERIAL PRIMARY KEY,
  entity_type   TEXT NOT NULL,
  entity_id     TEXT NOT NULL,
  version       INTEGER NOT NULL,
  changed_by    INTEGER REFERENCES users(id) ON DELETE SET NULL,
  change_action TEXT NOT NULL CHECK (change_action IN ('create','update','delete')),
  before        JSONB,
  after         JSONB,
  changed_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (entity_type, entity_id, version)
);
CREATE INDEX IF NOT EXISTS idx_entity_change_history_entity
  ON entity_change_history(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_entity_change_history_changed_at
  ON entity_change_history(changed_at DESC);
