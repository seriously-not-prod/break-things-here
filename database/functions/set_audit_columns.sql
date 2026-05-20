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
