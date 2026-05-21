-- v14: universal audit columns + universal RLS baseline coverage
--
-- Goal:
-- 1) Ensure every public table has created_at/created_by/updated_at/updated_by columns.
-- 2) Ensure every public table has RLS enabled with at least one baseline policy.
--
-- Notes:
-- - This migration is idempotent.
-- - Existing explicit policies remain untouched; this only adds a baseline
--   `rls_auto_scope` policy when absent.

DO $$
DECLARE
  t RECORD;
  has_event_id BOOLEAN;
  has_user_id BOOLEAN;
  has_created_by BOOLEAN;
  policy_condition TEXT;
BEGIN
  FOR t IN
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_type = 'BASE TABLE'
      AND table_name NOT LIKE 'pg_%'
      AND table_name NOT LIKE 'sql_%'
  LOOP
    EXECUTE format(
      'ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP',
      t.table_name
    );

    EXECUTE format(
      'ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP',
      t.table_name
    );

    EXECUTE format(
      'ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS created_by INTEGER',
      t.table_name
    );

    EXECUTE format(
      'ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS updated_by INTEGER',
      t.table_name
    );

    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t.table_name);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', t.table_name);

    SELECT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = t.table_name
        AND column_name = 'event_id'
    ) INTO has_event_id;

    SELECT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = t.table_name
        AND column_name = 'user_id'
    ) INTO has_user_id;

    SELECT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = t.table_name
        AND column_name = 'created_by'
    ) INTO has_created_by;

    IF has_event_id THEN
      policy_condition :=
        'NULLIF(current_setting(''app.current_user_id'', true), '''') IS NULL OR ' ||
        'event_id IN (' ||
        'SELECT e.id FROM events e ' ||
        'WHERE e.created_by = NULLIF(current_setting(''app.current_user_id'', true), '''')::int ' ||
        'UNION ' ||
        'SELECT em.event_id FROM event_members em ' ||
        'WHERE em.user_id = NULLIF(current_setting(''app.current_user_id'', true), '''')::int' ||
        ')';
    ELSIF has_user_id THEN
      policy_condition :=
        'NULLIF(current_setting(''app.current_user_id'', true), '''') IS NULL OR ' ||
        'user_id = NULLIF(current_setting(''app.current_user_id'', true), '''')::int';
    ELSIF has_created_by THEN
      policy_condition :=
        'NULLIF(current_setting(''app.current_user_id'', true), '''') IS NULL OR ' ||
        'created_by = NULLIF(current_setting(''app.current_user_id'', true), '''')::int';
    ELSE
      policy_condition := 'true';
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = t.table_name
        AND policyname = 'rls_auto_scope'
    ) THEN
      EXECUTE format(
        'CREATE POLICY rls_auto_scope ON public.%I FOR ALL USING (%s) WITH CHECK (%s)',
        t.table_name,
        policy_condition,
        policy_condition
      );
    END IF;
  END LOOP;
END $$;
