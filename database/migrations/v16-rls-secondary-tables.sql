-- =============================================================
-- v16 — Explicit RLS policies on all secondary tables (#768)
--
-- The May-19 compliance review confirmed gaps across secondary tables.
-- This migration ensures ENABLE + FORCE RLS and explicit named policies
-- for every table listed in Task #768 acceptance criteria.
--
-- Tables covered (Task #768 list):
--   task_comments, task_subtasks, task_dependencies,
--   task_templates, task_time_entries
--   timeline_activities
--   shopping_lists, shopping_items, store_suggestions
--   rsvp_questions, rsvp_question_responses,
--   rsvp_access_tokens
--   gallery_albums,
--   gallery_slideshows, gallery_share_links, gallery_comments,
--   slideshow_items
--   communication_log,
--   communication_tracking_events, communication_templates
--   scheduled_reports, scheduled_report_deliveries
--   event_documents, event_messages, event_meal_options, event_custom_fields
--   attendance_events
--   vendor_communication_log, vendor_favorites, vendor_bookings,
--   vendor_payment_schedules
--
-- Policy shape (event-scoped tables):
--   The connecting role MAY see a row when:
--     a) app.current_user_id is unset (jobs / migrations / tests run without
--        user context — fail-open to preserve backward compatibility), OR
--     b) the row's event is owned by or shared with the current user via
--        events.created_by or event_members.
--
-- Idempotent: safe to run multiple times.
--   ALTER TABLE … ENABLE / FORCE ROW LEVEL SECURITY — harmless when already set.
--   CREATE POLICY uses DO $$ IF NOT EXISTS … END $$ guard.
-- =============================================================

-- ── Reusable event-member USING expression (declared as a SQL macro comment) ──
-- Pattern used by most event-scoped tables:
--   event_id IN (
--     SELECT e.id FROM events e
--     WHERE e.created_by = NULLIF(current_setting('app.current_user_id', true), '')::int
--     UNION
--     SELECT em.event_id FROM event_members em
--     WHERE em.user_id = NULLIF(current_setting('app.current_user_id', true), '')::int
--   )
--   OR NULLIF(current_setting('app.current_user_id', true), '') IS NULL

-- ─────────────────────────────────────────────────────────────────────────────
-- task_templates  (event_id → event membership)
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE task_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_templates FORCE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'task_templates'
      AND policyname = 'rls_task_templates_event_member'
  ) THEN
    CREATE POLICY rls_task_templates_event_member ON task_templates
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

-- ─────────────────────────────────────────────────────────────────────────────
-- task_time_entries  (task_id → tasks.event_id; user_id = the logger)
-- Visible to: the user who logged the entry OR any member of the parent event.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE task_time_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_time_entries FORCE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'task_time_entries'
      AND policyname = 'rls_task_time_entries_event_member'
  ) THEN
    CREATE POLICY rls_task_time_entries_event_member ON task_time_entries
      USING (
        user_id = NULLIF(current_setting('app.current_user_id', true), '')::int
        OR task_id IN (
          SELECT t.id FROM tasks t
          WHERE t.event_id IN (
            SELECT e.id FROM events e
            WHERE e.created_by = NULLIF(current_setting('app.current_user_id', true), '')::int
            UNION
            SELECT em.event_id FROM event_members em
            WHERE em.user_id = NULLIF(current_setting('app.current_user_id', true), '')::int
          )
        )
        OR NULLIF(current_setting('app.current_user_id', true), '') IS NULL
      );
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- rsvp_access_tokens  (rsvp_id → rsvps.event_id)
-- Visible to: event owner OR event member who can see the underlying RSVP.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE rsvp_access_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE rsvp_access_tokens FORCE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'rsvp_access_tokens'
      AND policyname = 'rls_rsvp_access_tokens_event_member'
  ) THEN
    CREATE POLICY rls_rsvp_access_tokens_event_member ON rsvp_access_tokens
      USING (
        rsvp_id IN (
          SELECT r.id FROM rsvps r
          WHERE r.event_id IN (
            SELECT e.id FROM events e
            WHERE e.created_by = NULLIF(current_setting('app.current_user_id', true), '')::int
            UNION
            SELECT em.event_id FROM event_members em
            WHERE em.user_id = NULLIF(current_setting('app.current_user_id', true), '')::int
          )
        )
        OR NULLIF(current_setting('app.current_user_id', true), '') IS NULL
      );
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- gallery_slideshows  (event_id → event membership)
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE gallery_slideshows ENABLE ROW LEVEL SECURITY;
ALTER TABLE gallery_slideshows FORCE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'gallery_slideshows'
      AND policyname = 'rls_gallery_slideshows_event_member'
  ) THEN
    CREATE POLICY rls_gallery_slideshows_event_member ON gallery_slideshows
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

-- ─────────────────────────────────────────────────────────────────────────────
-- gallery_share_links  (event_id → event membership)
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE gallery_share_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE gallery_share_links FORCE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'gallery_share_links'
      AND policyname = 'rls_gallery_share_links_event_member'
  ) THEN
    CREATE POLICY rls_gallery_share_links_event_member ON gallery_share_links
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

-- ─────────────────────────────────────────────────────────────────────────────
-- gallery_comments  (event_id → event membership)
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE gallery_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE gallery_comments FORCE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'gallery_comments'
      AND policyname = 'rls_gallery_comments_event_member'
  ) THEN
    CREATE POLICY rls_gallery_comments_event_member ON gallery_comments
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

-- ─────────────────────────────────────────────────────────────────────────────
-- slideshow_items  (slideshow_id → gallery_slideshows.event_id)
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE slideshow_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE slideshow_items FORCE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'slideshow_items'
      AND policyname = 'rls_slideshow_items_via_slideshow'
  ) THEN
    -- The parent gallery_slideshows table is itself RLS-protected;
    -- this subquery is therefore also filtered by the caller's context.
    CREATE POLICY rls_slideshow_items_via_slideshow ON slideshow_items
      USING (
        slideshow_id IN (
          SELECT gs.id FROM gallery_slideshows gs
          WHERE gs.event_id IN (
            SELECT e.id FROM events e
            WHERE e.created_by = NULLIF(current_setting('app.current_user_id', true), '')::int
            UNION
            SELECT em.event_id FROM event_members em
            WHERE em.user_id = NULLIF(current_setting('app.current_user_id', true), '')::int
          )
        )
        OR NULLIF(current_setting('app.current_user_id', true), '') IS NULL
      );
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- communication_tracking_events  (communication_log_id → communication_log.event_id)
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE communication_tracking_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE communication_tracking_events FORCE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'communication_tracking_events'
      AND policyname = 'rls_communication_tracking_events_via_log'
  ) THEN
    CREATE POLICY rls_communication_tracking_events_via_log ON communication_tracking_events
      USING (
        communication_log_id IN (
          SELECT cl.id FROM communication_log cl
          WHERE cl.event_id IN (
            SELECT e.id FROM events e
            WHERE e.created_by = NULLIF(current_setting('app.current_user_id', true), '')::int
            UNION
            SELECT em.event_id FROM event_members em
            WHERE em.user_id = NULLIF(current_setting('app.current_user_id', true), '')::int
          )
        )
        OR NULLIF(current_setting('app.current_user_id', true), '') IS NULL
      );
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- communication_templates
--   event_id nullable: NULL rows are global default templates (visible to all
--   authenticated users); non-NULL rows are event-scoped (event member only).
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE communication_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE communication_templates FORCE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'communication_templates'
      AND policyname = 'rls_communication_templates_event_or_global'
  ) THEN
    CREATE POLICY rls_communication_templates_event_or_global ON communication_templates
      USING (
        event_id IS NULL
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

-- ─────────────────────────────────────────────────────────────────────────────
-- scheduled_reports
--   event_id nullable: NULL rows are global / cross-event reports scoped to
--   their creator; non-NULL rows follow event membership.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE scheduled_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE scheduled_reports FORCE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'scheduled_reports'
      AND policyname = 'rls_scheduled_reports_event_or_creator'
  ) THEN
    CREATE POLICY rls_scheduled_reports_event_or_creator ON scheduled_reports
      USING (
        -- Global (no event) reports: visible only to their creator
        (event_id IS NULL
          AND created_by = NULLIF(current_setting('app.current_user_id', true), '')::int)
        -- Event-scoped reports: visible to event owner / member
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

-- ─────────────────────────────────────────────────────────────────────────────
-- scheduled_report_deliveries  (report_id → scheduled_reports)
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE scheduled_report_deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE scheduled_report_deliveries FORCE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'scheduled_report_deliveries'
      AND policyname = 'rls_scheduled_report_deliveries_via_report'
  ) THEN
    CREATE POLICY rls_scheduled_report_deliveries_via_report ON scheduled_report_deliveries
      USING (
        report_id IN (SELECT id FROM scheduled_reports)
        OR NULLIF(current_setting('app.current_user_id', true), '') IS NULL
      );
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- event_meal_options  (event_id → event membership)
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE event_meal_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_meal_options FORCE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'event_meal_options'
      AND policyname = 'rls_event_meal_options_event_member'
  ) THEN
    CREATE POLICY rls_event_meal_options_event_member ON event_meal_options
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

-- ─────────────────────────────────────────────────────────────────────────────
-- event_custom_fields  (event_id → event membership)
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE event_custom_fields ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_custom_fields FORCE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'event_custom_fields'
      AND policyname = 'rls_event_custom_fields_event_member'
  ) THEN
    CREATE POLICY rls_event_custom_fields_event_member ON event_custom_fields
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

-- ─────────────────────────────────────────────────────────────────────────────
-- attendance_events  (event_id → event membership)
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE attendance_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance_events FORCE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'attendance_events'
      AND policyname = 'rls_attendance_events_event_member'
  ) THEN
    CREATE POLICY rls_attendance_events_event_member ON attendance_events
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

-- ─────────────────────────────────────────────────────────────────────────────
-- vendor_communication_log  (event_id → event membership)
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE vendor_communication_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE vendor_communication_log FORCE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'vendor_communication_log'
      AND policyname = 'rls_vendor_communication_log_event_member'
  ) THEN
    CREATE POLICY rls_vendor_communication_log_event_member ON vendor_communication_log
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

-- ─────────────────────────────────────────────────────────────────────────────
-- vendor_bookings  (event_id → event membership)
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE vendor_bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE vendor_bookings FORCE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'vendor_bookings'
      AND policyname = 'rls_vendor_bookings_event_member'
  ) THEN
    CREATE POLICY rls_vendor_bookings_event_member ON vendor_bookings
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

-- ─────────────────────────────────────────────────────────────────────────────
-- vendor_payment_schedules  (event_id → event membership)
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE vendor_payment_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE vendor_payment_schedules FORCE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'vendor_payment_schedules'
      AND policyname = 'rls_vendor_payment_schedules_event_member'
  ) THEN
    CREATE POLICY rls_vendor_payment_schedules_event_member ON vendor_payment_schedules
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

-- ─────────────────────────────────────────────────────────────────────────────
-- Task #768 list items introduced earlier (v12/v13) are re-ensured here so
-- this migration remains self-sufficient for compliance checks.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE task_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_comments FORCE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'task_comments'
      AND policyname = 'rls_task_comments_event_member'
  ) THEN
    CREATE POLICY rls_task_comments_event_member ON task_comments
      USING (
        task_id IN (
          SELECT t.id FROM tasks t
          WHERE t.event_id IN (
            SELECT e.id FROM events e
            WHERE e.created_by = NULLIF(current_setting('app.current_user_id', true), '')::int
            UNION
            SELECT em.event_id FROM event_members em
            WHERE em.user_id = NULLIF(current_setting('app.current_user_id', true), '')::int
          )
        )
        OR NULLIF(current_setting('app.current_user_id', true), '') IS NULL
      );
  END IF;
END $$;

ALTER TABLE task_subtasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_subtasks FORCE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'task_subtasks'
      AND policyname = 'rls_task_subtasks_event_member'
  ) THEN
    CREATE POLICY rls_task_subtasks_event_member ON task_subtasks
      USING (
        task_id IN (
          SELECT t.id FROM tasks t
          WHERE t.event_id IN (
            SELECT e.id FROM events e
            WHERE e.created_by = NULLIF(current_setting('app.current_user_id', true), '')::int
            UNION
            SELECT em.event_id FROM event_members em
            WHERE em.user_id = NULLIF(current_setting('app.current_user_id', true), '')::int
          )
        )
        OR NULLIF(current_setting('app.current_user_id', true), '') IS NULL
      );
  END IF;
END $$;

ALTER TABLE task_dependencies ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_dependencies FORCE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'task_dependencies'
      AND policyname = 'rls_task_dependencies_event_member'
  ) THEN
    CREATE POLICY rls_task_dependencies_event_member ON task_dependencies
      USING (
        task_id IN (
          SELECT t.id FROM tasks t
          WHERE t.event_id IN (
            SELECT e.id FROM events e
            WHERE e.created_by = NULLIF(current_setting('app.current_user_id', true), '')::int
            UNION
            SELECT em.event_id FROM event_members em
            WHERE em.user_id = NULLIF(current_setting('app.current_user_id', true), '')::int
          )
        )
        OR NULLIF(current_setting('app.current_user_id', true), '') IS NULL
      );
  END IF;
END $$;

ALTER TABLE timeline_activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE timeline_activities FORCE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'timeline_activities'
      AND policyname = 'rls_timeline_activities_event_member'
  ) THEN
    CREATE POLICY rls_timeline_activities_event_member ON timeline_activities
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

ALTER TABLE shopping_lists ENABLE ROW LEVEL SECURITY;
ALTER TABLE shopping_lists FORCE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'shopping_lists'
      AND policyname = 'rls_shopping_lists_event_member'
  ) THEN
    CREATE POLICY rls_shopping_lists_event_member ON shopping_lists
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

ALTER TABLE shopping_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE shopping_items FORCE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'shopping_items'
      AND policyname = 'rls_shopping_items_list_member'
  ) THEN
    CREATE POLICY rls_shopping_items_list_member ON shopping_items
      USING (
        list_id IN (
          SELECT sl.id FROM shopping_lists sl
          WHERE sl.event_id IN (
            SELECT e.id FROM events e
            WHERE e.created_by = NULLIF(current_setting('app.current_user_id', true), '')::int
            UNION
            SELECT em.event_id FROM event_members em
            WHERE em.user_id = NULLIF(current_setting('app.current_user_id', true), '')::int
          )
        )
        OR NULLIF(current_setting('app.current_user_id', true), '') IS NULL
      );
  END IF;
END $$;

ALTER TABLE store_suggestions ENABLE ROW LEVEL SECURITY;
ALTER TABLE store_suggestions FORCE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'store_suggestions'
      AND policyname = 'rls_store_suggestions_event_member'
  ) THEN
    CREATE POLICY rls_store_suggestions_event_member ON store_suggestions
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

ALTER TABLE rsvp_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE rsvp_questions FORCE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'rsvp_questions'
      AND policyname = 'rls_rsvp_questions_event_member'
  ) THEN
    CREATE POLICY rls_rsvp_questions_event_member ON rsvp_questions
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

ALTER TABLE rsvp_question_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE rsvp_question_responses FORCE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'rsvp_question_responses'
      AND policyname = 'rls_rsvp_question_responses_access'
  ) THEN
    CREATE POLICY rls_rsvp_question_responses_access ON rsvp_question_responses
      USING (
        rsvp_id IN (
          SELECT r.id FROM rsvps r
          WHERE r.event_id IN (
            SELECT e.id FROM events e
            WHERE e.created_by = NULLIF(current_setting('app.current_user_id', true), '')::int
            UNION
            SELECT em.event_id FROM event_members em
            WHERE em.user_id = NULLIF(current_setting('app.current_user_id', true), '')::int
          )
        )
        OR NULLIF(current_setting('app.current_user_id', true), '') IS NULL
      );
  END IF;
END $$;

ALTER TABLE gallery_albums ENABLE ROW LEVEL SECURITY;
ALTER TABLE gallery_albums FORCE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'gallery_albums'
      AND policyname = 'rls_gallery_albums_event_member'
  ) THEN
    CREATE POLICY rls_gallery_albums_event_member ON gallery_albums
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

ALTER TABLE communication_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE communication_log FORCE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'communication_log'
      AND policyname = 'rls_communication_log_event_member'
  ) THEN
    CREATE POLICY rls_communication_log_event_member ON communication_log
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

ALTER TABLE event_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_documents FORCE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'event_documents'
      AND policyname = 'rls_event_documents_event_member'
  ) THEN
    CREATE POLICY rls_event_documents_event_member ON event_documents
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

ALTER TABLE event_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_messages FORCE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'event_messages'
      AND policyname = 'rls_event_messages_event_member'
  ) THEN
    CREATE POLICY rls_event_messages_event_member ON event_messages
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

ALTER TABLE vendor_favorites ENABLE ROW LEVEL SECURITY;
ALTER TABLE vendor_favorites FORCE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'vendor_favorites'
      AND policyname = 'rls_vendor_favorites_event_member'
  ) THEN
    CREATE POLICY rls_vendor_favorites_event_member ON vendor_favorites
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

-- =============================================================
-- ROLLBACK (reverse order)
--   DROP POLICY IF EXISTS rls_vendor_payment_schedules_event_member   ON vendor_payment_schedules;
--   DROP POLICY IF EXISTS rls_vendor_bookings_event_member            ON vendor_bookings;
--   DROP POLICY IF EXISTS rls_vendor_communication_log_event_member   ON vendor_communication_log;
--   DROP POLICY IF EXISTS rls_attendance_events_event_member          ON attendance_events;
--   DROP POLICY IF EXISTS rls_event_custom_fields_event_member        ON event_custom_fields;
--   DROP POLICY IF EXISTS rls_event_meal_options_event_member         ON event_meal_options;
--   DROP POLICY IF EXISTS rls_scheduled_report_deliveries_via_report  ON scheduled_report_deliveries;
--   DROP POLICY IF EXISTS rls_scheduled_reports_event_or_creator      ON scheduled_reports;
--   DROP POLICY IF EXISTS rls_communication_templates_event_or_global ON communication_templates;
--   DROP POLICY IF EXISTS rls_communication_tracking_events_via_log   ON communication_tracking_events;
--   DROP POLICY IF EXISTS rls_slideshow_items_via_slideshow           ON slideshow_items;
--   DROP POLICY IF EXISTS rls_gallery_comments_event_member           ON gallery_comments;
--   DROP POLICY IF EXISTS rls_gallery_share_links_event_member        ON gallery_share_links;
--   DROP POLICY IF EXISTS rls_gallery_slideshows_event_member         ON gallery_slideshows;
--   DROP POLICY IF EXISTS rls_rsvp_access_tokens_event_member         ON rsvp_access_tokens;
--   DROP POLICY IF EXISTS rls_task_time_entries_event_member          ON task_time_entries;
--   DROP POLICY IF EXISTS rls_task_templates_event_member             ON task_templates;
--   ALTER TABLE vendor_payment_schedules     DISABLE ROW LEVEL SECURITY;
--   ALTER TABLE vendor_bookings              DISABLE ROW LEVEL SECURITY;
--   ALTER TABLE vendor_communication_log     DISABLE ROW LEVEL SECURITY;
--   ALTER TABLE attendance_events            DISABLE ROW LEVEL SECURITY;
--   ALTER TABLE event_custom_fields          DISABLE ROW LEVEL SECURITY;
--   ALTER TABLE event_meal_options           DISABLE ROW LEVEL SECURITY;
--   ALTER TABLE scheduled_report_deliveries  DISABLE ROW LEVEL SECURITY;
--   ALTER TABLE scheduled_reports            DISABLE ROW LEVEL SECURITY;
--   ALTER TABLE communication_templates      DISABLE ROW LEVEL SECURITY;
--   ALTER TABLE communication_tracking_events DISABLE ROW LEVEL SECURITY;
--   ALTER TABLE slideshow_items              DISABLE ROW LEVEL SECURITY;
--   ALTER TABLE gallery_comments             DISABLE ROW LEVEL SECURITY;
--   ALTER TABLE gallery_share_links          DISABLE ROW LEVEL SECURITY;
--   ALTER TABLE gallery_slideshows           DISABLE ROW LEVEL SECURITY;
--   ALTER TABLE rsvp_access_tokens           DISABLE ROW LEVEL SECURITY;
--   ALTER TABLE task_time_entries            DISABLE ROW LEVEL SECURITY;
--   ALTER TABLE task_templates               DISABLE ROW LEVEL SECURITY;
-- =============================================================
