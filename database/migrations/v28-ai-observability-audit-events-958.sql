-- v28 — Issue #958: AI Observability and Audit Events
--
-- Creates the ai_audit_events table used to record structured audit trails
-- for every user-triggered AI action.  Tracks outcome, provider, latency,
-- HTTP status, retry count, and a privacy-safe error description.
--
-- Privacy guarantees:
--   * No PII fields are stored.  Only user_id (FK), workflow_type, entity_id,
--     provider, outcome, timing, and a pre-sanitised error message are kept.
--   * safe_error_message must never contain free-text from user input.
--
-- Indexes support:
--   * Reverse-chronological audit queries (occurred_at DESC)
--   * Per-user audit review (user_id)
--   * Outcome filtering for alerting and SLO queries (outcome)
--   * Workflow-scoped failure analysis (workflow_type)

CREATE TABLE IF NOT EXISTS ai_audit_events (
  id                  SERIAL PRIMARY KEY,
  user_id             INTEGER REFERENCES users(id) ON DELETE SET NULL,
  workflow_type       TEXT    NOT NULL,
  entity_id           INTEGER,
  provider            TEXT    NOT NULL,
  duration_ms         INTEGER NOT NULL DEFAULT 0,
  outcome             TEXT    NOT NULL
                        CHECK (outcome IN (
                          'success',
                          'failure',
                          'rate_limited',
                          'timed_out'
                        )),
  http_status         INTEGER,
  safe_error_message  TEXT,
  retry_count         INTEGER NOT NULL DEFAULT 0,
  occurred_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_audit_events_occurred_at
  ON ai_audit_events (occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_audit_events_user_id
  ON ai_audit_events (user_id);

CREATE INDEX IF NOT EXISTS idx_ai_audit_events_outcome
  ON ai_audit_events (outcome);

CREATE INDEX IF NOT EXISTS idx_ai_audit_events_workflow_type
  ON ai_audit_events (workflow_type);
