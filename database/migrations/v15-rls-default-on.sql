-- v15-rls-default-on.sql
-- Task #767: enable RLS by default and retire runtime pilot toggles.
--
-- This migration is idempotent. It ensures all currently managed event-scoped
-- tables stay in ENABLE + FORCE RLS mode.

DO $$
DECLARE
  tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'events',
    'event_members',
    'tasks',
    'expenses',
    'vendors',
    'rsvps',
    'task_assignees',
    'task_escalation_rules',
    'timeline_templates',
    'timeline_template_items',
    'entity_change_history'
  ]
  LOOP
    IF EXISTS (
      SELECT 1
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = tbl
    ) THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', tbl);
      EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', tbl);
    END IF;
  END LOOP;
END $$;
