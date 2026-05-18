-- Migration v9: Schema gaps from Technical Audit #678
-- Missing columns, tables, indexes, and constraints
-- Note: this file is now applied at startup by backend/src/db/database.ts:runMigrations().

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
-- SECTION 3: Missing indexes (plain CREATE INDEX IF NOT EXISTS — safe to re-run)
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_tasks_due_date
  ON tasks(due_date);

CREATE INDEX IF NOT EXISTS idx_tasks_assigned_user_id
  ON tasks(assigned_user_id);

CREATE INDEX IF NOT EXISTS idx_sessions_user_expires
  ON sessions(user_id, expires_at);

CREATE INDEX IF NOT EXISTS idx_rsvps_phone
  ON rsvps(phone);

CREATE INDEX IF NOT EXISTS idx_rsvps_waitlist_position
  ON rsvps(waitlist_position) WHERE waitlist_position IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_events_archived_at
  ON events(archived_at) WHERE archived_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_scheduled_reports_next_run
  ON scheduled_reports(next_run_at);

CREATE INDEX IF NOT EXISTS idx_audit_log_user_created
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


-- v9.1: Additions for #665 — resend verification rate limiting
ALTER TABLE users ADD COLUMN IF NOT EXISTS resend_verification_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS resend_verification_window_start TIMESTAMPTZ;

-- Sessions: Entra back-channel logout support (#665)
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS entra_sid TEXT;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS entra_sub TEXT;
CREATE INDEX IF NOT EXISTS idx_sessions_entra_sid ON sessions(entra_sid) WHERE entra_sid IS NOT NULL;

-- v9.2: Schema additions for all completion stories (#665-#681)

-- communication_log: email tracking fields (#671)
ALTER TABLE communication_log ADD COLUMN IF NOT EXISTS opened BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE communication_log ADD COLUMN IF NOT EXISTS opened_at TIMESTAMPTZ;
ALTER TABLE communication_log ADD COLUMN IF NOT EXISTS recipient_email TEXT;
ALTER TABLE communication_log ADD COLUMN IF NOT EXISTS body TEXT;
ALTER TABLE communication_log ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;

-- users: deactivation and email unsubscribe (#677, #671, #665)
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_unsubscribed BOOLEAN NOT NULL DEFAULT false;

-- exchange_rates: staleness tracking (#668) — already added in v9.0 if not exists
ALTER TABLE exchange_rates ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- vendor_payment_schedules: reminder tracking (#669) — already added in v9.0 if not exists
ALTER TABLE vendor_payment_schedules ADD COLUMN IF NOT EXISTS reminder_sent_at TIMESTAMPTZ;

-- scheduled_reports: next run tracking (#673, #676)
ALTER TABLE scheduled_reports ADD COLUMN IF NOT EXISTS last_run_at TIMESTAMPTZ;
ALTER TABLE scheduled_reports ADD COLUMN IF NOT EXISTS next_run_at TIMESTAMPTZ;

-- Index for scheduled_reports dispatch
CREATE INDEX IF NOT EXISTS idx_scheduled_reports_next_run
  ON scheduled_reports(next_run_at) WHERE is_active = true;

-- guest_groups: #667 — ensure table exists
CREATE TABLE IF NOT EXISTS guest_groups (
  id            SERIAL PRIMARY KEY,
  event_id      INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  description   TEXT,
  created_by    INTEGER REFERENCES users(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_guest_groups_event_id ON guest_groups(event_id);

-- guest_group_members: #667
CREATE TABLE IF NOT EXISTS guest_group_members (
  group_id  INTEGER NOT NULL REFERENCES guest_groups(id) ON DELETE CASCADE,
  rsvp_id   INTEGER NOT NULL REFERENCES rsvps(id) ON DELETE CASCADE,
  PRIMARY KEY (group_id, rsvp_id)
);
