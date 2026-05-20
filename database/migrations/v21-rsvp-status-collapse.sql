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
UPDATE rsvps SET canonical_status = CASE
  WHEN canonical_status IS NOT NULL THEN canonical_status
  WHEN waitlist_position IS NOT NULL THEN 'waitlist'
  WHEN checked_in = TRUE THEN 'checked_in'
  WHEN LOWER(status) IN ('going','yes','confirmed','accepted') THEN 'confirmed'
  WHEN LOWER(status) IN ('not going','declined','no','rejected') THEN 'declined'
  WHEN LOWER(status) IN ('maybe','tentative') THEN 'maybe'
  WHEN LOWER(status) IN ('cancelled','canceled') THEN 'cancelled'
  WHEN LOWER(status) IN ('pending','invited','sent') THEN 'pending'
  ELSE 'pending'
END
WHERE canonical_status IS NULL OR canonical_status = '';

-- Step 2: Add NOT NULL constraint by recreating the column
-- (PostgreSQL doesn't allow direct constraint modification)
ALTER TABLE rsvps 
  ALTER COLUMN canonical_status SET NOT NULL,
  ADD CONSTRAINT check_canonical_status_values CHECK (canonical_status IN (
    'pending', 'confirmed', 'declined', 'maybe', 
    'waitlist', 'cancelled', 'checked_in', 'no_show'
  ));

-- Step 3: Drop the legacy status column (source of truth is now canonical_status only)
ALTER TABLE rsvps 
  DROP COLUMN status;

-- Step 4: Add helpful comment to clarify the canonical_status column
COMMENT ON COLUMN rsvps.canonical_status IS 
  'Canonical RSVP status: single source of truth. Values: pending, confirmed, declined, maybe, waitlist, cancelled, checked_in, no_show';

COMMIT;
