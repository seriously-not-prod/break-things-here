-- ============================================================
-- Issue #910: Fix CRUD regressions from rsvps.status column removal
-- ============================================================
-- This migration script documents and applies any remaining schema-level
-- guards to ensure the system is consistent after the status→canonical_status
-- collapse from issue #770.
--
-- Code-level fixes applied alongside this migration (in the same PR):
--   1. backend/src/db/database.ts: wrap legacy status backfill in a
--      PL/pgSQL DO $$ block so it only references `status` when the column
--      still exists (fixes 11 failing test suites).
--   2. backend/src/controllers/rsvps-controller.ts:
--      - Capacity query: status = 'Going' → canonical_status = 'confirmed'
--      - Export SELECT: removed `status` column reference
--      - IMPORT_TEMPLATE_COLUMNS: replaced 'status' with 'canonical_status'
--   3. frontend/src/services/guest-records-service.ts: new service exposing
--      /api/events/:eventId/guest-records CRUD to the frontend.
--   4. frontend/src/components/guests/guest-records-panel.tsx: new UI tab.
-- ============================================================

BEGIN;

-- Guard: ensure canonical_status has a NOT NULL constraint and valid-value
-- CHECK constraint on any database that completed the v21 migration but may
-- not have applied the full constraint set (e.g., test databases seeded
-- before constraints were added).
DO $$
BEGIN
  -- Ensure NOT NULL
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'rsvps'
      AND column_name = 'canonical_status'
      AND is_nullable = 'YES'
  ) THEN
    -- Default any remaining NULLs before adding constraint
    UPDATE rsvps SET canonical_status = 'pending'
    WHERE canonical_status IS NULL OR canonical_status = '';

    ALTER TABLE rsvps ALTER COLUMN canonical_status SET NOT NULL;
  END IF;

  -- Ensure CHECK constraint
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'check_canonical_status_values'
      AND conrelid = 'rsvps'::regclass
  ) THEN
    ALTER TABLE rsvps ADD CONSTRAINT check_canonical_status_values CHECK (
      canonical_status IN (
        'pending', 'confirmed', 'declined', 'maybe',
        'waitlist', 'cancelled', 'checked_in', 'no_show'
      )
    );
  END IF;
END
$$;

-- Ensure the capacity index exists on canonical_status + waitlist_position
-- so the updated capacity query is performant.
CREATE INDEX IF NOT EXISTS idx_rsvps_canonical_status_capacity
  ON rsvps (event_id, canonical_status, waitlist_position)
  WHERE waitlist_position IS NULL;

COMMIT;
