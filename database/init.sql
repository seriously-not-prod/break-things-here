-- Festival Event Planner - PostgreSQL Database Initialization
-- This script is loaded automatically by the PostgreSQL container on first startup.
-- The application also runs its own migrations via database.ts on each startup,
-- so this file serves as an authoritative schema reference.

-- ============================================================
-- Users
-- ============================================================
CREATE TABLE IF NOT EXISTS users (
  id                        SERIAL PRIMARY KEY,
  email                     TEXT UNIQUE NOT NULL,
  password_hash             TEXT NOT NULL,
  display_name              TEXT NOT NULL,
  email_verified            INTEGER DEFAULT 0,
  email_verified_at         TIMESTAMP,
  email_verification_token  TEXT,
  pending_email             TEXT,
  pending_email_token       TEXT,
  pending_email_token_expiry TIMESTAMPTZ,
  role_id                   INTEGER DEFAULT 1,
  account_locked            INTEGER DEFAULT 0,
  locked_until              TIMESTAMPTZ,
  login_attempts            INTEGER DEFAULT 0,
  created_at                TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at                TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  deleted_at                TIMESTAMP
);

-- ============================================================
-- Sessions
-- ============================================================
CREATE TABLE IF NOT EXISTS sessions (
  id             SERIAL PRIMARY KEY,
  user_id        INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token          TEXT NOT NULL UNIQUE,
  refresh_token  TEXT NOT NULL UNIQUE,
  expires_at     TIMESTAMPTZ NOT NULL,
  last_activity  TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  created_at     TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- Password reset
-- ============================================================
CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id          SERIAL PRIMARY KEY,
  user_id     INTEGER REFERENCES users(id) ON DELETE SET NULL,
  email       TEXT NOT NULL,
  token       TEXT NOT NULL UNIQUE,
  expires_at  TIMESTAMPTZ NOT NULL,
  used        INTEGER DEFAULT 0,
  used_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS password_reset_rate_limit (
  id             SERIAL PRIMARY KEY,
  email          TEXT NOT NULL UNIQUE,
  request_count  INTEGER DEFAULT 1,
  window_start   TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- Audit log
-- ============================================================
CREATE TABLE IF NOT EXISTS audit_log (
  id          SERIAL PRIMARY KEY,
  user_id     INTEGER REFERENCES users(id) ON DELETE SET NULL,
  email       TEXT,
  action      TEXT NOT NULL,
  description TEXT,
  ip_address  TEXT,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- Roles & permissions (RBAC)
-- ============================================================
CREATE TABLE IF NOT EXISTS roles (
  id          SERIAL PRIMARY KEY,
  name        TEXT UNIQUE NOT NULL,
  description TEXT,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO roles (id, name, description) VALUES
  (1, 'Attendee',  'Default role for new users'),
  (2, 'Organizer', 'Can create and manage events'),
  (3, 'Admin',     'Full system access')
ON CONFLICT (id) DO NOTHING;

SELECT setval('roles_id_seq', GREATEST((SELECT MAX(id) FROM roles), 3));

CREATE TABLE IF NOT EXISTS permissions (
  id          SERIAL PRIMARY KEY,
  name        TEXT UNIQUE NOT NULL,
  description TEXT,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS role_permissions (
  role_id       INTEGER NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission_id INTEGER NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
  PRIMARY KEY (role_id, permission_id)
);

INSERT INTO permissions (name, description) VALUES
  ('users.view',    'View user profiles'),
  ('users.edit',    'Edit user profiles'),
  ('users.delete',  'Delete users'),
  ('events.view',   'View events'),
  ('events.create', 'Create events'),
  ('events.edit',   'Edit events'),
  ('events.delete', 'Delete events'),
  ('roles.view',    'View roles'),
  ('roles.manage',  'Manage roles and permissions')
ON CONFLICT (name) DO NOTHING;

-- ============================================================
-- User profiles
-- ============================================================
CREATE TABLE IF NOT EXISTS user_profiles (
  id                SERIAL PRIMARY KEY,
  user_id           INTEGER UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  bio               TEXT,
  phone_number      TEXT,
  profile_photo_url TEXT,
  address           TEXT,
  city              TEXT,
  state             TEXT,
  zip_code          TEXT,
  country           TEXT,
  created_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- Events
-- ============================================================
CREATE TABLE IF NOT EXISTS events (
  id          SERIAL PRIMARY KEY,
  title       TEXT NOT NULL,
  date        TEXT NOT NULL,
  location    TEXT NOT NULL,
  description TEXT,
  capacity    INTEGER,
  status      TEXT CHECK(status IN ('Draft', 'Active', 'Completed')) DEFAULT 'Draft',
  created_by  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  deleted_at  TIMESTAMP
);

ALTER TABLE events ADD COLUMN IF NOT EXISTS cover_image_url TEXT;
ALTER TABLE events ADD COLUMN IF NOT EXISTS event_type TEXT DEFAULT 'Other';
ALTER TABLE events ADD COLUMN IF NOT EXISTS is_public BOOLEAN DEFAULT FALSE;
ALTER TABLE events ADD COLUMN IF NOT EXISTS rsvp_deadline TIMESTAMPTZ;
ALTER TABLE events ADD COLUMN IF NOT EXISTS tags TEXT;
ALTER TABLE events ADD COLUMN IF NOT EXISTS end_date TEXT;
-- Story #664, Item 10: required event time field (HH:MM format)
ALTER TABLE events ADD COLUMN IF NOT EXISTS event_time TEXT;
-- Story #414: map-backed location + waitlist indicators
ALTER TABLE events ADD COLUMN IF NOT EXISTS latitude  DOUBLE PRECISION;
ALTER TABLE events ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION;
ALTER TABLE events ADD COLUMN IF NOT EXISTS waitlist_enabled BOOLEAN DEFAULT FALSE;

-- Story #410, task #433: bulk-archive uses 'Cancelled' as a soft-archive marker.
-- Existing databases were created with status CHECK IN ('Draft','Active','Completed');
-- widen the constraint to include 'Cancelled' so archive UPDATEs don't violate it.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'events_status_check'
  ) THEN
    ALTER TABLE events DROP CONSTRAINT events_status_check;
  END IF;
END$$;
ALTER TABLE events ADD CONSTRAINT events_status_check
  CHECK (status IN ('Draft', 'Active', 'Completed', 'Cancelled'));

-- ============================================================
-- Event templates — story #410, task #432
-- Reusable seed data for new events. Templates are owned by a user
-- (created_by) and visible to that owner; admins (role_id=3) can see all.
-- ============================================================
CREATE TABLE IF NOT EXISTS event_templates (
  id           SERIAL PRIMARY KEY,
  name         TEXT NOT NULL,
  description  TEXT,
  default_title TEXT,
  default_location TEXT,
  default_capacity INTEGER,
  default_event_type TEXT,
  default_status   TEXT CHECK(default_status IN ('Draft', 'Active', 'Completed')) DEFAULT 'Draft',
  default_tags TEXT,
  default_is_public BOOLEAN DEFAULT FALSE,
  default_waitlist_enabled BOOLEAN DEFAULT FALSE,
  created_by   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  deleted_at   TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_event_templates_created_by ON event_templates(created_by);

-- ============================================================
-- Saved event filter presets — story #416, task #454
-- A power-user named filter preset stored as JSON for compatibility
-- with future filter additions.
-- ============================================================
CREATE TABLE IF NOT EXISTS event_filter_presets (
  id          SERIAL PRIMARY KEY,
  name        TEXT NOT NULL,
  filters     TEXT NOT NULL,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_event_filter_presets_user ON event_filter_presets(user_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_event_filter_presets_user_name ON event_filter_presets(user_id, name);

CREATE TABLE IF NOT EXISTS activity_feed (
  id SERIAL PRIMARY KEY,
  event_id INTEGER REFERENCES events(id) ON DELETE CASCADE,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  action_type TEXT NOT NULL,
  description TEXT NOT NULL,
  link TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_events_status ON events(status);

-- ============================================================
-- Tasks
-- ============================================================
CREATE TABLE IF NOT EXISTS tasks (
  id               SERIAL PRIMARY KEY,
  event_id         INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  title            TEXT NOT NULL,
  notes            TEXT,
  assignee_name    TEXT,
  assigned_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  due_date         TEXT,
  status           TEXT CHECK(status IN ('Pending', 'In Progress', 'Blocked', 'Complete')) DEFAULT 'Pending',
  priority         TEXT CHECK(priority IN ('Low', 'Medium', 'High')) DEFAULT 'Medium',
  created_by       INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_tasks_event_id ON tasks(event_id);

ALTER TABLE tasks ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS estimated_hours NUMERIC(5,2);

CREATE TABLE IF NOT EXISTS task_comments (
  id         SERIAL PRIMARY KEY,
  task_id    INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body       TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS task_subtasks (
  id         SERIAL PRIMARY KEY,
  task_id    INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  title      TEXT NOT NULL,
  completed  BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_task_comments_task_id ON task_comments(task_id);
CREATE INDEX IF NOT EXISTS idx_task_subtasks_task_id ON task_subtasks(task_id);

-- ============================================================
-- RSVPs
-- ============================================================
CREATE TABLE IF NOT EXISTS rsvps (
  id         SERIAL PRIMARY KEY,
  event_id   INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  email      TEXT NOT NULL,
  guests     INTEGER DEFAULT 1,
  status     TEXT CHECK(status IN ('Pending', 'Going', 'Maybe', 'Not Going', 'Declined')) DEFAULT 'Pending',
  notes      TEXT,
  source     TEXT DEFAULT 'public',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(event_id, email)
);

ALTER TABLE rsvps ADD COLUMN IF NOT EXISTS checked_in BOOLEAN DEFAULT FALSE;
ALTER TABLE rsvps ADD COLUMN IF NOT EXISTS checked_in_at TIMESTAMP;
ALTER TABLE rsvps ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE rsvps ADD COLUMN IF NOT EXISTS dietary_restriction TEXT DEFAULT 'None';
ALTER TABLE rsvps ADD COLUMN IF NOT EXISTS accessibility_needs TEXT;
ALTER TABLE rsvps ADD COLUMN IF NOT EXISTS plus_one BOOLEAN DEFAULT FALSE;
ALTER TABLE rsvps ADD COLUMN IF NOT EXISTS plus_one_name TEXT;
ALTER TABLE rsvps ADD COLUMN IF NOT EXISTS guest_group TEXT;
ALTER TABLE rsvps ADD COLUMN IF NOT EXISTS rsvp_deadline TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_rsvps_event_id ON rsvps(event_id);

-- ============================================================
-- Guest Communication Log
-- ============================================================
-- Schema below mirrors the runtime migrations in backend/src/db/database.ts so
-- a fresh DB initialized from init.sql matches what the application expects.
-- Column naming uses `communication_type`/`content` (not `type`/`body`) and
-- carries a `status` column the analytics queries depend on.
CREATE TABLE IF NOT EXISTS communication_log (
  id                 SERIAL PRIMARY KEY,
  event_id           INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  guest_email        TEXT,
  communication_type TEXT NOT NULL,
  subject            TEXT,
  content            TEXT,
  status             TEXT DEFAULT 'sent',
  sent_by            INTEGER REFERENCES users(id) ON DELETE SET NULL,
  sent_at            TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_communication_log_event_id ON communication_log(event_id);

-- ============================================================
-- Communication Tracking (#419, #465, #466)
-- Append-only event log for email opens (pixel) and clicks (redirect).
-- ============================================================
CREATE TABLE IF NOT EXISTS communication_tracking_events (
  id                   SERIAL PRIMARY KEY,
  communication_log_id INTEGER NOT NULL REFERENCES communication_log(id) ON DELETE CASCADE,
  event_type           TEXT NOT NULL CHECK (event_type IN ('open','click')),
  target_url           TEXT,
  ip_address           TEXT,
  user_agent           TEXT,
  occurred_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_comm_tracking_log_id ON communication_tracking_events(communication_log_id);
CREATE INDEX IF NOT EXISTS idx_comm_tracking_type ON communication_tracking_events(event_type);

-- ============================================================
-- Budgeting
-- ============================================================
CREATE TABLE IF NOT EXISTS budget_categories (
  id               SERIAL PRIMARY KEY,
  event_id         INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  name             TEXT NOT NULL,
  allocated_amount NUMERIC(10,2) DEFAULT 0,
  tax_rate         NUMERIC(5,2) DEFAULT 0 CHECK (tax_rate >= 0 AND tax_rate <= 100),
  gratuity_rate    NUMERIC(5,2) DEFAULT 0 CHECK (gratuity_rate >= 0 AND gratuity_rate <= 100),
  contingency_rate NUMERIC(5,2) DEFAULT 0 CHECK (contingency_rate >= 0 AND contingency_rate <= 100),
  color            TEXT DEFAULT '#6366f1',
  created_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE budget_categories ADD COLUMN IF NOT EXISTS tax_rate NUMERIC(5,2) DEFAULT 0;
ALTER TABLE budget_categories ADD COLUMN IF NOT EXISTS gratuity_rate NUMERIC(5,2) DEFAULT 0;
ALTER TABLE budget_categories ADD COLUMN IF NOT EXISTS contingency_rate NUMERIC(5,2) DEFAULT 0;

DO $$
BEGIN
  ALTER TABLE budget_categories
  ADD CONSTRAINT budget_categories_tax_rate_range_chk
  CHECK (tax_rate >= 0 AND tax_rate <= 100);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE budget_categories
  ADD CONSTRAINT budget_categories_gratuity_rate_range_chk
  CHECK (gratuity_rate >= 0 AND gratuity_rate <= 100);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE budget_categories
  ADD CONSTRAINT budget_categories_contingency_rate_range_chk
  CHECK (contingency_rate >= 0 AND contingency_rate <= 100);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS expenses (
  id             SERIAL PRIMARY KEY,
  event_id       INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  category_id    INTEGER REFERENCES budget_categories(id) ON DELETE SET NULL,
  title          TEXT NOT NULL,
  amount         NUMERIC(10,2) NOT NULL,
  payment_status TEXT DEFAULT 'pending',
  vendor_name    TEXT,
  notes          TEXT,
  created_by     INTEGER REFERENCES users(id) ON DELETE SET NULL,
  updated_by     INTEGER REFERENCES users(id) ON DELETE SET NULL,
  approval_status TEXT NOT NULL DEFAULT 'pending',
  approval_note  TEXT,
  approved_by    INTEGER REFERENCES users(id) ON DELETE SET NULL,
  approved_at    TIMESTAMP,
  reimbursement_status TEXT NOT NULL DEFAULT 'not_requested',
  reimbursement_requested_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  reimbursement_requested_at TIMESTAMP,
  reimbursed_by  INTEGER REFERENCES users(id) ON DELETE SET NULL,
  reimbursed_at  TIMESTAMP,
  created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

DO $$
BEGIN
  ALTER TABLE expenses
  ADD CONSTRAINT expenses_approval_status_check
  CHECK (approval_status IN ('pending','approved','rejected'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Backfill legacy PascalCase payment_status BEFORE applying the lowercase
-- whitelist (#PR-644). Safe to re-run.
UPDATE expenses
   SET payment_status = LOWER(payment_status)
 WHERE payment_status IN ('Pending', 'Paid', 'Overdue', 'Cancelled');

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'expenses_payment_status_check') THEN
    ALTER TABLE expenses DROP CONSTRAINT expenses_payment_status_check;
  END IF;
END $$;

DO $$
BEGIN
  ALTER TABLE expenses
  ADD CONSTRAINT expenses_payment_status_check
  CHECK (payment_status IN ('pending','paid','overdue','cancelled'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE expenses
  ADD CONSTRAINT expenses_reimbursement_status_check
  CHECK (reimbursement_status IN ('not_requested','requested','reimbursed','rejected'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS expense_workflow_events (
  id            SERIAL PRIMARY KEY,
  event_id      INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  expense_id    INTEGER NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
  action        TEXT NOT NULL,
  actor_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  from_state    TEXT,
  to_state      TEXT,
  note          TEXT,
  created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_expense_workflow_events_event_id ON expense_workflow_events(event_id);
CREATE INDEX IF NOT EXISTS idx_expense_workflow_events_expense_id ON expense_workflow_events(expense_id);

CREATE TABLE IF NOT EXISTS expense_receipt_ocr (
  id                  SERIAL PRIMARY KEY,
  event_id            INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  expense_id          INTEGER NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
  receipt_text        TEXT NOT NULL,
  extracted_title     TEXT,
  extracted_amount    NUMERIC(10,2),
  extracted_vendor_name TEXT,
  extracted_date      TEXT,
  confidence          NUMERIC(4,3) NOT NULL DEFAULT 0,
  status              TEXT NOT NULL DEFAULT 'extracted',
  error_code          TEXT,
  error_message       TEXT,
  created_by          INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  applied_by          INTEGER REFERENCES users(id) ON DELETE SET NULL,
  applied_at          TIMESTAMP,
  created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CHECK (status IN ('extracted','applied','failed')),
  CHECK (confidence >= 0 AND confidence <= 1)
);
CREATE INDEX IF NOT EXISTS idx_expense_receipt_ocr_event_id ON expense_receipt_ocr(event_id);
CREATE INDEX IF NOT EXISTS idx_expense_receipt_ocr_expense_id ON expense_receipt_ocr(expense_id);

CREATE TABLE IF NOT EXISTS expense_reconciliation_logs (
  id              SERIAL PRIMARY KEY,
  event_id        INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  expense_id      INTEGER NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
  ocr_id          INTEGER NOT NULL REFERENCES expense_receipt_ocr(id) ON DELETE RESTRICT,
  before_data     JSONB NOT NULL,
  extracted_data  JSONB NOT NULL,
  applied_data    JSONB NOT NULL,
  overrides_count INTEGER NOT NULL DEFAULT 0,
  override_reason TEXT,
  created_by      INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  updated_by      INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CHECK (overrides_count >= 0)
);
CREATE INDEX IF NOT EXISTS idx_expense_reconciliation_logs_event_id ON expense_reconciliation_logs(event_id);
CREATE INDEX IF NOT EXISTS idx_expense_reconciliation_logs_expense_id ON expense_reconciliation_logs(expense_id);

-- ============================================================
-- Seating
-- ============================================================
CREATE TABLE IF NOT EXISTS seating_tables (
  id         SERIAL PRIMARY KEY,
  event_id   INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  capacity   INTEGER DEFAULT 8,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS seating_assignments (
  table_id INTEGER NOT NULL REFERENCES seating_tables(id) ON DELETE CASCADE,
  rsvp_id  INTEGER NOT NULL REFERENCES rsvps(id) ON DELETE CASCADE,
  PRIMARY KEY (table_id, rsvp_id)
);

-- ============================================================
-- Notifications
-- ============================================================
CREATE TABLE IF NOT EXISTS notifications (
  id         SERIAL PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type       TEXT NOT NULL,
  title      TEXT NOT NULL,
  body       TEXT,
  link       TEXT,
  is_read    BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- Event Members
-- ============================================================
CREATE TABLE IF NOT EXISTS event_members (
  event_id  INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role      TEXT DEFAULT 'Member',
  joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (event_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_event_members_event_id ON event_members(event_id);

-- ============================================================
-- Vendors (BRD 3.6)
-- ============================================================
CREATE TABLE IF NOT EXISTS vendors (
  id             SERIAL PRIMARY KEY,
  event_id       INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  name           TEXT NOT NULL,
  category       TEXT NOT NULL,
  email          TEXT,
  phone          TEXT,
  website        TEXT,
  status         TEXT CHECK(status IN ('Contacted','Quote Received','Booked','Confirmed','Cancelled')) DEFAULT 'Contacted',
  quoted_amount  NUMERIC(10,2),
  contract_file  TEXT,
  notes          TEXT,
  rating         INTEGER CHECK(rating BETWEEN 1 AND 5),
  created_by     INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- Shopping Lists & Items (BRD 3.7)
-- ============================================================
CREATE TABLE IF NOT EXISTS shopping_lists (
  id         SERIAL PRIMARY KEY,
  event_id   INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS shopping_items (
  id                  SERIAL PRIMARY KEY,
  list_id             INTEGER NOT NULL REFERENCES shopping_lists(id) ON DELETE CASCADE,
  name                TEXT NOT NULL,
  quantity            INTEGER DEFAULT 1,
  unit                TEXT,
  estimated_cost      NUMERIC(10,2),
  actual_cost         NUMERIC(10,2),
  status              TEXT CHECK(status IN ('Needed','Purchased','Not Available','Ordered')) DEFAULT 'Needed',
  assigned_to         INTEGER REFERENCES users(id) ON DELETE SET NULL,
  notes               TEXT,
  source_store_name   TEXT,
  source_store_url    TEXT,
  compared_price_low  NUMERIC(10,2),
  compared_price_high NUMERIC(10,2),
  price_checked_at    TIMESTAMP,
  updated_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT shopping_items_compared_price_order_check CHECK (
    compared_price_low IS NULL OR
    compared_price_high IS NULL OR
    compared_price_low <= compared_price_high
  )
);

-- ============================================================
-- Event Timeline (BRD 3.8)
-- ============================================================
CREATE TABLE IF NOT EXISTS timeline_activities (
  id                  SERIAL PRIMARY KEY,
  event_id            INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  title               TEXT NOT NULL,
  description         TEXT,
  start_time          TIMESTAMP,
  end_time            TIMESTAMP,
  planned_start_time  TIMESTAMP,
  planned_end_time    TIMESTAMP,
  actual_start_time   TIMESTAMP,
  actual_end_time     TIMESTAMP,
  status              TEXT DEFAULT 'planned' CHECK (status IN ('planned','in-progress','completed','skipped')),
  location            TEXT,
  vendor_id           INTEGER REFERENCES vendors(id) ON DELETE SET NULL,
  sort_order          INTEGER DEFAULT 0,
  created_by          INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- Permissions seed data
-- ============================================================
INSERT INTO permissions (name, description) VALUES
  ('users.view',    'View user profiles'),
  ('users.edit',    'Edit user profiles'),
  ('users.delete',  'Delete users'),
  ('events.view',   'View events'),
  ('events.create', 'Create events'),
  ('events.edit',   'Edit events'),
  ('events.delete', 'Delete events'),
  ('roles.view',    'View roles'),
  ('roles.manage',  'Manage roles and permissions')
ON CONFLICT (name) DO NOTHING;

-- ============================================================
-- Budget Templates (#438)
-- ============================================================
CREATE TABLE IF NOT EXISTS budget_templates (
  id          SERIAL PRIMARY KEY,
  name        TEXT NOT NULL,
  description TEXT,
  created_by  INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS budget_template_items (
  id               SERIAL PRIMARY KEY,
  template_id      INTEGER NOT NULL REFERENCES budget_templates(id) ON DELETE CASCADE,
  name             TEXT NOT NULL,
  allocated_amount NUMERIC(10,2) DEFAULT 0,
  color            TEXT DEFAULT '#6366f1',
  created_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_budget_template_items_template_id ON budget_template_items(template_id);

-- ============================================================
-- Task Dependencies (#440)
-- ============================================================
CREATE TABLE IF NOT EXISTS task_dependencies (
  id              SERIAL PRIMARY KEY,
  task_id         INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  depends_on_id   INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  created_by      INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(task_id, depends_on_id),
  CONSTRAINT task_dependencies_no_self_ref CHECK(task_id <> depends_on_id)
);

CREATE INDEX IF NOT EXISTS idx_task_dependencies_task_id ON task_dependencies(task_id);
CREATE INDEX IF NOT EXISTS idx_task_dependencies_depends_on_id ON task_dependencies(depends_on_id);

-- ============================================================
-- Task Templates & Time Entries (#450)
-- ============================================================
CREATE TABLE IF NOT EXISTS task_templates (
  id              SERIAL PRIMARY KEY,
  event_id        INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  description     TEXT,
  priority        TEXT CHECK(priority IN ('Low','Medium','High')) DEFAULT 'Medium',
  estimated_hours NUMERIC(5,2),
  created_by      INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_task_templates_event_id ON task_templates(event_id);

CREATE TABLE IF NOT EXISTS task_time_entries (
  id          SERIAL PRIMARY KEY,
  task_id     INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  hours_spent NUMERIC(5,2) NOT NULL CHECK(hours_spent > 0),
  notes       TEXT,
  logged_at   DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_task_time_entries_task_id ON task_time_entries(task_id);

-- Extend tasks for recurrence and template linkage (#450)
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS is_recurring       BOOLEAN DEFAULT FALSE;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS recurrence_pattern TEXT;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS recurrence_end_date TEXT;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS template_id         INTEGER REFERENCES task_templates(id) ON DELETE SET NULL;

-- ============================================================
-- Recurring Expenses (#449)
-- ============================================================
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS is_recurring        BOOLEAN DEFAULT FALSE;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS recurrence_pattern  TEXT;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS recurrence_end_date DATE;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS is_installment      BOOLEAN DEFAULT FALSE;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS installment_total   INTEGER;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS installment_number  INTEGER;

-- Named constraint — idempotent via DO block
DO $$
BEGIN
  ALTER TABLE expenses
    ADD CONSTRAINT expenses_recurrence_pattern_valid
    CHECK (recurrence_pattern IS NULL OR recurrence_pattern IN ('weekly','monthly','quarterly','annually'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================
-- Vendor Communication Log (#452)
-- ============================================================
CREATE TABLE IF NOT EXISTS vendor_communication_log (
  id         SERIAL PRIMARY KEY,
  event_id   INTEGER NOT NULL REFERENCES events(id)   ON DELETE CASCADE,
  vendor_id  INTEGER NOT NULL REFERENCES vendors(id)  ON DELETE CASCADE,
  type       TEXT NOT NULL CHECK(type IN ('email','call','meeting','quote','follow_up','other')),
  subject    TEXT NOT NULL,
  body       TEXT,
  sent_by    INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_vendor_comm_log_vendor_id ON vendor_communication_log(vendor_id);
CREATE INDEX IF NOT EXISTS idx_vendor_comm_log_event_id  ON vendor_communication_log(event_id);

-- ============================================================
-- Vendor Lifecycle Parity (Story #531: tasks #553 #609 #610 #611)
-- ============================================================
CREATE TABLE IF NOT EXISTS vendor_favorites (
  id         SERIAL PRIMARY KEY,
  event_id   INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  vendor_id  INTEGER NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(event_id, vendor_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_vendor_favorites_event_id ON vendor_favorites(event_id);
CREATE INDEX IF NOT EXISTS idx_vendor_favorites_vendor_id ON vendor_favorites(vendor_id);
CREATE INDEX IF NOT EXISTS idx_vendor_favorites_user_id ON vendor_favorites(user_id);

CREATE TABLE IF NOT EXISTS vendor_bookings (
  id                 SERIAL PRIMARY KEY,
  event_id           INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  vendor_id          INTEGER NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  status             TEXT NOT NULL DEFAULT 'requested',
  contract_signed_at TIMESTAMP,
  service_start_at   TIMESTAMP,
  service_end_at     TIMESTAMP,
  total_amount       NUMERIC(10,2),
  currency_code      TEXT DEFAULT 'USD',
  notes              TEXT,
  created_by         INTEGER REFERENCES users(id) ON DELETE SET NULL,
  updated_by         INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at         TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at         TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(event_id, vendor_id),
  CHECK(status IN ('requested','quoted','negotiating','approved','contracted','scheduled','in_progress','completed','cancelled'))
);

CREATE INDEX IF NOT EXISTS idx_vendor_bookings_event_id ON vendor_bookings(event_id);
CREATE INDEX IF NOT EXISTS idx_vendor_bookings_vendor_id ON vendor_bookings(vendor_id);

CREATE TABLE IF NOT EXISTS vendor_payment_schedules (
  id                SERIAL PRIMARY KEY,
  event_id          INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  vendor_id         INTEGER NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  vendor_booking_id INTEGER REFERENCES vendor_bookings(id) ON DELETE SET NULL,
  due_date          DATE NOT NULL,
  amount            NUMERIC(10,2) NOT NULL,
  status            TEXT NOT NULL DEFAULT 'pending',
  paid_at           TIMESTAMP,
  note              TEXT,
  created_by        INTEGER REFERENCES users(id) ON DELETE SET NULL,
  updated_by        INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CHECK(status IN ('pending','paid','overdue','cancelled')),
  CHECK(amount >= 0)
);

CREATE INDEX IF NOT EXISTS idx_vendor_payment_sched_event_id ON vendor_payment_schedules(event_id);
CREATE INDEX IF NOT EXISTS idx_vendor_payment_sched_vendor_id ON vendor_payment_schedules(vendor_id);

-- ============================================================
-- Store Suggestions (#464)
-- ============================================================
CREATE TABLE IF NOT EXISTS store_suggestions (
  id           SERIAL PRIMARY KEY,
  event_id     INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  website      TEXT,
  notes        TEXT,
  category     TEXT,
  location     TEXT,
  latitude     NUMERIC(9,6),
  longitude    NUMERIC(9,6),
  usage_count  INTEGER NOT NULL DEFAULT 0 CHECK (usage_count >= 0),
  last_used_at TIMESTAMP,
  suggested_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  status       TEXT CHECK(status IN ('pending','approved','rejected')) DEFAULT 'pending',
  created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_store_suggestions_event_id ON store_suggestions(event_id);
CREATE INDEX IF NOT EXISTS idx_store_suggestions_usage
  ON store_suggestions(event_id, usage_count DESC);
CREATE INDEX IF NOT EXISTS idx_store_suggestions_category
  ON store_suggestions(event_id, category);

-- Case-insensitive unique store name per event
CREATE UNIQUE INDEX IF NOT EXISTS idx_store_suggestions_unique
  ON store_suggestions(event_id, lower(name));

-- Event Documents (#476)
-- ============================================================
CREATE TABLE IF NOT EXISTS event_documents (
  id            SERIAL PRIMARY KEY,
  event_id      INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  original_name TEXT NOT NULL,
  file_name     TEXT NOT NULL,
  mime_type     TEXT NOT NULL,
  file_size     INTEGER NOT NULL,
  caption       TEXT,
  created_by    INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_event_documents_event_id ON event_documents(event_id);

-- ============================================================
-- Event Messages / Team Conversation
-- ============================================================
CREATE TABLE IF NOT EXISTS event_messages (
  id         SERIAL PRIMARY KEY,
  event_id   INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  sender_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body       TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_event_messages_event_id   ON event_messages(event_id);
CREATE INDEX IF NOT EXISTS idx_event_messages_sender_id  ON event_messages(sender_id);

-- ============================================================
-- Event Categories (#217)
-- ============================================================
CREATE TABLE IF NOT EXISTS categories (
  id          SERIAL PRIMARY KEY,
  name        TEXT UNIQUE NOT NULL,
  description TEXT,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO categories (name) VALUES
  ('Music'), ('Food & Beverage'), ('Entertainment'), ('Sports'),
  ('Art & Culture'), ('Business'), ('Technology'), ('Education'),
  ('Charity'), ('Other')
ON CONFLICT (name) DO NOTHING;

CREATE TABLE IF NOT EXISTS event_categories (
  event_id    INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  PRIMARY KEY (event_id, category_id)
);

CREATE INDEX IF NOT EXISTS idx_event_categories_event_id ON event_categories(event_id);

-- ============================================================
-- Entra ID identity columns (#468, #470)
-- ============================================================
ALTER TABLE users ADD COLUMN IF NOT EXISTS entra_oid    TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS auth_provider TEXT DEFAULT 'local';
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_entra_oid ON users(entra_oid) WHERE entra_oid IS NOT NULL;

-- ============================================================
-- Guest merge audit (#411, #435)
-- ============================================================
CREATE TABLE IF NOT EXISTS guest_merge_audit (
  id                 SERIAL PRIMARY KEY,
  event_id           INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  surviving_rsvp_id  INTEGER REFERENCES rsvps(id) ON DELETE SET NULL,
  merged_rsvp_id     INTEGER NOT NULL,
  merged_email       TEXT NOT NULL,
  merged_name        TEXT NOT NULL,
  merged_snapshot    JSONB NOT NULL,
  merged_by          INTEGER REFERENCES users(id) ON DELETE SET NULL,
  merged_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  notes              TEXT
);
CREATE INDEX IF NOT EXISTS idx_guest_merge_audit_event_id ON guest_merge_audit(event_id);
CREATE INDEX IF NOT EXISTS idx_guest_merge_audit_surviving ON guest_merge_audit(surviving_rsvp_id);

-- ============================================================
-- RSVP access tokens for QR codes (#411, #437)
-- ============================================================
CREATE TABLE IF NOT EXISTS rsvp_access_tokens (
  rsvp_id      INTEGER PRIMARY KEY REFERENCES rsvps(id) ON DELETE CASCADE,
  token        TEXT NOT NULL UNIQUE,
  created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  revoked_at   TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_rsvp_access_tokens_token
  ON rsvp_access_tokens(token) WHERE revoked_at IS NULL;

-- ============================================================
-- Waitlist columns on rsvps (#413, #442)
-- ============================================================
ALTER TABLE rsvps ADD COLUMN IF NOT EXISTS waitlist_position INTEGER;
ALTER TABLE rsvps ADD COLUMN IF NOT EXISTS waitlisted_at TIMESTAMP;
ALTER TABLE rsvps ADD COLUMN IF NOT EXISTS promoted_at TIMESTAMP;
CREATE INDEX IF NOT EXISTS idx_rsvps_event_waitlist
  ON rsvps(event_id, waitlist_position) WHERE waitlist_position IS NOT NULL;

-- ============================================================
-- Custom RSVP questions (#413, #443)
-- ============================================================
CREATE TABLE IF NOT EXISTS rsvp_questions (
  id            SERIAL PRIMARY KEY,
  event_id      INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  prompt        TEXT NOT NULL,
  question_type TEXT NOT NULL CHECK (question_type IN ('short_text','long_text','single_choice','multi_choice','number','boolean')),
  options       JSONB,
  required      BOOLEAN DEFAULT FALSE,
  sort_order    INTEGER DEFAULT 0,
  created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_rsvp_questions_event_id ON rsvp_questions(event_id);

CREATE TABLE IF NOT EXISTS rsvp_question_responses (
  id          SERIAL PRIMARY KEY,
  rsvp_id     INTEGER NOT NULL REFERENCES rsvps(id) ON DELETE CASCADE,
  question_id INTEGER NOT NULL REFERENCES rsvp_questions(id) ON DELETE CASCADE,
  response    TEXT,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (rsvp_id, question_id)
);
CREATE INDEX IF NOT EXISTS idx_rsvp_question_responses_rsvp ON rsvp_question_responses(rsvp_id);

-- ============================================================
-- Currency & exchange rates (#418, #461)
-- ============================================================
ALTER TABLE events ADD COLUMN IF NOT EXISTS currency_code TEXT NOT NULL DEFAULT 'USD';
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS currency_code TEXT;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS amount_base NUMERIC(14,4);
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS exchange_rate NUMERIC(18,8);
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS approval_status TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS approval_note TEXT;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS approved_by INTEGER REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS approved_at TIMESTAMP;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS reimbursement_status TEXT NOT NULL DEFAULT 'not_requested';
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS reimbursement_requested_by INTEGER REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS reimbursement_requested_at TIMESTAMP;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS reimbursed_by INTEGER REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS reimbursed_at TIMESTAMP;

DO $$
BEGIN
  ALTER TABLE expenses DROP CONSTRAINT IF EXISTS expenses_approval_status_check;
  ALTER TABLE expenses
  ADD CONSTRAINT expenses_approval_status_check
  CHECK (approval_status IN ('pending','approved','rejected'));
EXCEPTION WHEN others THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE expenses DROP CONSTRAINT IF EXISTS expenses_reimbursement_status_check;
  ALTER TABLE expenses
  ADD CONSTRAINT expenses_reimbursement_status_check
  CHECK (reimbursement_status IN ('not_requested','requested','reimbursed','rejected'));
EXCEPTION WHEN others THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS expense_workflow_events (
  id            SERIAL PRIMARY KEY,
  event_id      INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  expense_id    INTEGER NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
  action        TEXT NOT NULL,
  actor_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  from_state    TEXT,
  to_state      TEXT,
  note          TEXT,
  created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_expense_workflow_events_event_id ON expense_workflow_events(event_id);
CREATE INDEX IF NOT EXISTS idx_expense_workflow_events_expense_id ON expense_workflow_events(expense_id);

CREATE TABLE IF NOT EXISTS exchange_rates (
  base_currency  TEXT NOT NULL,
  quote_currency TEXT NOT NULL,
  rate           NUMERIC(18,8) NOT NULL CHECK (rate > 0),
  source         TEXT NOT NULL DEFAULT 'manual',
  fetched_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (base_currency, quote_currency)
);

-- ============================================================
-- Guest, RSVP, communication, check-in, seating parity
-- (#529 story; tasks #543-#547, #582-#595)
-- ============================================================
ALTER TABLE rsvps ADD COLUMN IF NOT EXISTS address_line1 TEXT;
ALTER TABLE rsvps ADD COLUMN IF NOT EXISTS address_line2 TEXT;
ALTER TABLE rsvps ADD COLUMN IF NOT EXISTS city TEXT;
ALTER TABLE rsvps ADD COLUMN IF NOT EXISTS state_region TEXT;
ALTER TABLE rsvps ADD COLUMN IF NOT EXISTS postal_code TEXT;
ALTER TABLE rsvps ADD COLUMN IF NOT EXISTS country TEXT;
ALTER TABLE rsvps ADD COLUMN IF NOT EXISTS company TEXT;
ALTER TABLE rsvps ADD COLUMN IF NOT EXISTS title TEXT;
ALTER TABLE rsvps ADD COLUMN IF NOT EXISTS relation_type TEXT;
ALTER TABLE rsvps ADD COLUMN IF NOT EXISTS age_group TEXT;
ALTER TABLE rsvps ADD COLUMN IF NOT EXISTS emergency_contact_name TEXT;
ALTER TABLE rsvps ADD COLUMN IF NOT EXISTS emergency_contact_phone TEXT;
ALTER TABLE rsvps ADD COLUMN IF NOT EXISTS profile_completeness INTEGER DEFAULT 0;
ALTER TABLE rsvps ADD COLUMN IF NOT EXISTS canonical_status TEXT;
ALTER TABLE rsvps ADD COLUMN IF NOT EXISTS meal_choice TEXT;
ALTER TABLE rsvps ADD COLUMN IF NOT EXISTS meal_options_locked BOOLEAN DEFAULT FALSE;
ALTER TABLE rsvps ADD COLUMN IF NOT EXISTS late_arrival BOOLEAN DEFAULT FALSE;
ALTER TABLE rsvps ADD COLUMN IF NOT EXISTS arrival_delay_minutes INTEGER;
ALTER TABLE rsvps ADD COLUMN IF NOT EXISTS unsubscribed_at TIMESTAMP;
ALTER TABLE rsvps ADD COLUMN IF NOT EXISTS unsubscribe_token TEXT;
ALTER TABLE rsvps ADD COLUMN IF NOT EXISTS seating_group_id INTEGER;

CREATE INDEX IF NOT EXISTS idx_rsvps_canonical_status ON rsvps(event_id, canonical_status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_rsvps_unsubscribe_token
  ON rsvps(unsubscribe_token) WHERE unsubscribe_token IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_rsvps_seating_group ON rsvps(seating_group_id);

CREATE TABLE IF NOT EXISTS event_meal_options (
  id          SERIAL PRIMARY KEY,
  event_id    INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  description TEXT,
  is_active   BOOLEAN DEFAULT TRUE,
  sort_order  INTEGER DEFAULT 0,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (event_id, name)
);
CREATE INDEX IF NOT EXISTS idx_event_meal_options_event ON event_meal_options(event_id);

CREATE TABLE IF NOT EXISTS communication_templates (
  id         SERIAL PRIMARY KEY,
  event_id   INTEGER REFERENCES events(id) ON DELETE CASCADE,
  slug       TEXT NOT NULL,
  name       TEXT NOT NULL,
  subject    TEXT NOT NULL,
  body       TEXT NOT NULL,
  is_default BOOLEAN DEFAULT FALSE,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (event_id, slug)
);
CREATE INDEX IF NOT EXISTS idx_comm_templates_event ON communication_templates(event_id);

CREATE TABLE IF NOT EXISTS attendance_events (
  id           SERIAL PRIMARY KEY,
  event_id     INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  rsvp_id      INTEGER NOT NULL REFERENCES rsvps(id) ON DELETE CASCADE,
  action       TEXT NOT NULL CHECK (action IN ('checked_in','undo_checkin','scanned','no_show')),
  source       TEXT NOT NULL DEFAULT 'manual',
  occurred_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  actor_id     INTEGER REFERENCES users(id) ON DELETE SET NULL,
  metadata     JSONB
);
CREATE INDEX IF NOT EXISTS idx_attendance_events_event
  ON attendance_events(event_id, occurred_at DESC);

CREATE TABLE IF NOT EXISTS seating_groups (
  id                  SERIAL PRIMARY KEY,
  event_id            INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  name                TEXT NOT NULL,
  seat_together       BOOLEAN DEFAULT TRUE,
  preferred_table_id  INTEGER REFERENCES seating_tables(id) ON DELETE SET NULL,
  notes               TEXT,
  created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (event_id, name)
);

-- Backfill canonical_status from legacy status text on init.
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

-- ============================================================
-- Gallery albums, moderation queue & slideshows (#417, #459)
-- ============================================================
CREATE TABLE IF NOT EXISTS gallery_albums (
  id          SERIAL PRIMARY KEY,
  event_id    INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  description TEXT,
  created_by  INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_gallery_albums_event_id ON gallery_albums(event_id);

ALTER TABLE event_documents ADD COLUMN IF NOT EXISTS album_id INTEGER REFERENCES gallery_albums(id) ON DELETE SET NULL;
ALTER TABLE event_documents ADD COLUMN IF NOT EXISTS moderation_status TEXT NOT NULL DEFAULT 'approved';
ALTER TABLE event_documents ADD COLUMN IF NOT EXISTS submitted_by INTEGER REFERENCES users(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_event_documents_album_id ON event_documents(album_id);
CREATE INDEX IF NOT EXISTS idx_event_documents_moderation ON event_documents(event_id, moderation_status);

CREATE TABLE IF NOT EXISTS gallery_slideshows (
  id          SERIAL PRIMARY KEY,
  event_id    INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  created_by  INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_gallery_slideshows_event_id ON gallery_slideshows(event_id);

CREATE TABLE IF NOT EXISTS slideshow_items (
  id           SERIAL PRIMARY KEY,
  slideshow_id INTEGER NOT NULL REFERENCES gallery_slideshows(id) ON DELETE CASCADE,
  document_id  INTEGER NOT NULL REFERENCES event_documents(id) ON DELETE CASCADE,
  sort_order   INTEGER NOT NULL DEFAULT 0,
  UNIQUE (slideshow_id, document_id)
);
CREATE INDEX IF NOT EXISTS idx_slideshow_items_slideshow_id ON slideshow_items(slideshow_id);

-- ============================================================
-- RLS pilot: row-level security on events and event_members (#472)
-- Applied only when RLS_PILOT_ENABLED=true at bootstrap time.
-- The application runtime migration also handles this.
-- ============================================================

-- ============================================================
-- BRD v2: Event lifecycle, gallery, reporting parity
-- Stories #528, #533 — covers tasks #539-#542, #560-#563,
--   #574-#581, #617-#622.
-- All deltas are idempotent (IF NOT EXISTS / DO blocks).
-- ============================================================

-- Widen event status to full BRD v2 lifecycle (#575).
-- Existing values stay valid; we add 'Planning' and 'Confirmed'.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'events_status_check') THEN
    ALTER TABLE events DROP CONSTRAINT events_status_check;
  END IF;
END$$;
ALTER TABLE events ADD CONSTRAINT events_status_check
  CHECK (status IN ('Draft','Planning','Confirmed','Active','Completed','Cancelled'));

-- True archival (#540, #578) — distinct from soft-delete (deleted_at)
ALTER TABLE events ADD COLUMN IF NOT EXISTS archived_at TIMESTAMP;
ALTER TABLE events ADD COLUMN IF NOT EXISTS archived_by INTEGER REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE events ADD COLUMN IF NOT EXISTS archive_reason TEXT;
CREATE INDEX IF NOT EXISTS idx_events_archived_at ON events(archived_at) WHERE archived_at IS NOT NULL;

-- Audit field (#542, #575) — who last updated the event
ALTER TABLE events ADD COLUMN IF NOT EXISTS updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL;

-- Gallery permission flags per-event (#618, #621)
ALTER TABLE events ADD COLUMN IF NOT EXISTS gallery_comments_enabled BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE events ADD COLUMN IF NOT EXISTS gallery_guest_uploads BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE events ADD COLUMN IF NOT EXISTS gallery_public BOOLEAN NOT NULL DEFAULT FALSE;

-- Storage quota (#622) — bytes, default 500MB
ALTER TABLE events ADD COLUMN IF NOT EXISTS storage_quota_bytes BIGINT NOT NULL DEFAULT 524288000;
ALTER TABLE events ADD COLUMN IF NOT EXISTS storage_used_bytes BIGINT NOT NULL DEFAULT 0;

-- Cover image resize pipeline outputs (#541, #576) — JSON of derived sizes
ALTER TABLE events ADD COLUMN IF NOT EXISTS cover_image_sizes JSONB;

-- Event custom fields (#541, #577) — flexible per-event metadata
CREATE TABLE IF NOT EXISTS event_custom_fields (
  id          SERIAL PRIMARY KEY,
  event_id    INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  field_key   TEXT NOT NULL,
  label       TEXT NOT NULL,
  field_type  TEXT NOT NULL CHECK (field_type IN ('text','number','boolean','date','url','select')),
  options     JSONB,
  value       TEXT,
  required    BOOLEAN NOT NULL DEFAULT FALSE,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_by  INTEGER REFERENCES users(id) ON DELETE SET NULL,
  updated_by  INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (event_id, field_key)
);
CREATE INDEX IF NOT EXISTS idx_event_custom_fields_event_id ON event_custom_fields(event_id);

-- Extend event_documents (#560, #617, #618, #619) with conversion + permissions metadata.
ALTER TABLE event_documents ADD COLUMN IF NOT EXISTS visibility TEXT NOT NULL DEFAULT 'event';
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'event_documents_visibility_check') THEN
    ALTER TABLE event_documents DROP CONSTRAINT event_documents_visibility_check;
  END IF;
END$$;
ALTER TABLE event_documents ADD CONSTRAINT event_documents_visibility_check
  CHECK (visibility IN ('private','event','public'));
ALTER TABLE event_documents ADD COLUMN IF NOT EXISTS allow_download BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE event_documents ADD COLUMN IF NOT EXISTS allow_comments BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE event_documents ADD COLUMN IF NOT EXISTS conversion_status TEXT NOT NULL DEFAULT 'none';
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'event_documents_conversion_status_check') THEN
    ALTER TABLE event_documents DROP CONSTRAINT event_documents_conversion_status_check;
  END IF;
END$$;
ALTER TABLE event_documents ADD CONSTRAINT event_documents_conversion_status_check
  CHECK (conversion_status IN ('none','pending','converted','failed'));
ALTER TABLE event_documents ADD COLUMN IF NOT EXISTS original_format TEXT;
ALTER TABLE event_documents ADD COLUMN IF NOT EXISTS converted_file_name TEXT;
ALTER TABLE event_documents ADD COLUMN IF NOT EXISTS thumbnail_url TEXT;
ALTER TABLE event_documents ADD COLUMN IF NOT EXISTS medium_url TEXT;
ALTER TABLE event_documents ADD COLUMN IF NOT EXISTS updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_event_documents_visibility ON event_documents(event_id, visibility);
CREATE INDEX IF NOT EXISTS idx_event_documents_conversion ON event_documents(conversion_status) WHERE conversion_status <> 'none';

-- Gallery share links (#619) — public URLs scoped to an event or album
CREATE TABLE IF NOT EXISTS gallery_share_links (
  id              SERIAL PRIMARY KEY,
  event_id        INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  album_id        INTEGER REFERENCES gallery_albums(id) ON DELETE CASCADE,
  token           TEXT NOT NULL UNIQUE,
  password_hash   TEXT,
  allow_download  BOOLEAN NOT NULL DEFAULT TRUE,
  expires_at      TIMESTAMP,
  view_count      INTEGER NOT NULL DEFAULT 0,
  last_viewed_at  TIMESTAMP,
  revoked_at      TIMESTAMP,
  created_by      INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_gallery_share_links_event_id ON gallery_share_links(event_id);
CREATE INDEX IF NOT EXISTS idx_gallery_share_links_album_id ON gallery_share_links(album_id);
CREATE INDEX IF NOT EXISTS idx_gallery_share_links_token_active
  ON gallery_share_links(token) WHERE revoked_at IS NULL;

-- Gallery comments / discussion threads (#621)
CREATE TABLE IF NOT EXISTS gallery_comments (
  id           SERIAL PRIMARY KEY,
  event_id     INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  document_id  INTEGER NOT NULL REFERENCES event_documents(id) ON DELETE CASCADE,
  parent_id    INTEGER REFERENCES gallery_comments(id) ON DELETE CASCADE,
  user_id      INTEGER REFERENCES users(id) ON DELETE SET NULL,
  body         TEXT NOT NULL CHECK (length(body) <= 2000),
  is_hidden    BOOLEAN NOT NULL DEFAULT FALSE,
  hidden_by    INTEGER REFERENCES users(id) ON DELETE SET NULL,
  hidden_at    TIMESTAMP,
  created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_by   INTEGER REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_gallery_comments_document_id ON gallery_comments(document_id);
CREATE INDEX IF NOT EXISTS idx_gallery_comments_event_id ON gallery_comments(event_id);
CREATE INDEX IF NOT EXISTS idx_gallery_comments_parent_id ON gallery_comments(parent_id);

-- Scheduled reports (#562, #602)
CREATE TABLE IF NOT EXISTS scheduled_reports (
  id            SERIAL PRIMARY KEY,
  event_id      INTEGER REFERENCES events(id) ON DELETE CASCADE,
  report_type   TEXT NOT NULL CHECK (report_type IN (
                  'rsvp_summary','budget_summary','task_summary','storage_summary','full',
                  'financial_detail','expense_workflow','vendor_spend','price_comparison'
                )),
  frequency     TEXT NOT NULL CHECK (frequency IN ('daily','weekly','monthly')),
  recipients    JSONB NOT NULL DEFAULT '[]'::jsonb,
  filters       JSONB,
  next_run_at   TIMESTAMP,
  last_run_at   TIMESTAMP,
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  created_by    INTEGER REFERENCES users(id) ON DELETE SET NULL,
  updated_by    INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_scheduled_reports_event_id ON scheduled_reports(event_id);
CREATE INDEX IF NOT EXISTS idx_scheduled_reports_due
  ON scheduled_reports(next_run_at) WHERE is_active = TRUE;

-- Report deliveries (audit trail for #562)
CREATE TABLE IF NOT EXISTS scheduled_report_deliveries (
  id            SERIAL PRIMARY KEY,
  report_id     INTEGER NOT NULL REFERENCES scheduled_reports(id) ON DELETE CASCADE,
  delivered_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  recipients    JSONB NOT NULL DEFAULT '[]'::jsonb,
  status        TEXT NOT NULL CHECK (status IN ('success','partial','failed')),
  error_message TEXT,
  payload_kind  TEXT NOT NULL DEFAULT 'json'
);
CREATE INDEX IF NOT EXISTS idx_scheduled_report_deliveries_report_id ON scheduled_report_deliveries(report_id);

-- Event template depth (#579) — sections that templates can pre-fill
CREATE TABLE IF NOT EXISTS event_template_sections (
  id            SERIAL PRIMARY KEY,
  template_id   INTEGER NOT NULL REFERENCES event_templates(id) ON DELETE CASCADE,
  section_key   TEXT NOT NULL CHECK (section_key IN ('tasks','budget','timeline','custom_fields','vendors','shopping','rsvp_questions')),
  payload       JSONB NOT NULL DEFAULT '{}'::jsonb,
  sort_order    INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (template_id, section_key)
);
CREATE INDEX IF NOT EXISTS idx_event_template_sections_template_id ON event_template_sections(template_id);

-- ============================================================
-- DEMO SEED DATA
-- Provides ready-to-use accounts and events for new users.
-- Passwords (bcrypt, 12 rounds):
--   admin@festival.local      → Admin123!
--   organizer@festival.local  → Organizer123!
--   organizer2@festival.local → Organizer123!
--   alice@festival.local      → Password123!
--   bob@festival.local        → Password123!
--   carol@festival.local      → Password123!
-- ============================================================

-- ----------------------------------------------------------
-- Users
-- ----------------------------------------------------------
INSERT INTO users (id, email, password_hash, display_name, email_verified, email_verified_at, role_id, created_at, updated_at) VALUES
  (10, 'admin@festival.local',      '$2b$12$8RSsKvg2A0xcaUxkDTckoOdeTZnuR.tqEGXOTSrNTnADhei3lpyAa', 'Admin User',        1, NOW(), 3, NOW(), NOW()),
  (11, 'organizer@festival.local',  '$2b$12$1/6T1LVWZuHo/iKKRO1bSOQVoeMGrQFe2F96JQ4mbC86TbArEg52C', 'Sarah Organizer',   1, NOW(), 2, NOW(), NOW()),
  (12, 'organizer2@festival.local', '$2b$12$1/6T1LVWZuHo/iKKRO1bSOQVoeMGrQFe2F96JQ4mbC86TbArEg52C', 'James Organizer',   1, NOW(), 2, NOW(), NOW()),
  (13, 'alice@festival.local',      '$2b$12$kWqsH81XahoSIZZcaiAuCuFJuNl9T./uClS369V9HwWukoVioJtAO', 'Alice Johnson',     1, NOW(), 1, NOW(), NOW()),
  (14, 'bob@festival.local',        '$2b$12$kWqsH81XahoSIZZcaiAuCuFJuNl9T./uClS369V9HwWukoVioJtAO', 'Bob Williams',      1, NOW(), 1, NOW(), NOW()),
  (15, 'carol@festival.local',      '$2b$12$kWqsH81XahoSIZZcaiAuCuFJuNl9T./uClS369V9HwWukoVioJtAO', 'Carol Davis',       1, NOW(), 1, NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

SELECT setval('users_id_seq', GREATEST((SELECT MAX(id) FROM users), 15));

-- ----------------------------------------------------------
-- User Profiles
-- ----------------------------------------------------------
INSERT INTO user_profiles (user_id, bio, phone_number, city, state, country, created_at, updated_at) VALUES
  (10, 'Festival Planner platform administrator.', '+1-555-0100', 'Austin', 'TX', 'USA', NOW(), NOW()),
  (11, 'Event producer with 8 years of festival experience.', '+1-555-0111', 'Nashville', 'TN', 'USA', NOW(), NOW()),
  (12, 'Corporate events & music festival organizer.', '+1-555-0112', 'Austin', 'TX', 'USA', NOW(), NOW()),
  (13, 'Music lover and avid festival-goer.', '+1-555-0113', 'Denver', 'CO', 'USA', NOW(), NOW()),
  (14, 'Tech enthusiast attending local events.', '+1-555-0114', 'Portland', 'OR', 'USA', NOW(), NOW()),
  (15, 'Artist and culture explorer.', '+1-555-0115', 'Chicago', 'IL', 'USA', NOW(), NOW())
ON CONFLICT (user_id) DO NOTHING;

-- ----------------------------------------------------------
-- Events
-- ----------------------------------------------------------
INSERT INTO events (id, title, date, end_date, location, description, capacity, status, event_type, is_public, currency_code, created_by, latitude, longitude, waitlist_enabled, tags, created_at, updated_at) VALUES
  (10, 'Summer Beats Festival 2026',
       '2026-07-15', '2026-07-17',
       'Zilker Park, Austin, TX',
       'Three days of live music, food trucks, and art installations at the iconic Zilker Park. Featuring over 50 local and national artists across 4 stages.',
       5000, 'Active', 'Music', TRUE, 'USD', 11,
       30.2672, -97.7727, TRUE, 'music,outdoor,summer,festival', NOW(), NOW()),

  (11, 'Tech Summit 2026',
       '2026-08-20', '2026-08-21',
       'Austin Convention Center, Austin, TX',
       'Two-day technology conference bringing together developers, startups, and industry leaders. Keynotes, workshops, and networking sessions.',
       1200, 'Active', 'Technology', TRUE, 'USD', 11,
       30.2627, -97.7404, FALSE, 'tech,conference,networking', NOW(), NOW()),

  (12, 'Community Food Fair',
       '2026-06-05', '2026-06-05',
       'Downtown Plaza, Nashville, TN',
       'Annual community food fair celebrating local chefs and restaurants. Live cooking demonstrations, tastings, and family activities.',
       800, 'Active', 'Food & Beverage', TRUE, 'USD', 12,
       36.1627, -86.7816, FALSE, 'food,community,family', NOW(), NOW()),

  (13, 'Charity Gala 2026',
       '2026-09-12', '2026-09-12',
       'Grand Hyatt, Austin, TX',
       'Black-tie fundraising gala benefiting local youth arts programs. Live auction, entertainment, and dinner.',
       300, 'Active', 'Charity', FALSE, 'USD', 11,
       30.2632, -97.7408, FALSE, 'charity,gala,formal', NOW(), NOW()),

  (14, 'Art & Culture Walk',
       '2026-05-30', '2026-05-30',
       '6th Street Arts District, Austin, TX',
       'Self-guided walking tour through Austin''s arts district featuring local galleries, murals, and live performances.',
       NULL, 'Active', 'Art & Culture', TRUE, 'USD', 12,
       30.2699, -97.7445, FALSE, 'art,culture,walking', NOW(), NOW()),

  (15, 'Winter Holiday Party',
       '2026-12-18', '2026-12-18',
       'Stubb''s Outdoor Amphitheatre, Austin, TX',
       'Annual end-of-year celebration with live bands, seasonal food, and holiday cheer for the whole team.',
       600, 'Draft', 'Entertainment', FALSE, 'USD', 11,
       30.2632, -97.7368, FALSE, 'holiday,party,celebration', NOW(), NOW()),

  (16, 'Spring Arts Festival',
       '2026-04-18', '2026-04-19',
       'Barton Springs, Austin, TX',
       'Completed spring arts gathering. Featured local artists, craft vendors, and live acoustic performances.',
       2000, 'Completed', 'Art & Culture', TRUE, 'USD', 12,
       30.2641, -97.7760, FALSE, 'art,spring,festival', NOW(), NOW())

ON CONFLICT (id) DO NOTHING;

SELECT setval('events_id_seq', GREATEST((SELECT MAX(id) FROM events), 16));

-- ----------------------------------------------------------
-- Event Categories (link events → categories)
-- ----------------------------------------------------------
INSERT INTO event_categories (event_id, category_id)
SELECT e.id, c.id FROM (VALUES
  (10, 'Music'),
  (11, 'Technology'),
  (11, 'Business'),
  (12, 'Food & Beverage'),
  (13, 'Charity'),
  (14, 'Art & Culture'),
  (15, 'Entertainment'),
  (16, 'Art & Culture')
) AS v(eid, cname)
JOIN events   e ON e.id = v.eid
JOIN categories c ON c.name = v.cname
ON CONFLICT DO NOTHING;

-- ----------------------------------------------------------
-- Event Members (organizers & members per event)
-- ----------------------------------------------------------
INSERT INTO event_members (event_id, user_id, role, joined_at) VALUES
  (10, 11, 'Owner',  NOW()),
  (10, 12, 'Member', NOW()),
  (10, 13, 'Member', NOW()),
  (11, 11, 'Owner',  NOW()),
  (11, 14, 'Member', NOW()),
  (12, 12, 'Owner',  NOW()),
  (12, 15, 'Member', NOW()),
  (13, 11, 'Owner',  NOW()),
  (13, 12, 'Member', NOW()),
  (14, 12, 'Owner',  NOW()),
  (15, 11, 'Owner',  NOW()),
  (16, 12, 'Owner',  NOW())
ON CONFLICT DO NOTHING;

-- ----------------------------------------------------------
-- RSVPs for active events
-- ----------------------------------------------------------
INSERT INTO rsvps (event_id, name, email, guests, status, dietary_restriction, notes, source, checked_in, created_at, updated_at) VALUES
  -- Summer Beats Festival (event 10)
  (10, 'Alice Johnson',    'alice@festival.local',  1, 'Going',     'None',       'So excited for this!',            'public',  FALSE, NOW(), NOW()),
  (10, 'Bob Williams',     'bob@festival.local',    2, 'Going',     'Vegetarian', 'Bringing my partner.',             'public',  FALSE, NOW(), NOW()),
  (10, 'Carol Davis',      'carol@festival.local',  1, 'Going',     'Vegan',      NULL,                               'public',  FALSE, NOW(), NOW()),
  (10, 'David Martinez',   'david.m@example.com',   1, 'Maybe',     'None',       'Depends on work schedule.',        'public',  FALSE, NOW(), NOW()),
  (10, 'Emma Thompson',    'emma.t@example.com',    3, 'Going',     'None',       'Family picnic!',                   'public',  FALSE, NOW(), NOW()),
  (10, 'Frank Garcia',     'frank.g@example.com',   1, 'Going',     'Gluten-Free',NULL,                               'public',  FALSE, NOW(), NOW()),
  (10, 'Grace Wilson',     'grace.w@example.com',   2, 'Going',     'None',       NULL,                               'public',  FALSE, NOW(), NOW()),
  (10, 'Henry Brown',      'henry.b@example.com',   1, 'Not Going', 'None',       'Conflict that weekend.',           'public',  FALSE, NOW(), NOW()),
  (10, 'Isabel Chen',      'isabel.c@example.com',  1, 'Going',     'None',       NULL,                               'public',  FALSE, NOW(), NOW()),
  (10, 'Jake Robinson',    'jake.r@example.com',    1, 'Pending',   'None',       NULL,                               'public',  FALSE, NOW(), NOW()),
  -- Tech Summit (event 11)
  (11, 'Alice Johnson',    'alice@festival.local',  1, 'Going',     'None',       'Looking forward to the workshops.',    'public', FALSE, NOW(), NOW()),
  (11, 'Bob Williams',     'bob@festival.local',    1, 'Going',     'Vegetarian', NULL,                               'public',  FALSE, NOW(), NOW()),
  (11, 'Laura Kim',        'laura.k@example.com',   1, 'Going',     'None',       NULL,                               'public',  FALSE, NOW(), NOW()),
  (11, 'Mark Davis',       'mark.d@example.com',    1, 'Maybe',     'None',       'Need to confirm travel.',          'public',  FALSE, NOW(), NOW()),
  -- Community Food Fair (event 12)
  (12, 'Carol Davis',      'carol@festival.local',  2, 'Going',     'Vegan',      'Bringing kids!',                   'public',  FALSE, NOW(), NOW()),
  (12, 'Alice Johnson',    'alice@festival.local',  1, 'Going',     'None',       NULL,                               'public',  FALSE, NOW(), NOW()),
  (12, 'Peter Jackson',    'peter.j@example.com',   4, 'Going',     'None',       'Family of four.',                  'public',  FALSE, NOW(), NOW()),
  -- Charity Gala (event 13)
  (13, 'Alice Johnson',    'alice@festival.local',  1, 'Going',     'None',       'Happy to support the cause!',      'public',  FALSE, NOW(), NOW()),
  (13, 'Bob Williams',     'bob@festival.local',    2, 'Going',     'None',       'Plus one.',                        'public',  FALSE, NOW(), NOW()),
  -- Spring Arts Festival completed (event 16) — checked in
  (16, 'Alice Johnson',    'alice@festival.local',  1, 'Going',     'None',       NULL, 'public', TRUE,  NOW() - INTERVAL '20 days', NOW() - INTERVAL '20 days'),
  (16, 'Bob Williams',     'bob@festival.local',    1, 'Going',     'None',       NULL, 'public', TRUE,  NOW() - INTERVAL '20 days', NOW() - INTERVAL '20 days'),
  (16, 'Carol Davis',      'carol@festival.local',  1, 'Going',     'None',       NULL, 'public', TRUE,  NOW() - INTERVAL '20 days', NOW() - INTERVAL '20 days')
ON CONFLICT (event_id, email) DO NOTHING;

-- ----------------------------------------------------------
-- Tasks for events
-- ----------------------------------------------------------
INSERT INTO tasks (event_id, title, notes, assignee_name, assigned_user_id, due_date, status, priority, created_by, created_at, updated_at) VALUES
  -- Summer Beats Festival tasks
  (10, 'Book main stage headliner',     'Confirm headliner contract and payment terms.',      'Sarah Organizer', 11, '2026-06-01', 'In Progress', 'High',   11, NOW(), NOW()),
  (10, 'Arrange food truck vendors',    'Contact at least 10 food truck operators.',           'James Organizer', 12, '2026-06-15', 'Pending',     'High',   11, NOW(), NOW()),
  (10, 'Set up ticketing system',       'Configure ticketing platform with tiered pricing.',  'Sarah Organizer', 11, '2026-05-20', 'Complete',    'High',   11, NOW(), NOW()),
  (10, 'Apply for event permits',       'City of Austin parks permit and noise variance.',     'Sarah Organizer', 11, '2026-05-15', 'Complete',    'High',   11, NOW(), NOW()),
  (10, 'Hire security team',            'Minimum 50 security staff for 3-day event.',          'James Organizer', 12, '2026-06-30', 'In Progress', 'High',   11, NOW(), NOW()),
  (10, 'Design event signage',          'Stage banners, directional signs, sponsor boards.',  'James Organizer', 12, '2026-07-01', 'Pending',     'Medium', 11, NOW(), NOW()),
  (10, 'Arrange medical first aid',     'Contract licensed first-aid provider.',               'Sarah Organizer', 11, '2026-07-01', 'Pending',     'High',   11, NOW(), NOW()),
  (10, 'Marketing & social media plan', 'Create campaign for Instagram, Twitter, Facebook.',   NULL,              NULL,'2026-06-01', 'In Progress', 'Medium', 11, NOW(), NOW()),
  -- Tech Summit tasks
  (11, 'Confirm keynote speakers',      'Secure 3 keynote slots.',                            'Sarah Organizer', 11, '2026-07-01', 'In Progress', 'High',   11, NOW(), NOW()),
  (11, 'Set up registration portal',   'Online registration with early-bird pricing.',        'Sarah Organizer', 11, '2026-06-01', 'Complete',    'High',   11, NOW(), NOW()),
  (11, 'Book AV equipment',            'Screens, microphones, live streaming setup.',         'James Organizer', 12, '2026-07-15', 'Pending',     'Medium', 11, NOW(), NOW()),
  (11, 'Arrange catering',             'Lunch and breaks for both days.',                     'James Organizer', 12, '2026-07-20', 'Pending',     'Medium', 11, NOW(), NOW()),
  -- Community Food Fair tasks
  (12, 'Reserve venue',                'Downtown Plaza booking confirmation.',                'James Organizer', 12, '2026-05-01', 'Complete',    'High',   12, NOW(), NOW()),
  (12, 'Recruit local vendors',        'Target 20 restaurants and food stalls.',              'James Organizer', 12, '2026-05-15', 'In Progress', 'High',   12, NOW(), NOW()),
  (12, 'Arrange entertainment',        'Local musicians for stage.',                          NULL,              NULL,'2026-05-20', 'Pending',     'Low',    12, NOW(), NOW())
ON CONFLICT DO NOTHING;

-- ----------------------------------------------------------
-- Task Sub-tasks
-- ----------------------------------------------------------
INSERT INTO task_subtasks (task_id, title, completed) 
SELECT t.id, s.title, s.done FROM tasks t,
  (VALUES ('Send initial inquiry email', TRUE), ('Negotiate contract terms', TRUE), ('Sign contract', FALSE)) AS s(title, done)
WHERE t.event_id = 10 AND t.title = 'Book main stage headliner'
ON CONFLICT DO NOTHING;

-- ----------------------------------------------------------
-- Budget Categories & Expenses
-- ----------------------------------------------------------
INSERT INTO budget_categories (id, event_id, name, allocated_amount, color, created_at) VALUES
  (10, 10, 'Artist Fees',        80000.00, '#6366f1', NOW()),
  (11, 10, 'Venue & Equipment',  30000.00, '#10b981', NOW()),
  (12, 10, 'Marketing',           8000.00, '#f59e0b', NOW()),
  (13, 10, 'Staffing',           15000.00, '#ef4444', NOW()),
  (14, 10, 'Permits & Insurance', 5000.00, '#3b82f6', NOW()),
  (15, 11, 'Venue',              20000.00, '#6366f1', NOW()),
  (16, 11, 'Catering',            8000.00, '#10b981', NOW()),
  (17, 11, 'AV & Tech',           6000.00, '#f59e0b', NOW()),
  (18, 12, 'Venue',               3000.00, '#6366f1', NOW()),
  (19, 12, 'Entertainment',       2000.00, '#10b981', NOW())
ON CONFLICT (id) DO NOTHING;

SELECT setval('budget_categories_id_seq', GREATEST((SELECT MAX(id) FROM budget_categories), 19));

INSERT INTO expenses (event_id, category_id, title, amount, payment_status, vendor_name, notes, currency_code, created_by, created_at, updated_at) VALUES
  (10, 10, 'Headliner Band Fee',          45000.00, 'Paid',    'Cosmic Sounds Agency',  'Headliner deposit paid.',        'USD', 11, NOW(), NOW()),
  (10, 10, 'Supporting Act 1',            12000.00, 'Pending', 'Local Talent Booking',  'Contract pending signature.',    'USD', 11, NOW(), NOW()),
  (10, 10, 'DJ Set',                       5000.00, 'Paid',    'DJ Events Inc.',         NULL,                             'USD', 11, NOW(), NOW()),
  (10, 11, 'Stage Rental',               18000.00, 'Paid',    'Austin Stage Co.',       'Main and two side stages.',      'USD', 11, NOW(), NOW()),
  (10, 11, 'Sound System',                8000.00, 'Paid',    'ProAudio Rentals',       NULL,                             'USD', 11, NOW(), NOW()),
  (10, 12, 'Social Media Ads',            3500.00, 'Paid',    'Digital Marketing Co.',  'Facebook & Instagram campaign.', 'USD', 11, NOW(), NOW()),
  (10, 12, 'Print Flyers',                 800.00, 'Paid',    'FastPrint Austin',       '5000 flyers distributed.',       'USD', 11, NOW(), NOW()),
  (10, 13, 'Security Staff',             10000.00, 'Pending', 'SecureEvents LLC',       '50 guards for 3 days.',          'USD', 11, NOW(), NOW()),
  (10, 14, 'City Permit',                 2500.00, 'Paid',    'City of Austin',         'Parks use permit.',              'USD', 11, NOW(), NOW()),
  (11, 15, 'Convention Center Rental',   15000.00, 'Paid',    'Austin Convention Ctr',  'Full day both days.',            'USD', 11, NOW(), NOW()),
  (11, 16, 'Catering - Day 1',            3500.00, 'Pending', 'Taste of Texas Catering',NULL,                             'USD', 11, NOW(), NOW()),
  (11, 16, 'Catering - Day 2',            3500.00, 'Pending', 'Taste of Texas Catering',NULL,                             'USD', 11, NOW(), NOW()),
  (11, 17, 'Projectors & Screens',        2500.00, 'Paid',    'TechRent Austin',        NULL,                             'USD', 11, NOW(), NOW()),
  (12, 18, 'Plaza Permit',                 500.00, 'Paid',    'Nashville City',         NULL,                             'USD', 12, NOW(), NOW()),
  (12, 19, 'Local Band Fee',              1200.00, 'Pending', 'Nashville Musicians Grp',NULL,                             'USD', 12, NOW(), NOW())
ON CONFLICT DO NOTHING;

-- ----------------------------------------------------------
-- Vendors
-- ----------------------------------------------------------
INSERT INTO vendors (event_id, name, category, email, phone, status, quoted_amount, notes, rating, created_by, created_at, updated_at) VALUES
  (10, 'Cosmic Sounds Agency',   'Entertainment',   'bookings@cosmicsounds.com',   '+1-512-555-0200', 'Confirmed',       45000.00, 'Headliner band agency.',               5, 11, NOW(), NOW()),
  (10, 'Austin Stage Co.',       'Equipment',       'info@austinstage.com',         '+1-512-555-0201', 'Confirmed',       18000.00, 'Stage rental and setup crew.',         5, 11, NOW(), NOW()),
  (10, 'ProAudio Rentals',       'Equipment',       'rent@proaudio.com',            '+1-512-555-0202', 'Confirmed',        8000.00, 'PA system and monitor wedges.',        4, 11, NOW(), NOW()),
  (10, 'SecureEvents LLC',       'Security',        'ops@secureevents.com',         '+1-512-555-0203', 'Booked',          10000.00, '50 security guards.',                  4, 11, NOW(), NOW()),
  (10, 'FastPrint Austin',       'Marketing',       'orders@fastprint.com',         '+1-512-555-0204', 'Confirmed',         800.00, 'Flyers and banners.',                  4, 11, NOW(), NOW()),
  (11, 'Austin Convention Ctr',  'Venue',           'events@austincc.com',          '+1-512-555-0300', 'Confirmed',       15000.00, 'Main hall and breakout rooms.',        5, 11, NOW(), NOW()),
  (11, 'Taste of Texas Catering','Catering',        'chef@tasteoftexas.com',        '+1-512-555-0301', 'Quote Received',   7000.00, 'Buffet lunch + coffee breaks.',        4, 11, NOW(), NOW()),
  (11, 'TechRent Austin',        'Equipment',       'rent@techrent.com',            '+1-512-555-0302', 'Confirmed',        2500.00, 'Projectors, screens, microphones.',    4, 11, NOW(), NOW()),
  (12, 'Nashville Musicians Grp','Entertainment',   'book@nashvillemusic.com',      '+1-615-555-0400', 'Booked',           1200.00, 'Two local bands, 3-hour set each.',    4, 12, NOW(), NOW())
ON CONFLICT DO NOTHING;

-- ----------------------------------------------------------
-- Shopping Lists & Items
-- ----------------------------------------------------------
INSERT INTO shopping_lists (id, event_id, name, created_by, created_at) VALUES
  (10, 10, 'Festival Supplies',  11, NOW()),
  (11, 10, 'Backstage Catering', 11, NOW()),
  (12, 11, 'Conference Supplies',11, NOW())
ON CONFLICT (id) DO NOTHING;

SELECT setval('shopping_lists_id_seq', GREATEST((SELECT MAX(id) FROM shopping_lists), 12));

INSERT INTO shopping_items (list_id, name, quantity, unit, estimated_cost, status, notes, created_at) VALUES
  (10, 'Branded Wristbands',    5000, 'pcs',    500.00, 'Ordered',    'RFID wristbands for ticketing.',  NOW()),
  (10, 'Trash Bags',             200, 'pcs',     80.00, 'Purchased',  NULL,                              NOW()),
  (10, 'First Aid Kits',          20, 'kits',   400.00, 'Purchased',  NULL,                              NOW()),
  (10, 'Event Banners',           30, 'pcs',   1500.00, 'Ordered',    '3x6ft vinyl banners.',            NOW()),
  (10, 'Folding Tables',          50, 'pcs',    750.00, 'Needed',     'For vendor stalls.',              NOW()),
  (10, 'Portable Fans',           20, 'pcs',    600.00, 'Needed',     'Beat the summer heat.',           NOW()),
  (11, 'Bottled Water',          120, 'cases',  360.00, 'Purchased',  'Artist rider requirement.',       NOW()),
  (11, 'Snack Platters',          10, 'pcs',    250.00, 'Needed',     'Backstage greenroom.',            NOW()),
  (12, 'Name Badge Holders',     200, 'pcs',     80.00, 'Purchased',  NULL,                              NOW()),
  (12, 'Notebooks & Pens',       150, 'sets',   225.00, 'Purchased',  'Speaker gift bags.',              NOW()),
  (12, 'Signage Stands',          15, 'pcs',    300.00, 'Needed',     'For session room routing.',       NOW())
ON CONFLICT DO NOTHING;

-- ----------------------------------------------------------
-- Timeline Activities
-- ----------------------------------------------------------
INSERT INTO timeline_activities (event_id, title, description, start_time, end_time, planned_start_time, planned_end_time, status, location, sort_order, created_by, created_at, updated_at) VALUES
  (10, 'Gates Open',            'General admission gates open.',       '2026-07-15 12:00:00', '2026-07-15 12:30:00', '2026-07-15 12:00:00', '2026-07-15 12:30:00', 'planned',     'Main Entrance',    1, 11, NOW(), NOW()),
  (10, 'Opening Act - Stage A', 'Local band warm-up set.',             '2026-07-15 13:00:00', '2026-07-15 14:00:00', '2026-07-15 13:00:00', '2026-07-15 14:00:00', 'planned',     'Stage A',          2, 11, NOW(), NOW()),
  (10, 'Headliner Performance', 'Main headliner set - 90 minutes.',    '2026-07-15 20:00:00', '2026-07-15 21:30:00', '2026-07-15 20:00:00', '2026-07-15 21:30:00', 'planned',     'Main Stage',       3, 11, NOW(), NOW()),
  (10, 'Closing & Cleanup',     'Venue cleanup and vendor breakdown.', '2026-07-15 22:00:00', '2026-07-16 02:00:00', '2026-07-15 22:00:00', '2026-07-16 02:00:00', 'planned',     'All Areas',        4, 11, NOW(), NOW()),
  (11, 'Registration & Check-in','Attendee check-in opens.',           '2026-08-20 08:00:00', '2026-08-20 09:00:00', '2026-08-20 08:00:00', '2026-08-20 09:00:00', 'planned',     'Main Lobby',       1, 11, NOW(), NOW()),
  (11, 'Opening Keynote',       'CEO welcome and industry overview.',  '2026-08-20 09:00:00', '2026-08-20 10:30:00', '2026-08-20 09:00:00', '2026-08-20 10:30:00', 'planned',     'Main Hall',        2, 11, NOW(), NOW()),
  (11, 'Workshop Sessions',     'Parallel breakout workshops.',        '2026-08-20 11:00:00', '2026-08-20 13:00:00', '2026-08-20 11:00:00', '2026-08-20 13:00:00', 'planned',     'Breakout Rooms',   3, 11, NOW(), NOW()),
  (11, 'Networking Lunch',      'Catered lunch and open networking.',  '2026-08-20 13:00:00', '2026-08-20 14:00:00', '2026-08-20 13:00:00', '2026-08-20 14:00:00', 'planned',     'Dining Hall',      4, 11, NOW(), NOW()),
  (11, 'Closing Panel',         'Future of tech panel discussion.',    '2026-08-21 15:00:00', '2026-08-21 16:30:00', '2026-08-21 15:00:00', '2026-08-21 16:30:00', 'planned',     'Main Hall',        5, 11, NOW(), NOW()),
  -- Spring Arts Festival (completed)
  (16, 'Festival Opens',        'Doors open to public.',              '2026-04-18 10:00:00', '2026-04-18 10:30:00', '2026-04-18 10:00:00', '2026-04-18 10:30:00', 'completed',   'Main Gate',        1, 12, NOW(), NOW()),
  (16, 'Gallery Walk',          'Guided tour of featured artists.',   '2026-04-18 11:00:00', '2026-04-18 13:00:00', '2026-04-18 11:00:00', '2026-04-18 13:00:00', 'completed',   'Gallery Area',     2, 12, NOW(), NOW()),
  (16, 'Live Music Set',        'Acoustic performances by locals.',   '2026-04-18 14:00:00', '2026-04-18 17:00:00', '2026-04-18 14:00:00', '2026-04-18 17:00:00', 'completed',   'Stage',            3, 12, NOW(), NOW())
ON CONFLICT DO NOTHING;

-- ----------------------------------------------------------
-- Seating (Charity Gala event 13)
-- ----------------------------------------------------------
INSERT INTO seating_tables (id, event_id, name, capacity, created_at) VALUES
  (10, 13, 'Table 1 - VIP',     10, NOW()),
  (11, 13, 'Table 2',           10, NOW()),
  (12, 13, 'Table 3',           10, NOW()),
  (13, 13, 'Table 4 - Family',  10, NOW())
ON CONFLICT (id) DO NOTHING;

SELECT setval('seating_tables_id_seq', GREATEST((SELECT MAX(id) FROM seating_tables), 13));

-- Assign charity gala RSVPs to tables
INSERT INTO seating_assignments (table_id, rsvp_id)
SELECT st.id, r.id
FROM seating_tables st
JOIN rsvps r ON r.event_id = 13 AND r.email = 'alice@festival.local'
WHERE st.name = 'Table 1 - VIP'
ON CONFLICT DO NOTHING;

INSERT INTO seating_assignments (table_id, rsvp_id)
SELECT st.id, r.id
FROM seating_tables st
JOIN rsvps r ON r.event_id = 13 AND r.email = 'bob@festival.local'
WHERE st.name = 'Table 2'
ON CONFLICT DO NOTHING;

-- ----------------------------------------------------------
-- Notifications
-- ----------------------------------------------------------
INSERT INTO notifications (user_id, type, title, body, link, is_read, created_at) VALUES
  (11, 'event_rsvp',       'New RSVP: Summer Beats Festival',    '10 people have RSVPd to Summer Beats Festival.',          '/events/10/guests',    FALSE, NOW()),
  (11, 'task_due',         'Task Due Soon: Book headliner',       'Book main stage headliner is due in 2 weeks.',             '/events/10/tasks',     FALSE, NOW()),
  (11, 'event_created',    'Event Created: Tech Summit 2026',     'Your Tech Summit 2026 event is now live.',                 '/events/11',           TRUE,  NOW()),
  (12, 'event_rsvp',       'New RSVP: Community Food Fair',       '3 people have RSVPd to Community Food Fair.',             '/events/12/guests',    FALSE, NOW()),
  (12, 'task_due',         'Task Due Soon: Recruit vendors',      'Recruit local vendors is due in 1 week.',                  '/events/12/tasks',     FALSE, NOW()),
  (13, 'event_invite',     'Invited: Summer Beats Festival',      'You have been added to Summer Beats Festival.',            '/events/10',           FALSE, NOW()),
  (13, 'event_invite',     'Invited: Tech Summit 2026',           'You have been added to Tech Summit 2026.',                 '/events/11',           TRUE,  NOW()),
  (14, 'event_invite',     'Invited: Tech Summit 2026',           'You have been added to Tech Summit 2026.',                 '/events/11',           FALSE, NOW()),
  (15, 'event_invite',     'Invited: Community Food Fair',        'You have been added to Community Food Fair.',             '/events/12',           FALSE, NOW()),
  (10, 'system',           'Welcome to Festival Planner',         'Your admin account is all set up and ready to go.',        '/dashboard',           TRUE,  NOW())
ON CONFLICT DO NOTHING;

-- ----------------------------------------------------------
-- Activity Feed
-- ----------------------------------------------------------
INSERT INTO activity_feed (event_id, user_id, action_type, description, link, created_at) VALUES
  (10, 11, 'event_created',   'Sarah Organizer created Summer Beats Festival 2026.',          '/events/10',        NOW() - INTERVAL '7 days'),
  (10, 13, 'rsvp_added',      'Alice Johnson RSVP''d as Going to Summer Beats Festival.',     '/events/10/guests', NOW() - INTERVAL '6 days'),
  (10, 11, 'task_created',    'Sarah Organizer added task: Book main stage headliner.',       '/events/10/tasks',  NOW() - INTERVAL '5 days'),
  (10, 12, 'vendor_added',    'James Organizer added vendor: Austin Stage Co.',               '/events/10',        NOW() - INTERVAL '4 days'),
  (10, 11, 'task_updated',    'Sarah Organizer marked Set up ticketing system as Complete.',  '/events/10/tasks',  NOW() - INTERVAL '3 days'),
  (11, 11, 'event_created',   'Sarah Organizer created Tech Summit 2026.',                    '/events/11',        NOW() - INTERVAL '10 days'),
  (11, 14, 'rsvp_added',      'Bob Williams RSVP''d as Going to Tech Summit 2026.',           '/events/11/guests', NOW() - INTERVAL '4 days'),
  (12, 12, 'event_created',   'James Organizer created Community Food Fair.',                 '/events/12',        NOW() - INTERVAL '14 days'),
  (12, 15, 'rsvp_added',      'Carol Davis RSVP''d as Going to Community Food Fair.',         '/events/12/guests', NOW() - INTERVAL '3 days'),
  (16, 12, 'event_completed', 'James Organizer marked Spring Arts Festival as Completed.',    '/events/16',        NOW() - INTERVAL '18 days')
ON CONFLICT DO NOTHING;

-- ----------------------------------------------------------
-- Communication Log
-- ----------------------------------------------------------
INSERT INTO communication_log (event_id, guest_email, communication_type, subject, content, status, sent_by, sent_at) VALUES
  (10, NULL,                      'announcement', 'Summer Beats Festival - Lineup Announced!',   'We are thrilled to announce our headliner for Summer Beats Festival 2026! Check the website for the full lineup.', 'sent', 11, NOW() - INTERVAL '5 days'),
  (10, 'alice@festival.local',    'confirmation', 'Your RSVP is Confirmed - Summer Beats',       'Hi Alice, your RSVP for Summer Beats Festival 2026 is confirmed. See you there!',                                  'sent', 11, NOW() - INTERVAL '6 days'),
  (11, NULL,                      'announcement', 'Tech Summit 2026 - Early Bird Tickets',        'Early bird registration is now open for Tech Summit 2026. Save 30% before June 1st!',                             'sent', 11, NOW() - INTERVAL '8 days'),
  (12, NULL,                      'announcement', 'Community Food Fair - Vendor Applications',   'Applications are open for vendors at the Community Food Fair. Apply by May 20th.',                                 'sent', 12, NOW() - INTERVAL '3 days')
ON CONFLICT DO NOTHING;

-- ----------------------------------------------------------
-- Event Templates
-- ----------------------------------------------------------
INSERT INTO event_templates (name, description, default_title, default_location, default_capacity, default_event_type, default_status, default_tags, default_is_public, created_by, created_at, updated_at) VALUES
  ('Music Festival Template',    'Template for outdoor music festival events.',   'New Music Festival',    'TBD - Outdoor Venue', 2000, 'Music',          'Draft', 'music,festival,outdoor',   TRUE,  11, NOW(), NOW()),
  ('Tech Conference Template',   'Template for technology conferences.',           'Tech Conference 2026',  'Convention Center',   800,  'Technology',     'Draft', 'tech,conference',           TRUE,  11, NOW(), NOW()),
  ('Charity Gala Template',      'Template for fundraising gala events.',          'Charity Gala',          'Hotel Ballroom',       200, 'Charity',        'Draft', 'charity,gala,formal',       FALSE, 11, NOW(), NOW()),
  ('Community Gathering',        'Template for community meetup events.',          'Community Event',       'Local Park',           500, 'Other',          'Draft', 'community,outdoor',         TRUE,  12, NOW(), NOW())
ON CONFLICT DO NOTHING;

-- ----------------------------------------------------------
-- Budget Templates
-- ----------------------------------------------------------
INSERT INTO budget_templates (name, description, created_by, created_at) VALUES
  ('Music Festival Budget',   'Standard budget breakdown for a music festival.',  11, NOW()),
  ('Tech Conference Budget',  'Standard budget for a technology conference.',     11, NOW()),
  ('Gala Event Budget',       'Standard budget for a formal gala event.',         11, NOW())
ON CONFLICT DO NOTHING;

INSERT INTO budget_template_items (template_id, name, allocated_amount, color)
SELECT bt.id, ti.name, ti.amount, ti.color
FROM budget_templates bt,
  (VALUES 
    ('Artist Fees',         80000.00, '#6366f1'),
    ('Venue & Equipment',   30000.00, '#10b981'),
    ('Marketing',            8000.00, '#f59e0b'),
    ('Staffing',            15000.00, '#ef4444'),
    ('Permits & Insurance',  5000.00, '#3b82f6'),
    ('Miscellaneous',        2000.00, '#8b5cf6')
  ) AS ti(name, amount, color)
WHERE bt.name = 'Music Festival Budget'
ON CONFLICT DO NOTHING;

INSERT INTO budget_template_items (template_id, name, allocated_amount, color)
SELECT bt.id, ti.name, ti.amount, ti.color
FROM budget_templates bt,
  (VALUES 
    ('Venue',            20000.00, '#6366f1'),
    ('Catering',          8000.00, '#10b981'),
    ('AV & Tech',         6000.00, '#f59e0b'),
    ('Marketing',         3000.00, '#ef4444'),
    ('Speaker Fees',     10000.00, '#3b82f6')
  ) AS ti(name, amount, color)
WHERE bt.name = 'Tech Conference Budget'
ON CONFLICT DO NOTHING;

-- ----------------------------------------------------------
-- RSVP Custom Questions (for Summer Beats Festival)
-- ----------------------------------------------------------
INSERT INTO rsvp_questions (event_id, prompt, question_type, options, required, sort_order, created_at, updated_at) VALUES
  (10, 'Which stage are you most excited about?', 'single_choice',
       '["Main Stage","Stage A","Stage B","Stage C"]'::jsonb, FALSE, 1, NOW(), NOW()),
  (10, 'Do you have any accessibility requirements?', 'short_text',
       NULL, FALSE, 2, NOW(), NOW()),
  (10, 'How did you hear about this festival?', 'single_choice',
       '["Social Media","Friend/Family","Email Newsletter","Flyer","Other"]'::jsonb, FALSE, 3, NOW(), NOW())
ON CONFLICT DO NOTHING;

-- ----------------------------------------------------------
-- Exchange Rates (seed common currencies)
-- ----------------------------------------------------------
INSERT INTO exchange_rates (base_currency, quote_currency, rate, source, fetched_at) VALUES
  ('USD', 'EUR', 0.92000000, 'manual', NOW()),
  ('USD', 'GBP', 0.78000000, 'manual', NOW()),
  ('USD', 'CAD', 1.36000000, 'manual', NOW()),
  ('USD', 'AUD', 1.52000000, 'manual', NOW()),
  ('USD', 'MXN', 17.10000000,'manual', NOW()),
  ('EUR', 'USD', 1.08700000, 'manual', NOW()),
  ('GBP', 'USD', 1.28200000, 'manual', NOW())
ON CONFLICT (base_currency, quote_currency) DO UPDATE
  SET rate = EXCLUDED.rate, fetched_at = EXCLUDED.fetched_at;

-- ----------------------------------------------------------
-- Store Suggestions (event 10 shopping list)
-- ----------------------------------------------------------
INSERT INTO store_suggestions (event_id, name, website, category, notes, suggested_by, status, created_at, updated_at) VALUES
  (10, 'Walmart',       'https://walmart.com',    'General',   'Bulk supplies and disposables.',    11, 'approved', NOW(), NOW()),
  (10, 'Staples',       'https://staples.com',    'Office',    'Signage and office supplies.',      11, 'approved', NOW(), NOW()),
  (10, 'Costco',        'https://costco.com',     'Food',      'Bulk food and beverage items.',     12, 'pending',  NOW(), NOW()),
  (11, 'Amazon Business','https://business.amazon.com','Tech', 'Tech accessories and peripherals.', 11, 'approved', NOW(), NOW())
ON CONFLICT DO NOTHING;

-- ----------------------------------------------------------
-- Event Filter Presets
-- ----------------------------------------------------------
INSERT INTO event_filter_presets (name, filters, user_id, created_at, updated_at) VALUES
  ('Active Public Events', '{"status":"Active","is_public":true}',                     11, NOW(), NOW()),
  ('My Music Events',      '{"event_type":"Music","status":"Active"}',                  11, NOW(), NOW()),
  ('Upcoming Tech Events', '{"event_type":"Technology","status":"Active"}',             11, NOW(), NOW()),
  ('Completed Events',     '{"status":"Completed"}',                                    12, NOW(), NOW()),
  ('Draft Events',         '{"status":"Draft"}',                                        12, NOW(), NOW())
ON CONFLICT DO NOTHING;

-- ----------------------------------------------------------
-- Gallery Albums (Spring Arts Festival – completed)
-- ----------------------------------------------------------
INSERT INTO gallery_albums (event_id, name, description, created_by, created_at, updated_at) VALUES
  (16, 'Festival Highlights',  'Best photos from the Spring Arts Festival.',    12, NOW(), NOW()),
  (16, 'Artist Showcases',     'Photos of featured artists and their work.',    12, NOW(), NOW()),
  (10, 'Summer Beats Preview', 'Pre-festival venue and setup photos.',          11, NOW(), NOW())
ON CONFLICT DO NOTHING;

-- ==============================================================
-- Row-Level Security (#702 follow-up)
--
-- Mirror the policies installed by the v2 migration directly into init.sql
-- so a freshly-bootstrapped database (Postgres docker-entrypoint loads this
-- file before the backend runs `runMigrations`) is not briefly exposed
-- without policies on event-scoped tables.
--
-- Every policy carries a fail-open "no context" branch
-- (`NULLIF(current_setting('app.current_user_id', true), '') IS NULL`) so
-- jobs, migrations, tests, and BYPASSRLS-less seed steps keep working
-- exactly as they did before. Coverage for the v10 tables
-- (task_assignees, task_escalation_rules, timeline_templates*,
-- entity_change_history) lives in migrations/v12-rls-coverage-followup-702
-- and is applied at backend startup.
--
-- All statements are idempotent: ENABLE/FORCE is a no-op if already set,
-- and policies are guarded by pg_policies existence checks.
-- ==============================================================

ALTER TABLE events        ENABLE ROW LEVEL SECURITY;
ALTER TABLE events        FORCE  ROW LEVEL SECURITY;
ALTER TABLE event_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_members FORCE  ROW LEVEL SECURITY;
ALTER TABLE tasks         ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks         FORCE  ROW LEVEL SECURITY;
ALTER TABLE expenses      ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses      FORCE  ROW LEVEL SECURITY;
ALTER TABLE vendors       ENABLE ROW LEVEL SECURITY;
ALTER TABLE vendors       FORCE  ROW LEVEL SECURITY;
ALTER TABLE rsvps         ENABLE ROW LEVEL SECURITY;
ALTER TABLE rsvps         FORCE  ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'events' AND policyname = 'rls_events_owner_or_member') THEN
    CREATE POLICY rls_events_owner_or_member ON events
      USING (
        created_by = NULLIF(current_setting('app.current_user_id', true), '')::int
        OR id IN (
          SELECT event_id FROM event_members
          WHERE user_id = NULLIF(current_setting('app.current_user_id', true), '')::int
        )
        OR NULLIF(current_setting('app.current_user_id', true), '') IS NULL
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'event_members' AND policyname = 'rls_event_members_self') THEN
    CREATE POLICY rls_event_members_self ON event_members
      USING (
        user_id = NULLIF(current_setting('app.current_user_id', true), '')::int
        OR NULLIF(current_setting('app.current_user_id', true), '') IS NULL
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'tasks' AND policyname = 'rls_tasks_event_member') THEN
    CREATE POLICY rls_tasks_event_member ON tasks
      USING (
        event_id IN (
          SELECT event_id FROM event_members
          WHERE user_id = NULLIF(current_setting('app.current_user_id', true), '')::int
        )
        OR NULLIF(current_setting('app.current_user_id', true), '') IS NULL
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'expenses' AND policyname = 'rls_expenses_event_member') THEN
    CREATE POLICY rls_expenses_event_member ON expenses
      USING (
        event_id IN (
          SELECT event_id FROM event_members
          WHERE user_id = NULLIF(current_setting('app.current_user_id', true), '')::int
        )
        OR NULLIF(current_setting('app.current_user_id', true), '') IS NULL
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'vendors' AND policyname = 'rls_vendors_event_member') THEN
    CREATE POLICY rls_vendors_event_member ON vendors
      USING (
        event_id IN (
          SELECT event_id FROM event_members
          WHERE user_id = NULLIF(current_setting('app.current_user_id', true), '')::int
        )
        OR NULLIF(current_setting('app.current_user_id', true), '') IS NULL
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'rsvps' AND policyname = 'rls_rsvps_access') THEN
    CREATE POLICY rls_rsvps_access ON rsvps
      USING (
        user_id = NULLIF(current_setting('app.current_user_id', true), '')::int
        OR event_id IN (
          SELECT event_id FROM event_members
          WHERE user_id = NULLIF(current_setting('app.current_user_id', true), '')::int
        )
        OR NULLIF(current_setting('app.current_user_id', true), '') IS NULL
      );
  END IF;
END $$;
