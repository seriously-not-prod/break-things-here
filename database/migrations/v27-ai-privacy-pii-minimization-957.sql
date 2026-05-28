-- =============================================================================
-- Migration: AI Data Privacy and PII Minimization — Issue #957
-- Applied: idempotent (safe to run on fresh or existing databases)
-- =============================================================================
-- Creates the ai_privacy_events table used to record PII detection, field
-- redaction, and payload-filtering events across all AI workflows.
-- This table supports compliance audit trails and privacy-incident review.
-- =============================================================================

CREATE TABLE IF NOT EXISTS ai_privacy_events (
  id             SERIAL PRIMARY KEY,
  user_id        INTEGER REFERENCES users(id) ON DELETE SET NULL,
  event_type     TEXT NOT NULL
                   CHECK (event_type IN (
                     'pii_detected',
                     'field_redacted',
                     'payload_filtered',
                     'log_sanitised'
                   )),
  workflow_type  TEXT NOT NULL,
  entity_id      INTEGER,
  pii_categories JSONB NOT NULL DEFAULT '[]'::jsonb,
  field_names    JSONB NOT NULL DEFAULT '[]'::jsonb,
  detail         TEXT NOT NULL DEFAULT '',
  occurred_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index to support per-user privacy-event queries (compliance reports).
CREATE INDEX IF NOT EXISTS idx_ai_privacy_events_user_id
  ON ai_privacy_events (user_id)
  WHERE user_id IS NOT NULL;

-- Index to support time-range queries on the audit trail.
CREATE INDEX IF NOT EXISTS idx_ai_privacy_events_occurred_at
  ON ai_privacy_events (occurred_at DESC);

-- Index to support filtering by event type (e.g. all pii_detected events).
CREATE INDEX IF NOT EXISTS idx_ai_privacy_events_event_type
  ON ai_privacy_events (event_type);
