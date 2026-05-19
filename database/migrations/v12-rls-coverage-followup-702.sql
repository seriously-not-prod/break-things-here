-- =============================================================
-- v12 — RLS coverage follow-up for the v10/story-523 tables (#702)
--
-- The post-merge review of #702 flagged that the v10 schema added four new
-- tables (task_assignees, task_escalation_rules, timeline_templates,
-- timeline_template_items, entity_change_history) without RLS policies,
-- even though the rest of the event-scoped surface is gated by RLS.
--
-- Pattern matches the v2 migration:
--   - ENABLE + FORCE row level security so the policies apply to all roles
--     (including non-BYPASSRLS ones used in production)
--   - Each policy carries a fail-open clause for "no context" — so jobs,
--     migrations, and tests that connect without setting
--     `app.current_user_id` continue to see every row.
--   - Idempotent: re-running this file is a no-op (CREATE POLICY guarded
--     by pg_policies existence check; ALTER TABLE ENABLE ... is harmless
--     when already enabled).
-- =============================================================

-- ─── task_assignees ───────────────────────────────────────────────
ALTER TABLE task_assignees ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_assignees FORCE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'task_assignees' AND policyname = 'rls_task_assignees_access'
  ) THEN
    CREATE POLICY rls_task_assignees_access ON task_assignees
      USING (
        user_id = NULLIF(current_setting('app.current_user_id', true), '')::int
        OR task_id IN (
          SELECT t.id FROM tasks t
          JOIN event_members em ON em.event_id = t.event_id
          WHERE em.user_id = NULLIF(current_setting('app.current_user_id', true), '')::int
        )
        OR NULLIF(current_setting('app.current_user_id', true), '') IS NULL
      );
  END IF;
END $$;

-- ─── task_escalation_rules ────────────────────────────────────────
ALTER TABLE task_escalation_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_escalation_rules FORCE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'task_escalation_rules' AND policyname = 'rls_task_escalation_rules_event_member'
  ) THEN
    CREATE POLICY rls_task_escalation_rules_event_member ON task_escalation_rules
      USING (
        event_id IN (
          SELECT event_id FROM event_members
          WHERE user_id = NULLIF(current_setting('app.current_user_id', true), '')::int
        )
        OR NULLIF(current_setting('app.current_user_id', true), '') IS NULL
      );
  END IF;
END $$;

-- Missing FK index flagged in the same review.
CREATE INDEX IF NOT EXISTS idx_task_escalation_rules_escalate_to_user
  ON task_escalation_rules(escalate_to_user_id)
  WHERE escalate_to_user_id IS NOT NULL;

-- ─── timeline_templates ───────────────────────────────────────────
-- Templates are cross-event blueprints — visibility is by `is_public` or
-- ownership, not by event membership.
ALTER TABLE timeline_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE timeline_templates FORCE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'timeline_templates' AND policyname = 'rls_timeline_templates_public_or_owner'
  ) THEN
    CREATE POLICY rls_timeline_templates_public_or_owner ON timeline_templates
      USING (
        is_public = TRUE
        OR created_by = NULLIF(current_setting('app.current_user_id', true), '')::int
        OR NULLIF(current_setting('app.current_user_id', true), '') IS NULL
      );
  END IF;
END $$;

-- ─── timeline_template_items ──────────────────────────────────────
ALTER TABLE timeline_template_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE timeline_template_items FORCE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'timeline_template_items' AND policyname = 'rls_timeline_template_items_via_template'
  ) THEN
    -- Inherits template visibility: the subquery itself is RLS-filtered, so
    -- the sub-row is only visible when the parent template is visible.
    CREATE POLICY rls_timeline_template_items_via_template ON timeline_template_items
      USING (
        template_id IN (SELECT id FROM timeline_templates)
        OR NULLIF(current_setting('app.current_user_id', true), '') IS NULL
      );
  END IF;
END $$;

-- ─── entity_change_history ────────────────────────────────────────
-- Append-only audit log. Reads are scoped to the actor — admins can still
-- query via the no-context branch (DB-superuser scripts / reporting jobs).
ALTER TABLE entity_change_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE entity_change_history FORCE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'entity_change_history' AND policyname = 'rls_entity_change_history_actor'
  ) THEN
    CREATE POLICY rls_entity_change_history_actor ON entity_change_history
      USING (
        changed_by = NULLIF(current_setting('app.current_user_id', true), '')::int
        OR NULLIF(current_setting('app.current_user_id', true), '') IS NULL
      );
  END IF;
END $$;

-- =============================================================
-- ROLLBACK
--   ALTER TABLE task_assignees           DISABLE ROW LEVEL SECURITY;
--   ALTER TABLE task_escalation_rules    DISABLE ROW LEVEL SECURITY;
--   ALTER TABLE timeline_templates       DISABLE ROW LEVEL SECURITY;
--   ALTER TABLE timeline_template_items  DISABLE ROW LEVEL SECURITY;
--   ALTER TABLE entity_change_history    DISABLE ROW LEVEL SECURITY;
--   DROP POLICY IF EXISTS rls_task_assignees_access                   ON task_assignees;
--   DROP POLICY IF EXISTS rls_task_escalation_rules_event_member      ON task_escalation_rules;
--   DROP POLICY IF EXISTS rls_timeline_templates_public_or_owner      ON timeline_templates;
--   DROP POLICY IF EXISTS rls_timeline_template_items_via_template    ON timeline_template_items;
--   DROP POLICY IF EXISTS rls_entity_change_history_actor             ON entity_change_history;
-- =============================================================
