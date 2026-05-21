-- Migration v11: TIMESTAMPTZ fix-up for high-risk expiry/deadline columns (#664 follow-up)
-- (Renamed from v10 to avoid filename collision with v10-event-time-field.sql from PR #706.)
--
-- PR #698 fixed the DST/TZ-offset bug class for `sessions.expires_at`,
-- `sessions.last_activity`, and `password_reset_tokens.*` by switching those
-- columns to TIMESTAMPTZ. The post-merge review identified **five** sibling
-- columns with the same class of bug — they are compared against `NOW()` /
-- `CURRENT_TIMESTAMP` in authorisation paths and so silently drift by the
-- session TZ offset whenever the DB session is not UTC:
--
--   • users.locked_until                — account-lockout release check
--   • users.pending_email_token_expiry  — email-change verification token TTL
--   • events.rsvp_deadline              — public RSVP cutoff enforcement
--   • rsvps.rsvp_deadline               — per-RSVP deadline override
--   • password_reset_rate_limit.window_start — sliding-window rate limit
--
-- This migration promotes each to TIMESTAMPTZ in place, interpreting the
-- existing TIMESTAMP value as UTC (which matches how `CURRENT_TIMESTAMP`
-- writes them on a UTC server). Each block is a no-op when the column is
-- already `timestamp with time zone`, so the migration is safe to re-run.
--
-- The application-side `runMigrations()` performs the same conversion at
-- startup; this file exists so DBAs running prod databases that bypass the
-- app-managed migration path can apply the change directly.
--
-- Lock-window caveat: ALTER COLUMN TYPE acquires an ACCESS EXCLUSIVE lock by
-- definition (CONCURRENTLY is not supported for ALTER COLUMN TYPE). The
-- auth-side tables (`users`, `password_reset_rate_limit`) are typically
-- small. However, `events` and `rsvps` grow with application usage and the
-- ALTER also rewrites their row layout. For deployments with large
-- `events`/`rsvps` tables, schedule this migration in a maintenance window
-- and consider running it inside a short transaction with `lock_timeout`
-- set defensively, since writers will be blocked for the duration.

-- ============================================================
-- users.locked_until
-- ============================================================
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'users'
      AND column_name = 'locked_until'
      AND data_type = 'timestamp without time zone'
  ) THEN
    ALTER TABLE users
      ALTER COLUMN locked_until TYPE TIMESTAMPTZ
      USING locked_until AT TIME ZONE 'UTC';
  END IF;
END $$;

-- ============================================================
-- users.pending_email_token_expiry
-- ============================================================
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'users'
      AND column_name = 'pending_email_token_expiry'
      AND data_type = 'timestamp without time zone'
  ) THEN
    ALTER TABLE users
      ALTER COLUMN pending_email_token_expiry TYPE TIMESTAMPTZ
      USING pending_email_token_expiry AT TIME ZONE 'UTC';
  END IF;
END $$;

-- ============================================================
-- events.rsvp_deadline
-- ============================================================
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'events'
      AND column_name = 'rsvp_deadline'
      AND data_type = 'timestamp without time zone'
  ) THEN
    ALTER TABLE events
      ALTER COLUMN rsvp_deadline TYPE TIMESTAMPTZ
      USING rsvp_deadline AT TIME ZONE 'UTC';
  END IF;
END $$;

-- ============================================================
-- rsvps.rsvp_deadline
-- ============================================================
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'rsvps'
      AND column_name = 'rsvp_deadline'
      AND data_type = 'timestamp without time zone'
  ) THEN
    ALTER TABLE rsvps
      ALTER COLUMN rsvp_deadline TYPE TIMESTAMPTZ
      USING rsvp_deadline AT TIME ZONE 'UTC';
  END IF;
END $$;

-- ============================================================
-- password_reset_rate_limit.window_start
-- ============================================================
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'password_reset_rate_limit'
      AND column_name = 'window_start'
      AND data_type = 'timestamp without time zone'
  ) THEN
    ALTER TABLE password_reset_rate_limit
      ALTER COLUMN window_start TYPE TIMESTAMPTZ
      USING window_start AT TIME ZONE 'UTC';
  END IF;
END $$;
