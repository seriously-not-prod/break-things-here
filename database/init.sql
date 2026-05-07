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
CREATE TABLE IF NOT EXISTS communication_log (
  id       SERIAL PRIMARY KEY,
  event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  rsvp_id  INTEGER REFERENCES rsvps(id) ON DELETE SET NULL,
  type     TEXT NOT NULL CHECK(type IN ('invitation','reminder','announcement','thank_you')),
  subject  TEXT NOT NULL,
  body     TEXT NOT NULL,
  sent_by  INTEGER REFERENCES users(id) ON DELETE SET NULL,
  sent_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
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
  id          SERIAL PRIMARY KEY,
  event_id    INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  description TEXT,
  start_time  TIMESTAMP,
  end_time    TIMESTAMP,
  location    TEXT,
  vendor_id   INTEGER REFERENCES vendors(id) ON DELETE SET NULL,
  sort_order  INTEGER DEFAULT 0,
  created_by  INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
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
