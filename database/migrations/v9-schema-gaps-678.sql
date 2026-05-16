-- Migration v9: Schema gaps from Technical Audit #678
-- Missing columns, tables, indexes, and constraints
-- All index creation uses CONCURRENTLY to avoid table locks on large datasets

-- ============================================================
-- SECTION 1: Missing columns
-- ============================================================

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS deactivated_at TIMESTAMP DEFAULT NULL;

ALTER TABLE vendor_bookings
  ADD COLUMN IF NOT EXISTS contract_expiry_date DATE DEFAULT NULL;

ALTER TABLE vendor_payment_schedules
  ADD COLUMN IF NOT EXISTS reminder_sent_at TIMESTAMP DEFAULT NULL;

ALTER TABLE exchange_rates
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMP DEFAULT NULL;

ALTER TABLE communication_log
  ADD COLUMN IF NOT EXISTS email_provider_message_id TEXT DEFAULT NULL;

-- ============================================================
-- SECTION 2: Missing tables
-- ============================================================

CREATE TABLE IF NOT EXISTS guest_groups (
  id           SERIAL PRIMARY KEY,
  event_id     INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  description  TEXT,
  created_by   INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS email_template_versions (
  id          SERIAL PRIMARY KEY,
  template_id INTEGER NOT NULL REFERENCES communication_templates(id) ON DELETE CASCADE,
  subject     TEXT NOT NULL,
  body        TEXT NOT NULL,
  version     INTEGER NOT NULL DEFAULT 1,
  created_by  INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS job_queue (
  id           SERIAL PRIMARY KEY,
  job_type     TEXT NOT NULL,
  payload      JSONB NOT NULL DEFAULT '{}',
  status       TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','running','completed','failed','cancelled')),
  attempts     INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 3,
  run_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  started_at   TIMESTAMP,
  completed_at TIMESTAMP,
  error        TEXT,
  created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS password_history (
  id            SERIAL PRIMARY KEY,
  user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  password_hash TEXT NOT NULL,
  created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS analytics_snapshots (
  id          SERIAL PRIMARY KEY,
  event_id    INTEGER REFERENCES events(id) ON DELETE CASCADE,
  snapshot_date DATE NOT NULL,
  metric_type TEXT NOT NULL,
  value       NUMERIC NOT NULL DEFAULT 0,
  metadata    JSONB DEFAULT '{}',
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (event_id, snapshot_date, metric_type)
);

-- ============================================================
-- SECTION 3: Missing indexes (CONCURRENTLY — safe on live data)
-- ============================================================

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tasks_due_date
  ON tasks(due_date);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tasks_assigned_user_id
  ON tasks(assigned_user_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_sessions_user_expires
  ON sessions(user_id, expires_at);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_rsvps_phone
  ON rsvps(phone);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_rsvps_waitlist_position
  ON rsvps(waitlist_position) WHERE waitlist_position IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_events_archived_at
  ON events(archived_at) WHERE archived_at IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_scheduled_reports_next_run
  ON scheduled_reports(next_run_at);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_audit_log_user_created
  ON audit_log(user_id, created_at);

-- ============================================================
-- SECTION 4: Missing constraints
-- ============================================================

ALTER TABLE events
  DROP CONSTRAINT IF EXISTS chk_events_capacity_non_negative,
  ADD CONSTRAINT chk_events_capacity_non_negative
    CHECK (capacity IS NULL OR capacity >= 0);

ALTER TABLE expense_receipt_ocr
  DROP CONSTRAINT IF EXISTS chk_ocr_confidence_range,
  ADD CONSTRAINT chk_ocr_confidence_range
    CHECK (confidence IS NULL OR (confidence BETWEEN 0 AND 1));

ALTER TABLE vendor_payment_schedules
  DROP CONSTRAINT IF EXISTS chk_payment_amount_positive,
  ADD CONSTRAINT chk_payment_amount_positive
    CHECK (amount > 0);

-- ============================================================
-- SECTION 5: Fix non-atomic view_count on gallery_share_links
-- Replace any future UPDATE SET view_count = view_count + 1 usage with this.
-- The function is used by the gallery controller.
-- ============================================================

CREATE OR REPLACE FUNCTION increment_share_link_view(p_token TEXT)
RETURNS VOID AS $$
  UPDATE gallery_share_links
  SET    view_count = view_count + 1
  WHERE  token = p_token;
$$ LANGUAGE sql;

