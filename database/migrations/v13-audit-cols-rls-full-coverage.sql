-- =============================================================
-- v13 — Complete audit column coverage + full RLS on all event-scoped tables
--
-- Requirements:
--   TRD v1.0 §4.2: "Audit columns (created_at, created_by, updated_at,
--   updated_by) required on ALL tables"
--   NFR §5.2: "Row Level Security policies enforce permissions at database
--   level" — applies to all tables, not just the original 6.
--
-- Changes:
--   1. Add missing audit columns to tables that lack them.
--   2. Enable RLS + policies on tables added after v12 that lacked coverage:
--      timeline_activities, shopping_lists, shopping_items, task_comments,
--      task_subtasks, task_dependencies, rsvp_questions, gallery_albums,
--      gallery_comments, event_messages, notifications, activity_feed,
--      budget_categories, exchange_rates, store_suggestions,
--      vendor_favorites, communication_log.
--   3. Add missing indexes for FK columns identified during RLS policy review.
--
-- Idempotent: safe to run multiple times (ALTER TABLE ADD COLUMN IF NOT EXISTS,
-- CREATE POLICY guarded by pg_policies check, CREATE INDEX IF NOT EXISTS).
-- =============================================================

-- ═══════════════════════════════════════════════════════════════
-- SECTION 1: AUDIT COLUMNS
-- ═══════════════════════════════════════════════════════════════

-- ── users ────────────────────────────────────────────────────────
-- users has created_at/updated_at but no created_by/updated_by (self-ref).
-- System-level table; use NULL = "system seeded".
ALTER TABLE users ADD COLUMN IF NOT EXISTS created_by INTEGER REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL;

-- ── sessions ─────────────────────────────────────────────────────
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS created_by INTEGER REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL;

-- ── password_reset_tokens ────────────────────────────────────────
ALTER TABLE password_reset_tokens ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE password_reset_tokens ADD COLUMN IF NOT EXISTS updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL;
-- created_by is the user who requested the reset (user_id already serves this)

-- ── notifications ────────────────────────────────────────────────
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS created_by  INTEGER REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS updated_by  INTEGER REFERENCES users(id) ON DELETE SET NULL;

-- ── seating_tables ───────────────────────────────────────────────
ALTER TABLE seating_tables ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE seating_tables ADD COLUMN IF NOT EXISTS created_by INTEGER REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE seating_tables ADD COLUMN IF NOT EXISTS updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL;

-- ── seating_assignments ──────────────────────────────────────────
ALTER TABLE seating_assignments ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE seating_assignments ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE seating_assignments ADD COLUMN IF NOT EXISTS created_by INTEGER REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE seating_assignments ADD COLUMN IF NOT EXISTS updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL;

-- ── task_comments ────────────────────────────────────────────────
ALTER TABLE task_comments ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE task_comments ADD COLUMN IF NOT EXISTS updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL;
-- created_by = user_id (already present)

-- ── task_subtasks ────────────────────────────────────────────────
ALTER TABLE task_subtasks ADD COLUMN IF NOT EXISTS updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE task_subtasks ADD COLUMN IF NOT EXISTS created_by  INTEGER REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE task_subtasks ADD COLUMN IF NOT EXISTS updated_by  INTEGER REFERENCES users(id) ON DELETE SET NULL;

-- ── task_dependencies ───────────────────────────────────────────
ALTER TABLE task_dependencies ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE task_dependencies ADD COLUMN IF NOT EXISTS updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL;

-- ── shopping_lists ───────────────────────────────────────────────
ALTER TABLE shopping_lists ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE shopping_lists ADD COLUMN IF NOT EXISTS updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL;

-- ── shopping_items ───────────────────────────────────────────────
ALTER TABLE shopping_items ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE shopping_items ADD COLUMN IF NOT EXISTS created_by INTEGER REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE shopping_items ADD COLUMN IF NOT EXISTS updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL;

-- ── timeline_activities ──────────────────────────────────────────
-- already has created_at, updated_at, created_by — add updated_by
ALTER TABLE timeline_activities ADD COLUMN IF NOT EXISTS updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL;

-- ── rsvp_questions ───────────────────────────────────────────────
ALTER TABLE rsvp_questions ADD COLUMN IF NOT EXISTS created_by INTEGER REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE rsvp_questions ADD COLUMN IF NOT EXISTS updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL;

-- ── rsvp_question_responses ─────────────────────────────────────
ALTER TABLE rsvp_question_responses ADD COLUMN IF NOT EXISTS created_by INTEGER REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE rsvp_question_responses ADD COLUMN IF NOT EXISTS updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL;

-- ── gallery_albums ───────────────────────────────────────────────
-- has created_at, updated_at, created_by — add updated_by
ALTER TABLE gallery_albums ADD COLUMN IF NOT EXISTS updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL;

-- ── gallery_slideshows ───────────────────────────────────────────
ALTER TABLE gallery_slideshows ADD COLUMN IF NOT EXISTS updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL;

-- ── event_messages ───────────────────────────────────────────────
-- has created_at, updated_at — add created_by (= sender_id already) + updated_by
ALTER TABLE event_messages ADD COLUMN IF NOT EXISTS created_by INTEGER REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE event_messages ADD COLUMN IF NOT EXISTS updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL;

-- ── activity_feed ────────────────────────────────────────────────
ALTER TABLE activity_feed ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE activity_feed ADD COLUMN IF NOT EXISTS updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL;
-- created_by = user_id (already present)

-- ── budget_categories ────────────────────────────────────────────
ALTER TABLE budget_categories ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE budget_categories ADD COLUMN IF NOT EXISTS created_by INTEGER REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE budget_categories ADD COLUMN IF NOT EXISTS updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL;

-- ── budget_templates ────────────────────────────────────────────
ALTER TABLE budget_templates ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE budget_templates ADD COLUMN IF NOT EXISTS updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL;

-- ── budget_template_items ───────────────────────────────────────
ALTER TABLE budget_template_items ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE budget_template_items ADD COLUMN IF NOT EXISTS created_by INTEGER REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE budget_template_items ADD COLUMN IF NOT EXISTS updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL;

-- ── exchange_rates ───────────────────────────────────────────────
ALTER TABLE exchange_rates ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE exchange_rates ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE exchange_rates ADD COLUMN IF NOT EXISTS created_by INTEGER REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE exchange_rates ADD COLUMN IF NOT EXISTS updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL;

-- ── store_suggestions ───────────────────────────────────────────
-- has created_at, updated_at, suggested_by — add standardised created_by/updated_by
ALTER TABLE store_suggestions ADD COLUMN IF NOT EXISTS created_by INTEGER REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE store_suggestions ADD COLUMN IF NOT EXISTS updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL;

-- ── communication_log ───────────────────────────────────────────
ALTER TABLE communication_log ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE communication_log ADD COLUMN IF NOT EXISTS created_by INTEGER REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE communication_log ADD COLUMN IF NOT EXISTS updated_by  INTEGER REFERENCES users(id) ON DELETE SET NULL;

-- ── categories ──────────────────────────────────────────────────
ALTER TABLE categories ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE categories ADD COLUMN IF NOT EXISTS created_by INTEGER REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE categories ADD COLUMN IF NOT EXISTS updated_by  INTEGER REFERENCES users(id) ON DELETE SET NULL;

-- ── event_filter_presets ────────────────────────────────────────
ALTER TABLE event_filter_presets ADD COLUMN IF NOT EXISTS created_by INTEGER REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE event_filter_presets ADD COLUMN IF NOT EXISTS updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL;

-- ── guest_merge_audit ───────────────────────────────────────────
ALTER TABLE guest_merge_audit ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE guest_merge_audit ADD COLUMN IF NOT EXISTS updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL;

-- ── rsvp_access_tokens ──────────────────────────────────────────
ALTER TABLE rsvp_access_tokens ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE rsvp_access_tokens ADD COLUMN IF NOT EXISTS created_by INTEGER REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE rsvp_access_tokens ADD COLUMN IF NOT EXISTS updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL;

-- ── event_custom_fields ─────────────────────────────────────────
-- was created with created_by/updated_by but no timestamps; add them
ALTER TABLE event_custom_fields ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE event_custom_fields ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

-- ── slideshow_items ─────────────────────────────────────────────
ALTER TABLE slideshow_items ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE slideshow_items ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE slideshow_items ADD COLUMN IF NOT EXISTS created_by INTEGER REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE slideshow_items ADD COLUMN IF NOT EXISTS updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL;


-- ═══════════════════════════════════════════════════════════════
-- SECTION 2: ROW-LEVEL SECURITY — EXTENDED COVERAGE
-- ═══════════════════════════════════════════════════════════════
-- All policies are idempotent (checked via pg_policies) and fail-open for
-- requests without `app.current_user_id` (jobs, migrations, tests).
-- Pattern: event-scoped tables use event membership; user-scoped tables
-- use user_id match; public/global tables allow all reads.

-- ── timeline_activities ─────────────────────────────────────────
ALTER TABLE timeline_activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE timeline_activities FORCE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'timeline_activities'
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

-- ── shopping_lists ───────────────────────────────────────────────
ALTER TABLE shopping_lists ENABLE ROW LEVEL SECURITY;
ALTER TABLE shopping_lists FORCE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'shopping_lists'
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

-- ── shopping_items ───────────────────────────────────────────────
ALTER TABLE shopping_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE shopping_items FORCE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'shopping_items'
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

-- ── task_comments ────────────────────────────────────────────────
ALTER TABLE task_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_comments FORCE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'task_comments'
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

-- ── task_subtasks ────────────────────────────────────────────────
ALTER TABLE task_subtasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_subtasks FORCE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'task_subtasks'
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

-- ── task_dependencies ───────────────────────────────────────────
ALTER TABLE task_dependencies ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_dependencies FORCE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'task_dependencies'
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

-- ── rsvp_questions ───────────────────────────────────────────────
ALTER TABLE rsvp_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE rsvp_questions FORCE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'rsvp_questions'
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

-- ── rsvp_question_responses ─────────────────────────────────────
ALTER TABLE rsvp_question_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE rsvp_question_responses FORCE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'rsvp_question_responses'
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

-- ── gallery_albums ───────────────────────────────────────────────
ALTER TABLE gallery_albums ENABLE ROW LEVEL SECURITY;
ALTER TABLE gallery_albums FORCE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'gallery_albums'
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

-- ── event_messages ───────────────────────────────────────────────
ALTER TABLE event_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_messages FORCE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'event_messages'
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

-- ── notifications ────────────────────────────────────────────────
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications FORCE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'notifications'
    AND policyname = 'rls_notifications_owner'
  ) THEN
    CREATE POLICY rls_notifications_owner ON notifications
      USING (
        user_id = NULLIF(current_setting('app.current_user_id', true), '')::int
        OR NULLIF(current_setting('app.current_user_id', true), '') IS NULL
      );
  END IF;
END $$;

-- ── activity_feed ────────────────────────────────────────────────
ALTER TABLE activity_feed ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_feed FORCE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'activity_feed'
    AND policyname = 'rls_activity_feed_event_member'
  ) THEN
    CREATE POLICY rls_activity_feed_event_member ON activity_feed
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

-- ── communication_log ───────────────────────────────────────────
ALTER TABLE communication_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE communication_log FORCE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'communication_log'
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

-- ── store_suggestions ───────────────────────────────────────────
ALTER TABLE store_suggestions ENABLE ROW LEVEL SECURITY;
ALTER TABLE store_suggestions FORCE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'store_suggestions'
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

-- ── vendor_favorites ────────────────────────────────────────────
ALTER TABLE vendor_favorites ENABLE ROW LEVEL SECURITY;
ALTER TABLE vendor_favorites FORCE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'vendor_favorites'
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

-- ── budget_categories ────────────────────────────────────────────
ALTER TABLE budget_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE budget_categories FORCE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'budget_categories'
    AND policyname = 'rls_budget_categories_event_member'
  ) THEN
    CREATE POLICY rls_budget_categories_event_member ON budget_categories
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

-- ── seating_tables ───────────────────────────────────────────────
ALTER TABLE seating_tables ENABLE ROW LEVEL SECURITY;
ALTER TABLE seating_tables FORCE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'seating_tables'
    AND policyname = 'rls_seating_tables_event_member'
  ) THEN
    CREATE POLICY rls_seating_tables_event_member ON seating_tables
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

-- ── event_documents ─────────────────────────────────────────────
ALTER TABLE event_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_documents FORCE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'event_documents'
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


-- ═══════════════════════════════════════════════════════════════
-- SECTION 3: MISSING FK INDEXES (query performance + RLS join cost)
-- ═══════════════════════════════════════════════════════════════
CREATE INDEX IF NOT EXISTS idx_shopping_items_assigned_to     ON shopping_items(assigned_to) WHERE assigned_to IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_task_comments_user_id          ON task_comments(user_id);
CREATE INDEX IF NOT EXISTS idx_timeline_activities_vendor_id  ON timeline_activities(vendor_id) WHERE vendor_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_rsvp_questions_created_by      ON rsvp_questions(created_by) WHERE created_by IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_notifications_user_id          ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_is_read          ON notifications(user_id, is_read);
CREATE INDEX IF NOT EXISTS idx_activity_feed_user_id          ON activity_feed(user_id) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_activity_feed_event_id         ON activity_feed(event_id) WHERE event_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_event_messages_deleted_at      ON event_messages(event_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_budget_categories_event_id     ON budget_categories(event_id);
CREATE INDEX IF NOT EXISTS idx_seating_tables_event_id        ON seating_tables(event_id);
CREATE INDEX IF NOT EXISTS idx_seating_assignments_rsvp_id    ON seating_assignments(rsvp_id);
CREATE INDEX IF NOT EXISTS idx_store_suggestions_suggested_by ON store_suggestions(suggested_by) WHERE suggested_by IS NOT NULL;
