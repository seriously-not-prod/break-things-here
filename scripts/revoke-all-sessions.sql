-- =============================================================================
-- Emergency Session Revocation Script
--
-- Use this against a PostgreSQL instance when a JWT/session secret is believed
-- to be compromised, or when you need to force all users to re-authenticate.
--
-- Usage:
--   psql "$DATABASE_URL" -f scripts/revoke-all-sessions.sql
--
-- What this script does:
--   1. Deletes all rows from the `sessions` table (invalidates all active sessions)
--   2. Cancels all pending (unused) password-reset tokens
--   3. Inserts an audit_log entry recording the emergency action
--
-- After running this script, restart the backend with new secrets so that any
-- tokens still in-flight (e.g. JWTs not yet expired) are also invalidated by
-- the new signing key.
--
-- See: docs/security/jwt-secrets.md — Section 4 (Emergency Revocation)
-- =============================================================================

BEGIN;

-- 1. Invalidate all active sessions
DELETE FROM sessions;

-- 2. Cancel all pending (unused) password-reset tokens
DELETE FROM password_reset_tokens
WHERE used_at IS NULL;

-- 3. Record the emergency action in the audit log
INSERT INTO audit_log (action, email, ip_address, created_at)
VALUES (
  'EMERGENCY_REVOKE_ALL_SESSIONS',
  'system',
  '0.0.0.0',
  NOW()
);

COMMIT;
