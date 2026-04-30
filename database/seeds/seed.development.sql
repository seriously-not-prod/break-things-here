-- Seed: seed.development.sql
-- Description: Development environment seed data for Festival Event Planner
-- Environment: development ONLY — never run against stage or main
-- Issue: #339
--
-- Usage:
--   psql "$DATABASE_URL" -f database/seeds/seed.development.sql
--
-- Prerequisites:
--   Run all migrations first:
--   for f in database/migrations/*.sql; do psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -f "$f"; done

-- ------------------------------------------------------------
-- Roles (idempotent — same as migration, safe to re-run)
-- ------------------------------------------------------------
INSERT INTO roles (id, name, description) VALUES
  (1, 'Attendee',  'Default role for new users'),
  (2, 'Organizer', 'Can create and manage events'),
  (3, 'Admin',     'Full system access')
ON CONFLICT (id) DO NOTHING;

SELECT setval('roles_id_seq', GREATEST((SELECT MAX(id) FROM roles), 3));

-- ------------------------------------------------------------
-- Development users
-- Passwords are bcrypt hashes of the plaintext shown in comments.
-- DO NOT use these credentials in any environment other than development.
-- ------------------------------------------------------------

-- admin@example.com / Admin1234!
INSERT INTO users (email, password_hash, display_name, email_verified, role_id) VALUES
  ('admin@example.com',
   '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewFRpOVt1PQSRG2O',
   'Dev Admin',
   1,
   3)
ON CONFLICT (email) DO NOTHING;

-- organizer@example.com / Organizer1234!
INSERT INTO users (email, password_hash, display_name, email_verified, role_id) VALUES
  ('organizer@example.com',
   '$2b$12$K7zBx9Yq2LpNmR8sT4uVeOoG3JhXWfD1cA6E0sZ5wI7vM9nQ8rL2K',
   'Dev Organizer',
   1,
   2)
ON CONFLICT (email) DO NOTHING;

-- attendee@example.com / Attendee1234!
INSERT INTO users (email, password_hash, display_name, email_verified, role_id) VALUES
  ('attendee@example.com',
   '$2b$12$H8mCy0Zr3MqOoS9tU5vWfPpH4KiYXgE2dB7F1sA6xJ8wN0nQ9rM3L',
   'Dev Attendee',
   1,
   1)
ON CONFLICT (email) DO NOTHING;

-- ------------------------------------------------------------
-- Create user profiles for seed users
-- ------------------------------------------------------------
INSERT INTO user_profiles (user_id, bio, city, country)
  SELECT id, 'Development admin account', 'London', 'United Kingdom'
  FROM users WHERE email = 'admin@example.com'
ON CONFLICT (user_id) DO NOTHING;

INSERT INTO user_profiles (user_id, bio, city, country)
  SELECT id, 'Development organizer account', 'Manchester', 'United Kingdom'
  FROM users WHERE email = 'organizer@example.com'
ON CONFLICT (user_id) DO NOTHING;

INSERT INTO user_profiles (user_id, bio, city, country)
  SELECT id, 'Development attendee account', 'Birmingham', 'United Kingdom'
  FROM users WHERE email = 'attendee@example.com'
ON CONFLICT (user_id) DO NOTHING;

-- ------------------------------------------------------------
-- Sample events (organizer-owned)
-- ------------------------------------------------------------
INSERT INTO events (title, event_date, location, description, capacity, status, created_by)
  SELECT
    'Summer Music Festival 2026',
    '2026-07-15',
    'Hyde Park, London',
    'Annual summer music festival with multiple stages and food vendors.',
    5000,
    'Published',
    u.id
  FROM users u WHERE u.email = 'organizer@example.com'
ON CONFLICT DO NOTHING;

INSERT INTO events (title, event_date, location, description, capacity, status, created_by)
  SELECT
    'Tech Conference 2026',
    '2026-09-10',
    'ExCeL London',
    'Annual technology conference featuring talks, workshops, and networking.',
    2000,
    'Draft',
    u.id
  FROM users u WHERE u.email = 'organizer@example.com'
ON CONFLICT DO NOTHING;

-- ------------------------------------------------------------
-- Sample expense categories (idempotent)
-- ------------------------------------------------------------
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
