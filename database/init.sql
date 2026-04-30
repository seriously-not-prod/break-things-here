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

CREATE INDEX IF NOT EXISTS idx_rsvps_event_id ON rsvps(event_id);

-- ============================================================
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
-- Phase 3: Budget & Expense Management
-- ============================================================
CREATE TABLE IF NOT EXISTS expense_categories (
  id          SERIAL PRIMARY KEY,
  name        TEXT NOT NULL UNIQUE,
  description TEXT,
  color       TEXT DEFAULT '#6366f1',
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS event_budgets (
  id           SERIAL PRIMARY KEY,
  event_id     INTEGER NOT NULL UNIQUE REFERENCES events(id) ON DELETE CASCADE,
  total_budget NUMERIC(12,2) NOT NULL DEFAULT 0,
  currency     TEXT NOT NULL DEFAULT 'USD',
  notes        TEXT,
  created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_event_budgets_event_id ON event_budgets(event_id);

CREATE TABLE IF NOT EXISTS expenses (
  id          SERIAL PRIMARY KEY,
  event_id    INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  category_id INTEGER REFERENCES expense_categories(id) ON DELETE SET NULL,
  title       TEXT NOT NULL,
  amount      NUMERIC(12,2) NOT NULL DEFAULT 0,
  paid_by     TEXT,
  receipt_url TEXT,
  status      TEXT CHECK(status IN ('Pending', 'Approved', 'Rejected')) DEFAULT 'Pending',
  notes       TEXT,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_expenses_event_id ON expenses(event_id);
CREATE INDEX IF NOT EXISTS idx_expenses_category_id ON expenses(category_id);
