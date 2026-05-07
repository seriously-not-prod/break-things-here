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
  pending_email_token_expiry TIMESTAMP,
  role_id                   INTEGER DEFAULT 1,
  account_locked            INTEGER DEFAULT 0,
  locked_until              TIMESTAMP,
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
  expires_at     TIMESTAMP NOT NULL,
  last_activity  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- Password reset
-- ============================================================
CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id          SERIAL PRIMARY KEY,
  user_id     INTEGER REFERENCES users(id) ON DELETE SET NULL,
  email       TEXT NOT NULL,
  token       TEXT NOT NULL UNIQUE,
  expires_at  TIMESTAMP NOT NULL,
  used        INTEGER DEFAULT 0,
  used_at     TIMESTAMP,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS password_reset_rate_limit (
  id             SERIAL PRIMARY KEY,
  email          TEXT NOT NULL UNIQUE,
  request_count  INTEGER DEFAULT 1,
  window_start   TIMESTAMP DEFAULT CURRENT_TIMESTAMP
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
ALTER TABLE events ADD COLUMN IF NOT EXISTS rsvp_deadline TIMESTAMP;
ALTER TABLE events ADD COLUMN IF NOT EXISTS tags TEXT;
ALTER TABLE events ADD COLUMN IF NOT EXISTS end_date TEXT;
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
ALTER TABLE rsvps ADD COLUMN IF NOT EXISTS rsvp_deadline TIMESTAMP;

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
  color            TEXT DEFAULT '#6366f1',
  created_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS expenses (
  id             SERIAL PRIMARY KEY,
  event_id       INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  category_id    INTEGER REFERENCES budget_categories(id) ON DELETE SET NULL,
  title          TEXT NOT NULL,
  amount         NUMERIC(10,2) NOT NULL,
  payment_status TEXT CHECK(payment_status IN ('Pending','Paid','Overdue','Cancelled')) DEFAULT 'Pending',
  vendor_name    TEXT,
  notes          TEXT,
  created_by     INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

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
  id             SERIAL PRIMARY KEY,
  list_id        INTEGER NOT NULL REFERENCES shopping_lists(id) ON DELETE CASCADE,
  name           TEXT NOT NULL,
  quantity       INTEGER DEFAULT 1,
  unit           TEXT,
  estimated_cost NUMERIC(10,2),
  actual_cost    NUMERIC(10,2),
  status         TEXT CHECK(status IN ('Needed','Purchased','Not Available','Ordered')) DEFAULT 'Needed',
  assigned_to    INTEGER REFERENCES users(id) ON DELETE SET NULL,
  notes          TEXT,
  created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP
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
-- Store Suggestions (#464)
-- ============================================================
CREATE TABLE IF NOT EXISTS store_suggestions (
  id           SERIAL PRIMARY KEY,
  event_id     INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  website      TEXT,
  notes        TEXT,
  category     TEXT,
  suggested_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  status       TEXT CHECK(status IN ('pending','approved','rejected')) DEFAULT 'pending',
  created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_store_suggestions_event_id ON store_suggestions(event_id);

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

CREATE TABLE IF NOT EXISTS exchange_rates (
  base_currency  TEXT NOT NULL,
  quote_currency TEXT NOT NULL,
  rate           NUMERIC(18,8) NOT NULL CHECK (rate > 0),
  source         TEXT NOT NULL DEFAULT 'manual',
  fetched_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (base_currency, quote_currency)
);

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
