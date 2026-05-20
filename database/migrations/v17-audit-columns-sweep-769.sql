-- v17: Task #769 audit-column sweep
--
-- Acceptance criteria:
-- 1) Every public table has created_at, created_by, updated_at, updated_by
-- 2) Generic set_audit_columns() trigger fills updated_at/updated_by from
--    app.current_user_id context
-- 3) Historical rows are preserved; new writes must provide actor attribution
--    either explicitly or through app.current_user_id
-- 4) Verification query returns 0 rows

CREATE OR REPLACE FUNCTION public.set_audit_columns()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  current_user_id INTEGER;
BEGIN
  current_user_id := NULLIF(current_setting('app.current_user_id', true), '')::INTEGER;

  IF TG_OP = 'INSERT' THEN
    NEW.created_at := COALESCE(NEW.created_at, CURRENT_TIMESTAMP);
    NEW.updated_at := COALESCE(NEW.updated_at, CURRENT_TIMESTAMP);
    NEW.created_by := COALESCE(NEW.created_by, current_user_id);
    NEW.updated_by := COALESCE(NEW.updated_by, NEW.created_by, current_user_id);
  ELSE
    NEW.updated_at := CURRENT_TIMESTAMP;
    NEW.updated_by := COALESCE(
      current_user_id,
      NEW.updated_by,
      OLD.updated_by,
      NEW.created_by,
      OLD.created_by
    );
  END IF;

  RETURN NEW;
END;
$$;

DO $$
DECLARE
  t RECORD;
  missing_count INTEGER;
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
      'ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ',
      t.table_name
    );
    EXECUTE format(
      'ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS created_by INTEGER',
      t.table_name
    );
    EXECUTE format(
      'ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ',
      t.table_name
    );
    EXECUTE format(
      'ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS updated_by INTEGER',
      t.table_name
    );

    EXECUTE format(
      'ALTER TABLE public.%I ALTER COLUMN created_at SET DEFAULT CURRENT_TIMESTAMP',
      t.table_name
    );
    EXECUTE format(
      'ALTER TABLE public.%I ALTER COLUMN updated_at SET DEFAULT CURRENT_TIMESTAMP',
      t.table_name
    );
    EXECUTE format(
      'ALTER TABLE public.%I ALTER COLUMN created_by SET DEFAULT NULLIF(current_setting(''app.current_user_id'', true), '''')::INTEGER',
      t.table_name
    );
    EXECUTE format(
      'ALTER TABLE public.%I ALTER COLUMN updated_by SET DEFAULT NULLIF(current_setting(''app.current_user_id'', true), '''')::INTEGER',
      t.table_name
    );

    EXECUTE format('DROP TRIGGER IF EXISTS trg_set_audit_columns ON public.%I', t.table_name);
    EXECUTE format(
      'CREATE TRIGGER trg_set_audit_columns BEFORE INSERT OR UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.set_audit_columns()',
      t.table_name
    );
  END LOOP;

  WITH public_tables AS (
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_type = 'BASE TABLE'
      AND table_name NOT LIKE 'pg_%'
      AND table_name NOT LIKE 'sql_%'
  ),
  audit_presence AS (
    SELECT
      pt.table_name,
      COUNT(*) FILTER (
        WHERE c.column_name IN ('created_at', 'created_by', 'updated_at', 'updated_by')
      ) AS required_column_count
    FROM public_tables pt
    LEFT JOIN information_schema.columns c
      ON c.table_schema = 'public'
      AND c.table_name = pt.table_name
    GROUP BY pt.table_name
  )
  SELECT COUNT(*)
  INTO missing_count
  FROM audit_presence
  WHERE required_column_count < 4;

  IF missing_count > 0 THEN
    RAISE EXCEPTION
      'Audit sweep verification failed: % public tables still missing one or more audit columns',
      missing_count;
  END IF;
END $$;
