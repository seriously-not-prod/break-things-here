-- =============================================================
-- v22 — Task #771: guests first-class table
--
-- TRD §4.2 lists `guests` as a core table; the live schema only carried
-- guest information inside `rsvps` and exposed a compatibility VIEW.
-- This migration:
--   1. Drops the VIEW (must happen before creating the real table).
--   2. Creates the `guests` table with full audit columns and RLS policies.
--   3. Adds `rsvps.guest_id` FK referencing `guests.id`.
--   4. Backfills one `guests` row per existing RSVP (no orphaned RSVPs).
--   5. Verifies zero orphaned RSVPs after the change.
--
-- Idempotent: safe to re-run.
-- =============================================================

-- ── Step 1: Remove the VIEW so we can create a real TABLE ─────────
-- `DROP VIEW IF EXISTS` still errors when `guests` exists as a TABLE,
-- so guard on relkind='v' to keep reruns idempotent.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'guests'
      AND c.relkind = 'v'
  ) THEN
    EXECUTE 'DROP VIEW public.guests';
  END IF;
END $$;

-- ── Step 2: Create the guests table ──────────────────────────────
CREATE TABLE IF NOT EXISTS guests (
  id                   SERIAL PRIMARY KEY,
  event_id             INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  name                 TEXT NOT NULL,
  email                TEXT NOT NULL,
  phone                TEXT,
  dietary_restriction  TEXT DEFAULT 'None',
  accessibility_needs  TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_by           INTEGER REFERENCES users(id) ON DELETE SET NULL,
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_by           INTEGER REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_guests_event_id ON guests(event_id);
CREATE INDEX IF NOT EXISTS idx_guests_email    ON guests(email);

-- ── Step 3: Add guest_id FK to rsvps ─────────────────────────────
-- ON DELETE SET NULL: removing a guest profile does not delete the RSVP,
-- so no orphaned RSVPs can be introduced.
ALTER TABLE rsvps
  ADD COLUMN IF NOT EXISTS guest_id INTEGER REFERENCES guests(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_rsvps_guest_id ON rsvps(guest_id)
  WHERE guest_id IS NOT NULL;

-- ── Step 4: Backfill — one guests row per existing RSVP ──────────
-- Only insert where no guest_id is set yet (idempotent).
DO $$
DECLARE
  r RECORD;
  new_guest_id INTEGER;
BEGIN
  FOR r IN
    SELECT id, event_id, name, email, phone, dietary_restriction, accessibility_needs
    FROM   rsvps
    WHERE  guest_id IS NULL
  LOOP
    INSERT INTO guests (event_id, name, email, phone, dietary_restriction, accessibility_needs)
    VALUES (r.event_id, r.name, r.email, r.phone, COALESCE(r.dietary_restriction, 'None'), r.accessibility_needs)
    RETURNING id INTO new_guest_id;

    UPDATE rsvps SET guest_id = new_guest_id WHERE id = r.id;
  END LOOP;
END $$;

-- ── Step 5: Verify no orphaned RSVPs ─────────────────────────────
DO $$
DECLARE
  orphan_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO orphan_count
  FROM rsvps
  WHERE guest_id IS NULL;

  IF orphan_count > 0 THEN
    RAISE EXCEPTION
      'guests backfill incomplete: % rsvp row(s) still have NULL guest_id',
      orphan_count;
  END IF;
END $$;

-- ── Step 6: RLS policies on guests ───────────────────────────────
-- Pattern: event owner (events.created_by) or event member may see/mutate
-- a row.  No user context (migrations/jobs/tests) → fail-open.
ALTER TABLE guests ENABLE ROW LEVEL SECURITY;
ALTER TABLE guests FORCE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'guests'
      AND policyname = 'rls_guests_event_member'
  ) THEN
    CREATE POLICY rls_guests_event_member ON guests
      USING (
        event_id IN (
          SELECT e.id FROM events e
          WHERE  e.created_by = NULLIF(current_setting('app.current_user_id', true), '')::int
          UNION
          SELECT em.event_id FROM event_members em
          WHERE  em.user_id = NULLIF(current_setting('app.current_user_id', true), '')::int
        )
        OR NULLIF(current_setting('app.current_user_id', true), '') IS NULL
      );
  END IF;
END $$;
