-- ============================================================
-- Issue #770: Collapse dual RSVP status columns to single source of truth
-- ============================================================
-- This migration makes `canonical_status` the single source of truth for RSVP status.
-- The legacy `status` column is dropped, and `canonical_status` is now NOT NULL
-- with a CHECK constraint to ensure valid values.
--
-- Changes:
-- 1. Backfill any remaining NULL canonical_status values from legacy status
-- 2. Add NOT NULL and CHECK constraints to canonical_status
-- 3. Drop the legacy status column
-- ============================================================

BEGIN;

-- Step 1: Backfill any NULL canonical_status values from legacy status or context
-- Guard against databases where the legacy status column has already been dropped.
-- Uses EXECUTE for dynamic SQL so the reference to the legacy `status` column is
-- only resolved at runtime (inside the IF branch), not at compile time.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'rsvps' AND column_name = 'status'
  ) THEN
    EXECUTE $sql$
      UPDATE rsvps SET canonical_status = CASE
        WHEN canonical_status IS NOT NULL AND canonical_status <> '' THEN canonical_status
        WHEN waitlist_position IS NOT NULL THEN 'waitlist'
        WHEN checked_in = TRUE THEN 'checked_in'
        WHEN LOWER(status) IN ('going','yes','confirmed','accepted') THEN 'confirmed'
        WHEN LOWER(status) IN ('not going','declined','no','rejected') THEN 'declined'
        WHEN LOWER(status) IN ('maybe','tentative') THEN 'maybe'
        WHEN LOWER(status) IN ('cancelled','canceled') THEN 'cancelled'
        WHEN LOWER(status) IN ('pending','invited','sent') THEN 'pending'
        ELSE 'pending'
      END
      WHERE canonical_status IS NULL OR canonical_status = ''
    $sql$;
  ELSE
    -- No legacy status column; just ensure any NULLs are defaulted
    UPDATE rsvps SET canonical_status = 'pending'
    WHERE canonical_status IS NULL OR canonical_status = '';
  END IF;
END
$$;

-- Step 2: Add NOT NULL constraint and CHECK constraint if not already present
DO $$
BEGIN
  -- Set NOT NULL if column is currently nullable
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'rsvps' AND column_name = 'canonical_status' AND is_nullable = 'YES'
  ) THEN
    ALTER TABLE rsvps ALTER COLUMN canonical_status SET NOT NULL;
  END IF;

  -- Add CHECK constraint if not already present
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'check_canonical_status_values'
      AND conrelid = 'rsvps'::regclass
  ) THEN
    ALTER TABLE rsvps ADD CONSTRAINT check_canonical_status_values CHECK (canonical_status IN (
      'pending', 'confirmed', 'declined', 'maybe',
      'waitlist', 'cancelled', 'checked_in', 'no_show'
    ));
  END IF;
END
$$;

-- Step 3: Drop the legacy status column if it still exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'rsvps' AND column_name = 'status'
  ) THEN
    ALTER TABLE rsvps DROP COLUMN status;
  END IF;
END
$$;

-- Step 4: Add helpful comment to clarify the canonical_status column
COMMENT ON COLUMN rsvps.canonical_status IS 
  'Canonical RSVP status: single source of truth. Values: pending, confirmed, declined, maybe, waitlist, cancelled, checked_in, no_show';

COMMIT;
