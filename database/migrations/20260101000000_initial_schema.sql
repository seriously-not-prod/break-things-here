-- Migration: 20260101000000_initial_schema.sql
-- Description: Complete initial PostgreSQL schema for Festival Event Planner
-- Author: sumitprajapati29-sudo
-- Date: 2026-01-01
-- Issue: #339
--
-- Notes:
--   - PostgreSQL only. No SQLite syntax.
--   - All DDL is idempotent (IF NOT EXISTS / ON CONFLICT DO NOTHING).
--   - Every UP block is paired with a DOWN rollback block at the bottom.

-- ============================================================
-- UP
-- ============================================================

-- ------------------------------------------------------------
-- Schema-version tracking table
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS schema_migrations (
  version     TEXT PRIMARY KEY,
  applied_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ------------------------------------------------------------
-- Roles & permissions (RBAC)
-- Must come before users because users.role_id references roles.id
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS roles (
  id          SERIAL PRIMARY KEY,
  name        TEXT UNIQUE NOT NULL,
  description TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
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
  created_at  TIMESTAMPTZ DEFAULT NOW()
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

CREATE TABLE IF NOT EXISTS role_permissions (
  role_id       INTEGER NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission_id INTEGER NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
  PRIMARY KEY (role_id, permission_id)
);

-- Assign all permissions to Admin
INSERT INTO role_permissions (role_id, permission_id)
  SELECT 3, id FROM permissions
ON CONFLICT DO NOTHING;

-- ------------------------------------------------------------
-- Users
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id                         SERIAL PRIMARY KEY,
  email                      TEXT UNIQUE NOT NULL,
  password_hash              TEXT NOT NULL,
  display_name               TEXT NOT NULL DEFAULT '',
  email_verified             INTEGER DEFAULT 0,
  email_verified_at          TIMESTAMPTZ,
  email_verification_token   TEXT,
  pending_email              TEXT,
  pending_email_token        TEXT,
  pending_email_token_expiry TIMESTAMPTZ,
  role_id                    INTEGER DEFAULT 1 REFERENCES roles(id) ON DELETE SET DEFAULT,
  account_locked             INTEGER DEFAULT 0,
  locked_until               TIMESTAMPTZ,
  login_attempts             INTEGER DEFAULT 0,
  last_login                 TIMESTAMPTZ,
  created_at                 TIMESTAMPTZ DEFAULT NOW(),
  updated_at                 TIMESTAMPTZ DEFAULT NOW(),
  deleted_at                 TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_users_email      ON users(LOWER(email));
CREATE INDEX IF NOT EXISTS idx_users_deleted_at ON users(deleted_at);
CREATE INDEX IF NOT EXISTS idx_users_last_login ON users(last_login);

-- ------------------------------------------------------------
-- Sessions
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sessions (
  id             SERIAL PRIMARY KEY,
  user_id        INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token          TEXT NOT NULL UNIQUE,
  refresh_token  TEXT NOT NULL UNIQUE,
  expires_at     TIMESTAMPTZ NOT NULL,
  last_activity  TIMESTAMPTZ DEFAULT NOW(),
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_token   ON sessions(token);

-- ------------------------------------------------------------
-- Password reset
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id             SERIAL PRIMARY KEY,
  user_id        INTEGER REFERENCES users(id) ON DELETE SET NULL,
  email          TEXT NOT NULL,
  token_selector TEXT NOT NULL DEFAULT '',
  token          TEXT NOT NULL UNIQUE,
  expires_at     TIMESTAMPTZ NOT NULL,
  used           INTEGER DEFAULT 0,
  used_at        TIMESTAMPTZ,
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_prt_token_selector ON password_reset_tokens(token_selector);

CREATE TABLE IF NOT EXISTS password_reset_rate_limit (
  id             SERIAL PRIMARY KEY,
  email          TEXT NOT NULL UNIQUE,
  request_count  INTEGER DEFAULT 1,
  window_start   TIMESTAMPTZ DEFAULT NOW()
);

-- ------------------------------------------------------------
-- Audit log
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS audit_log (
  id          SERIAL PRIMARY KEY,
  user_id     INTEGER REFERENCES users(id) ON DELETE SET NULL,
  email       TEXT,
  action      TEXT NOT NULL,
  description TEXT,
  ip_address  TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_log_user_id    ON audit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON audit_log(created_at);

-- ------------------------------------------------------------
-- User profiles
-- ------------------------------------------------------------
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
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

-- ------------------------------------------------------------
-- Events
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS events (
  id          SERIAL PRIMARY KEY,
  title       TEXT NOT NULL,
  event_date  DATE NOT NULL,
  location    TEXT NOT NULL DEFAULT '',
  description TEXT,
  capacity    INTEGER,
  status      TEXT CHECK (status IN ('Draft', 'Published', 'Active', 'Completed', 'Cancelled')) DEFAULT 'Draft',
  created_by  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW(),
  deleted_at  TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_events_status     ON events(status);
CREATE INDEX IF NOT EXISTS idx_events_created_by ON events(created_by);
CREATE INDEX IF NOT EXISTS idx_events_deleted_at ON events(deleted_at);
CREATE INDEX IF NOT EXISTS idx_events_event_date ON events(event_date);

-- ------------------------------------------------------------
-- Event members (team / collaborators)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS event_members (
  id         SERIAL PRIMARY KEY,
  event_id   INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role       TEXT DEFAULT 'Member',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (event_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_event_members_event_id ON event_members(event_id);
CREATE INDEX IF NOT EXISTS idx_event_members_user_id  ON event_members(user_id);

-- ------------------------------------------------------------
-- Tasks
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tasks (
  id               SERIAL PRIMARY KEY,
  event_id         INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  title            TEXT NOT NULL,
  notes            TEXT,
  assignee_name    TEXT,
  assigned_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  due_date         DATE,
  status           TEXT CHECK (status IN ('Pending', 'In Progress', 'Complete', 'Completed')) DEFAULT 'Pending',
  priority         TEXT CHECK (priority IN ('Low', 'Medium', 'High')) DEFAULT 'Medium',
  created_by       INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tasks_event_id         ON tasks(event_id);
CREATE INDEX IF NOT EXISTS idx_tasks_assigned_user_id ON tasks(assigned_user_id);
CREATE INDEX IF NOT EXISTS idx_tasks_due_date         ON tasks(due_date);

-- ------------------------------------------------------------
-- RSVPs
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS rsvps (
  id         SERIAL PRIMARY KEY,
  event_id   INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  email      TEXT NOT NULL,
  guests     INTEGER DEFAULT 1,
  status     TEXT CHECK (status IN ('Pending', 'Going', 'Not Going', 'Maybe', 'Confirmed', 'Declined')) DEFAULT 'Pending',
  notes      TEXT,
  source     TEXT CHECK (source IN ('internal', 'public')) DEFAULT 'public',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (event_id, email)
);

CREATE INDEX IF NOT EXISTS idx_rsvps_event_id ON rsvps(event_id);
CREATE INDEX IF NOT EXISTS idx_rsvps_status   ON rsvps(status);

-- ------------------------------------------------------------
-- Event budgets
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS event_budgets (
  id           SERIAL PRIMARY KEY,
  event_id     INTEGER NOT NULL UNIQUE REFERENCES events(id) ON DELETE CASCADE,
  total_budget NUMERIC(12, 2) NOT NULL DEFAULT 0,
  currency     TEXT NOT NULL DEFAULT 'USD',
  notes        TEXT,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

-- ------------------------------------------------------------
-- Expense categories
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS expense_categories (
  id         SERIAL PRIMARY KEY,
  name       TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO expense_categories (name) VALUES
  ('Catering'),
  ('Audio/Visual'),
  ('Venue'),
  ('Marketing'),
  ('Staffing'),
  ('Transport'),
  ('Accommodation'),
  ('Décor'),
  ('Entertainment'),
  ('Miscellaneous')
ON CONFLICT (name) DO NOTHING;

-- ------------------------------------------------------------
-- Expenses
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS expenses (
  id          SERIAL PRIMARY KEY,
  event_id    INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  category_id INTEGER REFERENCES expense_categories(id) ON DELETE SET NULL,
  description TEXT NOT NULL,
  amount      NUMERIC(12, 2) NOT NULL DEFAULT 0,
  receipt_url TEXT,
  incurred_at DATE,
  created_by  INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_expenses_event_id    ON expenses(event_id);
CREATE INDEX IF NOT EXISTS idx_expenses_category_id ON expenses(category_id);

-- ------------------------------------------------------------
-- Venues
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS venues (
  id           SERIAL PRIMARY KEY,
  name         TEXT NOT NULL,
  address      TEXT,
  city         TEXT,
  state        TEXT,
  country      TEXT,
  capacity     INTEGER,
  contact_name TEXT,
  contact_email TEXT,
  contact_phone TEXT,
  notes        TEXT,
  created_by   INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_venues_created_by ON venues(created_by);

-- ------------------------------------------------------------
-- Vendors
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS vendors (
  id            SERIAL PRIMARY KEY,
  name          TEXT NOT NULL,
  category      TEXT,
  contact_name  TEXT,
  contact_email TEXT,
  contact_phone TEXT,
  website       TEXT,
  notes         TEXT,
  created_by    INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_vendors_created_by ON vendors(created_by);

-- ------------------------------------------------------------
-- Event vendors (junction)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS event_vendors (
  id         SERIAL PRIMARY KEY,
  event_id   INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  vendor_id  INTEGER NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  status     TEXT CHECK (status IN ('Enquired', 'Confirmed', 'Cancelled')) DEFAULT 'Enquired',
  notes      TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (event_id, vendor_id)
);

CREATE INDEX IF NOT EXISTS idx_event_vendors_event_id  ON event_vendors(event_id);
CREATE INDEX IF NOT EXISTS idx_event_vendors_vendor_id ON event_vendors(vendor_id);

-- ------------------------------------------------------------
-- Event documents / media
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS event_documents (
  id          SERIAL PRIMARY KEY,
  event_id    INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  filename    TEXT NOT NULL,
  original_name TEXT NOT NULL,
  mime_type   TEXT,
  size_bytes  BIGINT,
  url         TEXT NOT NULL,
  uploaded_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_event_documents_event_id ON event_documents(event_id);

-- ------------------------------------------------------------
-- Notifications
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS notifications (
  id         SERIAL PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type       TEXT NOT NULL,
  title      TEXT NOT NULL,
  body       TEXT,
  read       BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_read    ON notifications(read);

-- ------------------------------------------------------------
-- Record this migration
-- ------------------------------------------------------------
INSERT INTO schema_migrations (version) VALUES ('20260101000000')
ON CONFLICT (version) DO NOTHING;


-- ============================================================
-- DOWN (rollback — execute in reverse order)
-- ============================================================
--
-- DELETE FROM schema_migrations WHERE version = '20260101000000';
-- DROP TABLE IF EXISTS notifications;
-- DROP TABLE IF EXISTS event_documents;
-- DROP TABLE IF EXISTS event_vendors;
-- DROP TABLE IF EXISTS vendors;
-- DROP TABLE IF EXISTS venues;
-- DROP TABLE IF EXISTS expenses;
-- DROP TABLE IF EXISTS expense_categories;
-- DROP TABLE IF EXISTS event_budgets;
-- DROP TABLE IF EXISTS rsvps;
-- DROP TABLE IF EXISTS tasks;
-- DROP TABLE IF EXISTS event_members;
-- DROP TABLE IF EXISTS events;
-- DROP TABLE IF EXISTS user_profiles;
-- DROP TABLE IF EXISTS audit_log;
-- DROP TABLE IF EXISTS password_reset_rate_limit;
-- DROP TABLE IF EXISTS password_reset_tokens;
-- DROP TABLE IF EXISTS sessions;
-- DROP TABLE IF EXISTS users;
-- DROP TABLE IF EXISTS role_permissions;
-- DROP TABLE IF EXISTS permissions;
-- DROP TABLE IF EXISTS roles;
-- DROP TABLE IF EXISTS schema_migrations;
