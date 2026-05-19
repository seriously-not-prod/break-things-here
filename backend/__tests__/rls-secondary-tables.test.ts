/**
 * RLS integration tests for secondary tables — Task #768
 *
 * Proves that the v16 migration's row-level security policies on the 17
 * secondary tables correctly allow and deny access.
 *
 * Each group of tests creates an isolated schema, seeds minimal data, enables
 * RLS with the same policy SQL shipped in v16-rls-secondary-tables.sql, then
 * asserts visibility (positive) and invisibility (negative) from different
 * user contexts.
 *
 * Pattern mirrors backend/__tests__/rls.test.ts:
 *   - A non-superuser role (equip_rls_test_role) is used so RLS applies.
 *   - `SET LOCAL ROLE` + `set_config('app.current_user_id', ...)` sets context.
 *   - Without a user_id context, all rows are visible (fail-open, for jobs/migration).
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { randomUUID } from 'node:crypto';
import { resolveTestDatabaseUrl } from '../test-database-url.js';

const CONNECTION_STRING = resolveTestDatabaseUrl();
const RLS_TEST_ROLE = 'equip_rls_test_role';

// ── Shared pool for schema lifecycle (superuser) ─────────────────────────────

let pool: pg.Pool;
let schema: string;

// Unique token counter — avoids UNIQUE constraint violations on token columns
let tokenCounter = 0;
function nextToken(): string {
  return `tok_${randomUUID().replace(/-/g, '')}_${tokenCounter++}`;
}

// ── Schema bootstrap helpers ─────────────────────────────────────────────────

/** Execute SQL with the superuser pool (RLS does NOT apply). */
async function exec(sql: string, params: unknown[] = []): Promise<pg.QueryResult> {
  return pool.query(sql, params);
}

/** Execute a SELECT as a specific user (RLS applies). */
async function queryAsUser<T extends pg.QueryResultRow = pg.QueryResultRow>(
  userId: number,
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`SET LOCAL search_path TO "${schema}", public`);
    await client.query(`SET LOCAL ROLE ${RLS_TEST_ROLE}`);
    await client.query('SELECT set_config($1, $2, true)', ['app.current_user_id', String(userId)]);
    const result = await client.query<T>(sql, params);
    await client.query('COMMIT');
    return result.rows;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/** Execute a SELECT without any user context (fail-open branch). */
async function queryNoContext<T extends pg.QueryResultRow = pg.QueryResultRow>(
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`SET LOCAL search_path TO "${schema}", public`);
    await client.query(`SET LOCAL ROLE ${RLS_TEST_ROLE}`);
    // Deliberately do NOT set app.current_user_id
    const result = await client.query<T>(sql, params);
    await client.query('COMMIT');
    return result.rows;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// ── Seed helpers ─────────────────────────────────────────────────────────────

async function seedUser(email: string): Promise<number> {
  const r = await exec(
    `INSERT INTO "${schema}".users (email, display_name) VALUES ($1, $2) RETURNING id`,
    [email, email.split('@')[0]],
  );
  return r.rows[0].id as number;
}

async function seedEvent(title: string, createdBy: number): Promise<number> {
  const r = await exec(
    `INSERT INTO "${schema}".events (title, created_by) VALUES ($1, $2) RETURNING id`,
    [title, createdBy],
  );
  return r.rows[0].id as number;
}

async function addMember(eventId: number, userId: number, role = 'Member'): Promise<void> {
  await exec(
    `INSERT INTO "${schema}".event_members (event_id, user_id, role) VALUES ($1, $2, $3)
     ON CONFLICT DO NOTHING`,
    [eventId, userId, role],
  );
}

async function seedTask(eventId: number, title: string, createdBy: number): Promise<number> {
  const r = await exec(
    `INSERT INTO "${schema}".tasks (event_id, title, created_by) VALUES ($1, $2, $3) RETURNING id`,
    [eventId, title, createdBy],
  );
  return r.rows[0].id as number;
}

async function seedRsvp(eventId: number, guestName: string): Promise<number> {
  const r = await exec(
    `INSERT INTO "${schema}".rsvps (event_id, guest_name, status) VALUES ($1, $2, 'Pending') RETURNING id`,
    [eventId, guestName],
  );
  return r.rows[0].id as number;
}

async function seedDocument(eventId: number): Promise<number> {
  const r = await exec(
    `INSERT INTO "${schema}".event_documents (event_id) VALUES ($1) RETURNING id`,
    [eventId],
  );
  return r.rows[0].id as number;
}

async function seedCommunicationLog(eventId: number): Promise<number> {
  const r = await exec(
    `INSERT INTO "${schema}".communication_log (event_id, communication_type) VALUES ($1, 'email') RETURNING id`,
    [eventId],
  );
  return r.rows[0].id as number;
}

async function seedSlideshow(eventId: number): Promise<number> {
  const r = await exec(
    `INSERT INTO "${schema}".gallery_slideshows (event_id, name) VALUES ($1, 'Test') RETURNING id`,
    [eventId],
  );
  return r.rows[0].id as number;
}

// ── Apply a single RLS policy (idempotent-safe in an isolated schema) ─────────

async function enableRls(table: string): Promise<void> {
  await exec(`ALTER TABLE "${schema}".${table} ENABLE ROW LEVEL SECURITY`);
  await exec(`ALTER TABLE "${schema}".${table} FORCE ROW LEVEL SECURITY`);
}

async function createPolicy(sql: string): Promise<void> {
  await exec(sql);
}

// ════════════════════════════════════════════════════════════════════════════
// Suite setup / teardown
// ════════════════════════════════════════════════════════════════════════════

beforeAll(async () => {
  schema = `rls_sec_${randomUUID().replace(/-/g, '_')}`;
  pool = new pg.Pool({ connectionString: CONNECTION_STRING });

  // Ensure non-superuser test role exists
  await pool.query(`
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${RLS_TEST_ROLE}') THEN
        CREATE ROLE ${RLS_TEST_ROLE} NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE;
      END IF;
    END $$;
  `);

  await exec(`CREATE SCHEMA "${schema}"`);
  await exec(`GRANT USAGE ON SCHEMA "${schema}" TO ${RLS_TEST_ROLE}`);

  // ── Core tables ────────────────────────────────────────────────────────────

  await exec(`
    CREATE TABLE "${schema}".users (
      id           SERIAL PRIMARY KEY,
      email        TEXT UNIQUE NOT NULL,
      display_name TEXT NOT NULL
    )
  `);

  await exec(`
    CREATE TABLE "${schema}".events (
      id         SERIAL PRIMARY KEY,
      title      TEXT NOT NULL,
      created_by INTEGER NOT NULL REFERENCES "${schema}".users(id)
    )
  `);

  await exec(`
    CREATE TABLE "${schema}".event_members (
      event_id INTEGER NOT NULL REFERENCES "${schema}".events(id),
      user_id  INTEGER NOT NULL REFERENCES "${schema}".users(id),
      role     TEXT DEFAULT 'Member',
      PRIMARY KEY (event_id, user_id)
    )
  `);

  await exec(`
    CREATE TABLE "${schema}".tasks (
      id         SERIAL PRIMARY KEY,
      event_id   INTEGER NOT NULL REFERENCES "${schema}".events(id),
      title      TEXT NOT NULL,
      created_by INTEGER REFERENCES "${schema}".users(id)
    )
  `);

  await exec(`
    CREATE TABLE "${schema}".task_comments (
      id      SERIAL PRIMARY KEY,
      task_id INTEGER NOT NULL REFERENCES "${schema}".tasks(id),
      user_id INTEGER NOT NULL REFERENCES "${schema}".users(id),
      body    TEXT NOT NULL
    )
  `);

  await exec(`
    CREATE TABLE "${schema}".task_subtasks (
      id      SERIAL PRIMARY KEY,
      task_id INTEGER NOT NULL REFERENCES "${schema}".tasks(id),
      title   TEXT NOT NULL
    )
  `);

  await exec(`
    CREATE TABLE "${schema}".task_dependencies (
      id            SERIAL PRIMARY KEY,
      task_id       INTEGER NOT NULL REFERENCES "${schema}".tasks(id),
      depends_on_id INTEGER NOT NULL REFERENCES "${schema}".tasks(id),
      UNIQUE (task_id, depends_on_id)
    )
  `);

  await exec(`
    CREATE TABLE "${schema}".rsvps (
      id         SERIAL PRIMARY KEY,
      event_id   INTEGER NOT NULL REFERENCES "${schema}".events(id),
      guest_name TEXT NOT NULL,
      status     TEXT NOT NULL DEFAULT 'Pending'
    )
  `);

  // event_documents — minimal stub needed for gallery_comments document_id FK
  await exec(`
    CREATE TABLE "${schema}".event_documents (
      id       SERIAL PRIMARY KEY,
      event_id INTEGER NOT NULL REFERENCES "${schema}".events(id)
    )
  `);

  await exec(`
    CREATE TABLE "${schema}".communication_log (
      id                 SERIAL PRIMARY KEY,
      event_id           INTEGER NOT NULL REFERENCES "${schema}".events(id),
      communication_type TEXT NOT NULL DEFAULT 'email'
    )
  `);

  await exec(`
    CREATE TABLE "${schema}".vendors (
      id       SERIAL PRIMARY KEY,
      event_id INTEGER NOT NULL REFERENCES "${schema}".events(id),
      name     TEXT NOT NULL
    )
  `);

  await exec(`
    CREATE TABLE "${schema}".shopping_lists (
      id       SERIAL PRIMARY KEY,
      event_id INTEGER NOT NULL REFERENCES "${schema}".events(id),
      name     TEXT NOT NULL
    )
  `);

  await exec(`
    CREATE TABLE "${schema}".shopping_items (
      id      SERIAL PRIMARY KEY,
      list_id INTEGER NOT NULL REFERENCES "${schema}".shopping_lists(id),
      name    TEXT NOT NULL
    )
  `);

  await exec(`
    CREATE TABLE "${schema}".timeline_activities (
      id       SERIAL PRIMARY KEY,
      event_id INTEGER NOT NULL REFERENCES "${schema}".events(id),
      title    TEXT NOT NULL,
      vendor_id INTEGER REFERENCES "${schema}".vendors(id)
    )
  `);

  await exec(`
    CREATE TABLE "${schema}".store_suggestions (
      id       SERIAL PRIMARY KEY,
      event_id INTEGER NOT NULL REFERENCES "${schema}".events(id),
      name     TEXT NOT NULL
    )
  `);

  await exec(`
    CREATE TABLE "${schema}".rsvp_questions (
      id            SERIAL PRIMARY KEY,
      event_id      INTEGER NOT NULL REFERENCES "${schema}".events(id),
      prompt        TEXT NOT NULL,
      question_type TEXT NOT NULL DEFAULT 'short_text'
    )
  `);

  await exec(`
    CREATE TABLE "${schema}".rsvp_question_responses (
      id          SERIAL PRIMARY KEY,
      rsvp_id     INTEGER NOT NULL REFERENCES "${schema}".rsvps(id),
      question_id INTEGER NOT NULL REFERENCES "${schema}".rsvp_questions(id),
      response    TEXT,
      UNIQUE (rsvp_id, question_id)
    )
  `);

  await exec(`
    CREATE TABLE "${schema}".gallery_albums (
      id       SERIAL PRIMARY KEY,
      event_id INTEGER NOT NULL REFERENCES "${schema}".events(id),
      name     TEXT NOT NULL
    )
  `);

  await exec(`
    CREATE TABLE "${schema}".event_messages (
      id        SERIAL PRIMARY KEY,
      event_id  INTEGER NOT NULL REFERENCES "${schema}".events(id),
      sender_id INTEGER NOT NULL REFERENCES "${schema}".users(id),
      body      TEXT NOT NULL
    )
  `);

  await exec(`
    CREATE TABLE "${schema}".gallery_slideshows (
      id       SERIAL PRIMARY KEY,
      event_id INTEGER NOT NULL REFERENCES "${schema}".events(id),
      name     TEXT NOT NULL
    )
  `);

  // ── Secondary tables (v16) ─────────────────────────────────────────────────

  await exec(`
    CREATE TABLE "${schema}".task_templates (
      id       SERIAL PRIMARY KEY,
      event_id INTEGER NOT NULL REFERENCES "${schema}".events(id),
      name     TEXT NOT NULL
    )
  `);

  await exec(`
    CREATE TABLE "${schema}".task_time_entries (
      id          SERIAL PRIMARY KEY,
      task_id     INTEGER NOT NULL REFERENCES "${schema}".tasks(id),
      user_id     INTEGER NOT NULL REFERENCES "${schema}".users(id),
      hours_spent NUMERIC(5,2) NOT NULL DEFAULT 1
    )
  `);

  await exec(`
    CREATE TABLE "${schema}".rsvp_access_tokens (
      rsvp_id   INTEGER PRIMARY KEY REFERENCES "${schema}".rsvps(id),
      token     TEXT NOT NULL UNIQUE
    )
  `);

  await exec(`
    CREATE TABLE "${schema}".gallery_share_links (
      id       SERIAL PRIMARY KEY,
      event_id INTEGER NOT NULL REFERENCES "${schema}".events(id),
      token    TEXT NOT NULL UNIQUE
    )
  `);

  await exec(`
    CREATE TABLE "${schema}".gallery_comments (
      id          SERIAL PRIMARY KEY,
      event_id    INTEGER NOT NULL REFERENCES "${schema}".events(id),
      document_id INTEGER NOT NULL REFERENCES "${schema}".event_documents(id),
      user_id     INTEGER REFERENCES "${schema}".users(id),
      body        TEXT NOT NULL DEFAULT 'test'
    )
  `);

  await exec(`
    CREATE TABLE "${schema}".slideshow_items (
      id           SERIAL PRIMARY KEY,
      slideshow_id INTEGER NOT NULL REFERENCES "${schema}".gallery_slideshows(id),
      document_id  INTEGER NOT NULL REFERENCES "${schema}".event_documents(id),
      sort_order   INTEGER NOT NULL DEFAULT 0,
      UNIQUE (slideshow_id, document_id)
    )
  `);

  await exec(`
    CREATE TABLE "${schema}".communication_tracking_events (
      id                   SERIAL PRIMARY KEY,
      communication_log_id INTEGER NOT NULL REFERENCES "${schema}".communication_log(id),
      event_type           TEXT NOT NULL DEFAULT 'open'
    )
  `);

  await exec(`
    CREATE TABLE "${schema}".communication_templates (
      id       SERIAL PRIMARY KEY,
      event_id INTEGER REFERENCES "${schema}".events(id),
      slug     TEXT NOT NULL,
      name     TEXT NOT NULL DEFAULT 'tpl'
    )
  `);

  await exec(`
    CREATE TABLE "${schema}".scheduled_reports (
      id          SERIAL PRIMARY KEY,
      event_id    INTEGER REFERENCES "${schema}".events(id),
      created_by  INTEGER REFERENCES "${schema}".users(id),
      report_type TEXT NOT NULL DEFAULT 'rsvp_summary',
      frequency   TEXT NOT NULL DEFAULT 'daily'
    )
  `);

  await exec(`
    CREATE TABLE "${schema}".scheduled_report_deliveries (
      id        SERIAL PRIMARY KEY,
      report_id INTEGER NOT NULL REFERENCES "${schema}".scheduled_reports(id),
      status    TEXT NOT NULL DEFAULT 'success'
    )
  `);

  await exec(`
    CREATE TABLE "${schema}".event_meal_options (
      id       SERIAL PRIMARY KEY,
      event_id INTEGER NOT NULL REFERENCES "${schema}".events(id),
      name     TEXT NOT NULL
    )
  `);

  await exec(`
    CREATE TABLE "${schema}".event_custom_fields (
      id         SERIAL PRIMARY KEY,
      event_id   INTEGER NOT NULL REFERENCES "${schema}".events(id),
      field_key  TEXT NOT NULL,
      label      TEXT NOT NULL DEFAULT 'label',
      field_type TEXT NOT NULL DEFAULT 'text'
    )
  `);

  await exec(`
    CREATE TABLE "${schema}".attendance_events (
      id         SERIAL PRIMARY KEY,
      event_id   INTEGER NOT NULL REFERENCES "${schema}".events(id),
      rsvp_id    INTEGER NOT NULL REFERENCES "${schema}".rsvps(id),
      action     TEXT NOT NULL DEFAULT 'checked_in',
      occurred_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await exec(`
    CREATE TABLE "${schema}".vendor_communication_log (
      id       SERIAL PRIMARY KEY,
      event_id INTEGER NOT NULL REFERENCES "${schema}".events(id),
      subject  TEXT NOT NULL DEFAULT 'test'
    )
  `);

  await exec(`
    CREATE TABLE "${schema}".vendor_favorites (
      id        SERIAL PRIMARY KEY,
      event_id  INTEGER NOT NULL REFERENCES "${schema}".events(id),
      vendor_id INTEGER NOT NULL REFERENCES "${schema}".vendors(id),
      user_id   INTEGER NOT NULL REFERENCES "${schema}".users(id),
      UNIQUE (event_id, vendor_id, user_id)
    )
  `);

  await exec(`
    CREATE TABLE "${schema}".vendor_bookings (
      id       SERIAL PRIMARY KEY,
      event_id INTEGER NOT NULL REFERENCES "${schema}".events(id),
      status   TEXT NOT NULL DEFAULT 'requested'
    )
  `);

  await exec(`
    CREATE TABLE "${schema}".vendor_payment_schedules (
      id       SERIAL PRIMARY KEY,
      event_id INTEGER NOT NULL REFERENCES "${schema}".events(id),
      due_date DATE NOT NULL DEFAULT CURRENT_DATE,
      amount   NUMERIC(10,2) NOT NULL DEFAULT 0,
      status   TEXT NOT NULL DEFAULT 'pending'
    )
  `);

  // ── Grant DML to test role ─────────────────────────────────────────────────
  await exec(
    `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA "${schema}" TO ${RLS_TEST_ROLE}`,
  );
  await exec(`GRANT USAGE ON ALL SEQUENCES IN SCHEMA "${schema}" TO ${RLS_TEST_ROLE}`);

  // ── Enable core-table RLS (needed for policy sub-selects) ─────────────────
  for (const t of [
    'events',
    'event_members',
    'tasks',
    'rsvps',
    'event_documents',
    'communication_log',
    'gallery_slideshows',
    'scheduled_reports',
  ]) {
    await exec(`ALTER TABLE "${schema}".${t} ENABLE ROW LEVEL SECURITY`);
    await exec(`ALTER TABLE "${schema}".${t} FORCE ROW LEVEL SECURITY`);
  }

  // Core policies (minimal — allow owner/member access)
  await createPolicy(`
    CREATE POLICY rls_events_owner ON "${schema}".events
      USING (
        created_by = NULLIF(current_setting('app.current_user_id', true), '')::int
        OR NULLIF(current_setting('app.current_user_id', true), '') IS NULL
      )
  `);
  await createPolicy(`
    CREATE POLICY rls_events_member ON "${schema}".events
      USING (
        id IN (
          SELECT event_id FROM "${schema}".event_members
          WHERE user_id = NULLIF(current_setting('app.current_user_id', true), '')::int
        )
      )
  `);
  await createPolicy(`
    CREATE POLICY rls_event_members_self ON "${schema}".event_members
      USING (
        user_id = NULLIF(current_setting('app.current_user_id', true), '')::int
        OR NULLIF(current_setting('app.current_user_id', true), '') IS NULL
      )
  `);
  await createPolicy(`
    CREATE POLICY rls_tasks_event ON "${schema}".tasks
      USING (
        event_id IN (
          SELECT e.id FROM "${schema}".events e
          WHERE e.created_by = NULLIF(current_setting('app.current_user_id', true), '')::int
          UNION
          SELECT em.event_id FROM "${schema}".event_members em
          WHERE em.user_id = NULLIF(current_setting('app.current_user_id', true), '')::int
        )
        OR NULLIF(current_setting('app.current_user_id', true), '') IS NULL
      )
  `);
  await createPolicy(`
    CREATE POLICY rls_rsvps_event ON "${schema}".rsvps
      USING (
        event_id IN (
          SELECT e.id FROM "${schema}".events e
          WHERE e.created_by = NULLIF(current_setting('app.current_user_id', true), '')::int
          UNION
          SELECT em.event_id FROM "${schema}".event_members em
          WHERE em.user_id = NULLIF(current_setting('app.current_user_id', true), '')::int
        )
        OR NULLIF(current_setting('app.current_user_id', true), '') IS NULL
      )
  `);
  await createPolicy(`
    CREATE POLICY rls_event_documents_event ON "${schema}".event_documents
      USING (
        event_id IN (
          SELECT e.id FROM "${schema}".events e
          WHERE e.created_by = NULLIF(current_setting('app.current_user_id', true), '')::int
          UNION
          SELECT em.event_id FROM "${schema}".event_members em
          WHERE em.user_id = NULLIF(current_setting('app.current_user_id', true), '')::int
        )
        OR NULLIF(current_setting('app.current_user_id', true), '') IS NULL
      )
  `);
  await createPolicy(`
    CREATE POLICY rls_communication_log_event ON "${schema}".communication_log
      USING (
        event_id IN (
          SELECT e.id FROM "${schema}".events e
          WHERE e.created_by = NULLIF(current_setting('app.current_user_id', true), '')::int
          UNION
          SELECT em.event_id FROM "${schema}".event_members em
          WHERE em.user_id = NULLIF(current_setting('app.current_user_id', true), '')::int
        )
        OR NULLIF(current_setting('app.current_user_id', true), '') IS NULL
      )
  `);
  await createPolicy(`
    CREATE POLICY rls_gallery_slideshows_event ON "${schema}".gallery_slideshows
      USING (
        event_id IN (
          SELECT e.id FROM "${schema}".events e
          WHERE e.created_by = NULLIF(current_setting('app.current_user_id', true), '')::int
          UNION
          SELECT em.event_id FROM "${schema}".event_members em
          WHERE em.user_id = NULLIF(current_setting('app.current_user_id', true), '')::int
        )
        OR NULLIF(current_setting('app.current_user_id', true), '') IS NULL
      )
  `);
  await createPolicy(`
    CREATE POLICY rls_scheduled_reports_open ON "${schema}".scheduled_reports
      USING (
        (event_id IS NULL AND created_by = NULLIF(current_setting('app.current_user_id', true), '')::int)
        OR event_id IN (
          SELECT e.id FROM "${schema}".events e
          WHERE e.created_by = NULLIF(current_setting('app.current_user_id', true), '')::int
          UNION
          SELECT em.event_id FROM "${schema}".event_members em
          WHERE em.user_id = NULLIF(current_setting('app.current_user_id', true), '')::int
        )
        OR NULLIF(current_setting('app.current_user_id', true), '') IS NULL
      )
  `);

  // ── Enable and apply v16 policies ─────────────────────────────────────────

  // task_templates
  await enableRls('task_templates');
  await createPolicy(`
    CREATE POLICY rls_task_templates_event_member ON "${schema}".task_templates
      USING (
        event_id IN (
          SELECT e.id FROM "${schema}".events e
          WHERE e.created_by = NULLIF(current_setting('app.current_user_id', true), '')::int
          UNION
          SELECT em.event_id FROM "${schema}".event_members em
          WHERE em.user_id = NULLIF(current_setting('app.current_user_id', true), '')::int
        )
        OR NULLIF(current_setting('app.current_user_id', true), '') IS NULL
      )
  `);

  // task_time_entries
  await enableRls('task_time_entries');
  await createPolicy(`
    CREATE POLICY rls_task_time_entries_event_member ON "${schema}".task_time_entries
      USING (
        user_id = NULLIF(current_setting('app.current_user_id', true), '')::int
        OR task_id IN (
          SELECT t.id FROM "${schema}".tasks t
          WHERE t.event_id IN (
            SELECT e.id FROM "${schema}".events e
            WHERE e.created_by = NULLIF(current_setting('app.current_user_id', true), '')::int
            UNION
            SELECT em.event_id FROM "${schema}".event_members em
            WHERE em.user_id = NULLIF(current_setting('app.current_user_id', true), '')::int
          )
        )
        OR NULLIF(current_setting('app.current_user_id', true), '') IS NULL
      )
  `);

  // task_comments
  await enableRls('task_comments');
  await createPolicy(`
    CREATE POLICY rls_task_comments_event_member ON "${schema}".task_comments
      USING (
        task_id IN (
          SELECT t.id FROM "${schema}".tasks t
          WHERE t.event_id IN (
            SELECT e.id FROM "${schema}".events e
            WHERE e.created_by = NULLIF(current_setting('app.current_user_id', true), '')::int
            UNION
            SELECT em.event_id FROM "${schema}".event_members em
            WHERE em.user_id = NULLIF(current_setting('app.current_user_id', true), '')::int
          )
        )
        OR NULLIF(current_setting('app.current_user_id', true), '') IS NULL
      )
  `);

  // task_subtasks
  await enableRls('task_subtasks');
  await createPolicy(`
    CREATE POLICY rls_task_subtasks_event_member ON "${schema}".task_subtasks
      USING (
        task_id IN (
          SELECT t.id FROM "${schema}".tasks t
          WHERE t.event_id IN (
            SELECT e.id FROM "${schema}".events e
            WHERE e.created_by = NULLIF(current_setting('app.current_user_id', true), '')::int
            UNION
            SELECT em.event_id FROM "${schema}".event_members em
            WHERE em.user_id = NULLIF(current_setting('app.current_user_id', true), '')::int
          )
        )
        OR NULLIF(current_setting('app.current_user_id', true), '') IS NULL
      )
  `);

  // task_dependencies
  await enableRls('task_dependencies');
  await createPolicy(`
    CREATE POLICY rls_task_dependencies_event_member ON "${schema}".task_dependencies
      USING (
        task_id IN (
          SELECT t.id FROM "${schema}".tasks t
          WHERE t.event_id IN (
            SELECT e.id FROM "${schema}".events e
            WHERE e.created_by = NULLIF(current_setting('app.current_user_id', true), '')::int
            UNION
            SELECT em.event_id FROM "${schema}".event_members em
            WHERE em.user_id = NULLIF(current_setting('app.current_user_id', true), '')::int
          )
        )
        OR NULLIF(current_setting('app.current_user_id', true), '') IS NULL
      )
  `);

  // timeline_activities
  await enableRls('timeline_activities');
  await createPolicy(`
    CREATE POLICY rls_timeline_activities_event_member ON "${schema}".timeline_activities
      USING (
        event_id IN (
          SELECT e.id FROM "${schema}".events e
          WHERE e.created_by = NULLIF(current_setting('app.current_user_id', true), '')::int
          UNION
          SELECT em.event_id FROM "${schema}".event_members em
          WHERE em.user_id = NULLIF(current_setting('app.current_user_id', true), '')::int
        )
        OR NULLIF(current_setting('app.current_user_id', true), '') IS NULL
      )
  `);

  // shopping_lists
  await enableRls('shopping_lists');
  await createPolicy(`
    CREATE POLICY rls_shopping_lists_event_member ON "${schema}".shopping_lists
      USING (
        event_id IN (
          SELECT e.id FROM "${schema}".events e
          WHERE e.created_by = NULLIF(current_setting('app.current_user_id', true), '')::int
          UNION
          SELECT em.event_id FROM "${schema}".event_members em
          WHERE em.user_id = NULLIF(current_setting('app.current_user_id', true), '')::int
        )
        OR NULLIF(current_setting('app.current_user_id', true), '') IS NULL
      )
  `);

  // shopping_items
  await enableRls('shopping_items');
  await createPolicy(`
    CREATE POLICY rls_shopping_items_list_member ON "${schema}".shopping_items
      USING (
        list_id IN (
          SELECT sl.id FROM "${schema}".shopping_lists sl
          WHERE sl.event_id IN (
            SELECT e.id FROM "${schema}".events e
            WHERE e.created_by = NULLIF(current_setting('app.current_user_id', true), '')::int
            UNION
            SELECT em.event_id FROM "${schema}".event_members em
            WHERE em.user_id = NULLIF(current_setting('app.current_user_id', true), '')::int
          )
        )
        OR NULLIF(current_setting('app.current_user_id', true), '') IS NULL
      )
  `);

  // store_suggestions
  await enableRls('store_suggestions');
  await createPolicy(`
    CREATE POLICY rls_store_suggestions_event_member ON "${schema}".store_suggestions
      USING (
        event_id IN (
          SELECT e.id FROM "${schema}".events e
          WHERE e.created_by = NULLIF(current_setting('app.current_user_id', true), '')::int
          UNION
          SELECT em.event_id FROM "${schema}".event_members em
          WHERE em.user_id = NULLIF(current_setting('app.current_user_id', true), '')::int
        )
        OR NULLIF(current_setting('app.current_user_id', true), '') IS NULL
      )
  `);

  // rsvp_questions
  await enableRls('rsvp_questions');
  await createPolicy(`
    CREATE POLICY rls_rsvp_questions_event_member ON "${schema}".rsvp_questions
      USING (
        event_id IN (
          SELECT e.id FROM "${schema}".events e
          WHERE e.created_by = NULLIF(current_setting('app.current_user_id', true), '')::int
          UNION
          SELECT em.event_id FROM "${schema}".event_members em
          WHERE em.user_id = NULLIF(current_setting('app.current_user_id', true), '')::int
        )
        OR NULLIF(current_setting('app.current_user_id', true), '') IS NULL
      )
  `);

  // rsvp_question_responses
  await enableRls('rsvp_question_responses');
  await createPolicy(`
    CREATE POLICY rls_rsvp_question_responses_access ON "${schema}".rsvp_question_responses
      USING (
        rsvp_id IN (
          SELECT r.id FROM "${schema}".rsvps r
          WHERE r.event_id IN (
            SELECT e.id FROM "${schema}".events e
            WHERE e.created_by = NULLIF(current_setting('app.current_user_id', true), '')::int
            UNION
            SELECT em.event_id FROM "${schema}".event_members em
            WHERE em.user_id = NULLIF(current_setting('app.current_user_id', true), '')::int
          )
        )
        OR NULLIF(current_setting('app.current_user_id', true), '') IS NULL
      )
  `);

  // gallery_albums
  await enableRls('gallery_albums');
  await createPolicy(`
    CREATE POLICY rls_gallery_albums_event_member ON "${schema}".gallery_albums
      USING (
        event_id IN (
          SELECT e.id FROM "${schema}".events e
          WHERE e.created_by = NULLIF(current_setting('app.current_user_id', true), '')::int
          UNION
          SELECT em.event_id FROM "${schema}".event_members em
          WHERE em.user_id = NULLIF(current_setting('app.current_user_id', true), '')::int
        )
        OR NULLIF(current_setting('app.current_user_id', true), '') IS NULL
      )
  `);

  // event_messages
  await enableRls('event_messages');
  await createPolicy(`
    CREATE POLICY rls_event_messages_event_member ON "${schema}".event_messages
      USING (
        event_id IN (
          SELECT e.id FROM "${schema}".events e
          WHERE e.created_by = NULLIF(current_setting('app.current_user_id', true), '')::int
          UNION
          SELECT em.event_id FROM "${schema}".event_members em
          WHERE em.user_id = NULLIF(current_setting('app.current_user_id', true), '')::int
        )
        OR NULLIF(current_setting('app.current_user_id', true), '') IS NULL
      )
  `);

  // vendor_favorites
  await enableRls('vendor_favorites');
  await createPolicy(`
    CREATE POLICY rls_vendor_favorites_event_member ON "${schema}".vendor_favorites
      USING (
        event_id IN (
          SELECT e.id FROM "${schema}".events e
          WHERE e.created_by = NULLIF(current_setting('app.current_user_id', true), '')::int
          UNION
          SELECT em.event_id FROM "${schema}".event_members em
          WHERE em.user_id = NULLIF(current_setting('app.current_user_id', true), '')::int
        )
        OR NULLIF(current_setting('app.current_user_id', true), '') IS NULL
      )
  `);

  // rsvp_access_tokens
  await enableRls('rsvp_access_tokens');
  await createPolicy(`
    CREATE POLICY rls_rsvp_access_tokens_event_member ON "${schema}".rsvp_access_tokens
      USING (
        rsvp_id IN (
          SELECT r.id FROM "${schema}".rsvps r
          WHERE r.event_id IN (
            SELECT e.id FROM "${schema}".events e
            WHERE e.created_by = NULLIF(current_setting('app.current_user_id', true), '')::int
            UNION
            SELECT em.event_id FROM "${schema}".event_members em
            WHERE em.user_id = NULLIF(current_setting('app.current_user_id', true), '')::int
          )
        )
        OR NULLIF(current_setting('app.current_user_id', true), '') IS NULL
      )
  `);

  // gallery_share_links
  await enableRls('gallery_share_links');
  await createPolicy(`
    CREATE POLICY rls_gallery_share_links_event_member ON "${schema}".gallery_share_links
      USING (
        event_id IN (
          SELECT e.id FROM "${schema}".events e
          WHERE e.created_by = NULLIF(current_setting('app.current_user_id', true), '')::int
          UNION
          SELECT em.event_id FROM "${schema}".event_members em
          WHERE em.user_id = NULLIF(current_setting('app.current_user_id', true), '')::int
        )
        OR NULLIF(current_setting('app.current_user_id', true), '') IS NULL
      )
  `);

  // gallery_comments
  await enableRls('gallery_comments');
  await createPolicy(`
    CREATE POLICY rls_gallery_comments_event_member ON "${schema}".gallery_comments
      USING (
        event_id IN (
          SELECT e.id FROM "${schema}".events e
          WHERE e.created_by = NULLIF(current_setting('app.current_user_id', true), '')::int
          UNION
          SELECT em.event_id FROM "${schema}".event_members em
          WHERE em.user_id = NULLIF(current_setting('app.current_user_id', true), '')::int
        )
        OR NULLIF(current_setting('app.current_user_id', true), '') IS NULL
      )
  `);

  // slideshow_items
  await enableRls('slideshow_items');
  await createPolicy(`
    CREATE POLICY rls_slideshow_items_via_slideshow ON "${schema}".slideshow_items
      USING (
        slideshow_id IN (
          SELECT gs.id FROM "${schema}".gallery_slideshows gs
          WHERE gs.event_id IN (
            SELECT e.id FROM "${schema}".events e
            WHERE e.created_by = NULLIF(current_setting('app.current_user_id', true), '')::int
            UNION
            SELECT em.event_id FROM "${schema}".event_members em
            WHERE em.user_id = NULLIF(current_setting('app.current_user_id', true), '')::int
          )
        )
        OR NULLIF(current_setting('app.current_user_id', true), '') IS NULL
      )
  `);

  // communication_tracking_events
  await enableRls('communication_tracking_events');
  await createPolicy(`
    CREATE POLICY rls_communication_tracking_events_via_log ON "${schema}".communication_tracking_events
      USING (
        communication_log_id IN (
          SELECT cl.id FROM "${schema}".communication_log cl
          WHERE cl.event_id IN (
            SELECT e.id FROM "${schema}".events e
            WHERE e.created_by = NULLIF(current_setting('app.current_user_id', true), '')::int
            UNION
            SELECT em.event_id FROM "${schema}".event_members em
            WHERE em.user_id = NULLIF(current_setting('app.current_user_id', true), '')::int
          )
        )
        OR NULLIF(current_setting('app.current_user_id', true), '') IS NULL
      )
  `);

  // communication_templates
  await enableRls('communication_templates');
  await createPolicy(`
    CREATE POLICY rls_communication_templates_event_or_global ON "${schema}".communication_templates
      USING (
        event_id IS NULL
        OR event_id IN (
          SELECT e.id FROM "${schema}".events e
          WHERE e.created_by = NULLIF(current_setting('app.current_user_id', true), '')::int
          UNION
          SELECT em.event_id FROM "${schema}".event_members em
          WHERE em.user_id = NULLIF(current_setting('app.current_user_id', true), '')::int
        )
        OR NULLIF(current_setting('app.current_user_id', true), '') IS NULL
      )
  `);

  // scheduled_report_deliveries
  await enableRls('scheduled_report_deliveries');
  await createPolicy(`
    CREATE POLICY rls_scheduled_report_deliveries_via_report ON "${schema}".scheduled_report_deliveries
      USING (
        report_id IN (SELECT id FROM "${schema}".scheduled_reports)
        OR NULLIF(current_setting('app.current_user_id', true), '') IS NULL
      )
  `);

  // event_meal_options
  await enableRls('event_meal_options');
  await createPolicy(`
    CREATE POLICY rls_event_meal_options_event_member ON "${schema}".event_meal_options
      USING (
        event_id IN (
          SELECT e.id FROM "${schema}".events e
          WHERE e.created_by = NULLIF(current_setting('app.current_user_id', true), '')::int
          UNION
          SELECT em.event_id FROM "${schema}".event_members em
          WHERE em.user_id = NULLIF(current_setting('app.current_user_id', true), '')::int
        )
        OR NULLIF(current_setting('app.current_user_id', true), '') IS NULL
      )
  `);

  // event_custom_fields
  await enableRls('event_custom_fields');
  await createPolicy(`
    CREATE POLICY rls_event_custom_fields_event_member ON "${schema}".event_custom_fields
      USING (
        event_id IN (
          SELECT e.id FROM "${schema}".events e
          WHERE e.created_by = NULLIF(current_setting('app.current_user_id', true), '')::int
          UNION
          SELECT em.event_id FROM "${schema}".event_members em
          WHERE em.user_id = NULLIF(current_setting('app.current_user_id', true), '')::int
        )
        OR NULLIF(current_setting('app.current_user_id', true), '') IS NULL
      )
  `);

  // attendance_events
  await enableRls('attendance_events');
  await createPolicy(`
    CREATE POLICY rls_attendance_events_event_member ON "${schema}".attendance_events
      USING (
        event_id IN (
          SELECT e.id FROM "${schema}".events e
          WHERE e.created_by = NULLIF(current_setting('app.current_user_id', true), '')::int
          UNION
          SELECT em.event_id FROM "${schema}".event_members em
          WHERE em.user_id = NULLIF(current_setting('app.current_user_id', true), '')::int
        )
        OR NULLIF(current_setting('app.current_user_id', true), '') IS NULL
      )
  `);

  // vendor_communication_log
  await enableRls('vendor_communication_log');
  await createPolicy(`
    CREATE POLICY rls_vendor_communication_log_event_member ON "${schema}".vendor_communication_log
      USING (
        event_id IN (
          SELECT e.id FROM "${schema}".events e
          WHERE e.created_by = NULLIF(current_setting('app.current_user_id', true), '')::int
          UNION
          SELECT em.event_id FROM "${schema}".event_members em
          WHERE em.user_id = NULLIF(current_setting('app.current_user_id', true), '')::int
        )
        OR NULLIF(current_setting('app.current_user_id', true), '') IS NULL
      )
  `);

  // vendor_bookings
  await enableRls('vendor_bookings');
  await createPolicy(`
    CREATE POLICY rls_vendor_bookings_event_member ON "${schema}".vendor_bookings
      USING (
        event_id IN (
          SELECT e.id FROM "${schema}".events e
          WHERE e.created_by = NULLIF(current_setting('app.current_user_id', true), '')::int
          UNION
          SELECT em.event_id FROM "${schema}".event_members em
          WHERE em.user_id = NULLIF(current_setting('app.current_user_id', true), '')::int
        )
        OR NULLIF(current_setting('app.current_user_id', true), '') IS NULL
      )
  `);

  // vendor_payment_schedules
  await enableRls('vendor_payment_schedules');
  await createPolicy(`
    CREATE POLICY rls_vendor_payment_schedules_event_member ON "${schema}".vendor_payment_schedules
      USING (
        event_id IN (
          SELECT e.id FROM "${schema}".events e
          WHERE e.created_by = NULLIF(current_setting('app.current_user_id', true), '')::int
          UNION
          SELECT em.event_id FROM "${schema}".event_members em
          WHERE em.user_id = NULLIF(current_setting('app.current_user_id', true), '')::int
        )
        OR NULLIF(current_setting('app.current_user_id', true), '') IS NULL
      )
  `);
}, 60_000);

afterAll(async () => {
  if (pool) {
    await pool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await pool.end();
  }
});

// ════════════════════════════════════════════════════════════════════════════
// Shared test fixtures (seeded once, referenced across describe blocks)
// ════════════════════════════════════════════════════════════════════════════

let ownerUserId: number;
let memberUserId: number;
let outsiderUserId: number;
let ownedEventId: number;
let memberEventId: number; // event that memberUser belongs to but did not create
let outsiderEventId: number; // event belonging only to outsiderUser

let ownerTaskId: number;
let memberRsvpId: number;
let ownerDocumentId: number;
let ownerCommLogId: number;
let ownerSlideshowId: number;
let ownerScheduledReportId: number;

// Populated after beforeAll; individual describe blocks rely on these
beforeAll(async () => {
  ownerUserId = await seedUser(`owner_${randomUUID().substring(0, 8)}@test.example`);
  memberUserId = await seedUser(`member_${randomUUID().substring(0, 8)}@test.example`);
  outsiderUserId = await seedUser(`outsider_${randomUUID().substring(0, 8)}@test.example`);

  ownedEventId = await seedEvent('Owner Event', ownerUserId);
  memberEventId = await seedEvent('Member Event', outsiderUserId);
  outsiderEventId = await seedEvent('Outsider Event', outsiderUserId);

  // memberUser joins ownedEvent as a plain member
  await addMember(ownedEventId, memberUserId);

  ownerTaskId = await seedTask(ownedEventId, 'Owner Task', ownerUserId);
  memberRsvpId = await seedRsvp(ownedEventId, 'Member Guest');
  ownerDocumentId = await seedDocument(ownedEventId);
  ownerCommLogId = await seedCommunicationLog(ownedEventId);
  ownerSlideshowId = await seedSlideshow(ownedEventId);

  // scheduled_reports for owned event (owner-created)
  const srResult = await exec(
    `INSERT INTO "${schema}".scheduled_reports (event_id, created_by) VALUES ($1, $2) RETURNING id`,
    [ownedEventId, ownerUserId],
  );
  ownerScheduledReportId = srResult.rows[0].id as number;
});

// ════════════════════════════════════════════════════════════════════════════
// task_templates
// ════════════════════════════════════════════════════════════════════════════

describe('task_templates — #768 RLS', () => {
  let templateId: number;

  beforeAll(async () => {
    const r = await exec(
      `INSERT INTO "${schema}".task_templates (event_id, name) VALUES ($1, 'Tpl') RETURNING id`,
      [ownedEventId],
    );
    templateId = r.rows[0].id as number;
  });

  it('[positive] event owner can see own task templates', async () => {
    const rows = await queryAsUser(ownerUserId, `SELECT id FROM task_templates WHERE id = $1`, [
      templateId,
    ]);
    expect(rows).toHaveLength(1);
  });

  it('[positive] event member can see event task templates', async () => {
    const rows = await queryAsUser(memberUserId, `SELECT id FROM task_templates WHERE id = $1`, [
      templateId,
    ]);
    expect(rows).toHaveLength(1);
  });

  it('[negative] outsider cannot see task templates from another event', async () => {
    const rows = await queryAsUser(outsiderUserId, `SELECT id FROM task_templates WHERE id = $1`, [
      templateId,
    ]);
    expect(rows).toHaveLength(0);
  });

  it('[fail-open] no user context sees all rows', async () => {
    const rows = await queryNoContext(`SELECT id FROM task_templates WHERE id = $1`, [templateId]);
    expect(rows).toHaveLength(1);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// task_time_entries
// ════════════════════════════════════════════════════════════════════════════

describe('task_time_entries — #768 RLS', () => {
  let entryId: number;
  let outsiderTaskId: number;
  let outsiderEntryId: number;

  beforeAll(async () => {
    // Entry logged by memberUser on ownerUser's task (member has event access)
    const r = await exec(
      `INSERT INTO "${schema}".task_time_entries (task_id, user_id, hours_spent)
       VALUES ($1, $2, 2) RETURNING id`,
      [ownerTaskId, memberUserId],
    );
    entryId = r.rows[0].id as number;

    // Outsider has their own event and task
    outsiderTaskId = await seedTask(outsiderEventId, 'Outsider Task', outsiderUserId);
    const r2 = await exec(
      `INSERT INTO "${schema}".task_time_entries (task_id, user_id, hours_spent)
       VALUES ($1, $2, 3) RETURNING id`,
      [outsiderTaskId, outsiderUserId],
    );
    outsiderEntryId = r2.rows[0].id as number;
  });

  it('[positive] owner can see time entries on their event tasks', async () => {
    const rows = await queryAsUser(ownerUserId, `SELECT id FROM task_time_entries WHERE id = $1`, [
      entryId,
    ]);
    expect(rows).toHaveLength(1);
  });

  it('[positive] logger (member) can see their own time entries', async () => {
    const rows = await queryAsUser(memberUserId, `SELECT id FROM task_time_entries WHERE id = $1`, [
      entryId,
    ]);
    expect(rows).toHaveLength(1);
  });

  it('[negative] outsider cannot see time entries from a different event', async () => {
    const rows = await queryAsUser(
      outsiderUserId,
      `SELECT id FROM task_time_entries WHERE id = $1`,
      [entryId],
    );
    expect(rows).toHaveLength(0);
  });

  it('[negative] owner cannot see outsider event time entries', async () => {
    const rows = await queryAsUser(ownerUserId, `SELECT id FROM task_time_entries WHERE id = $1`, [
      outsiderEntryId,
    ]);
    expect(rows).toHaveLength(0);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// rsvp_access_tokens
// ════════════════════════════════════════════════════════════════════════════

describe('task_comments — #768 RLS', () => {
  let commentId: number;

  beforeAll(async () => {
    const r = await exec(
      `INSERT INTO "${schema}".task_comments (task_id, user_id, body) VALUES ($1, $2, 'ok') RETURNING id`,
      [ownerTaskId, ownerUserId],
    );
    commentId = r.rows[0].id as number;
  });

  it('[positive] owner can see task comments in own event', async () => {
    const rows = await queryAsUser(ownerUserId, `SELECT id FROM task_comments WHERE id = $1`, [
      commentId,
    ]);
    expect(rows).toHaveLength(1);
  });

  it('[negative] outsider cannot see task comments in other events', async () => {
    const rows = await queryAsUser(outsiderUserId, `SELECT id FROM task_comments WHERE id = $1`, [
      commentId,
    ]);
    expect(rows).toHaveLength(0);
  });
});

describe('task_subtasks — #768 RLS', () => {
  let subtaskId: number;

  beforeAll(async () => {
    const r = await exec(
      `INSERT INTO "${schema}".task_subtasks (task_id, title) VALUES ($1, 'Sub') RETURNING id`,
      [ownerTaskId],
    );
    subtaskId = r.rows[0].id as number;
  });

  it('[positive] owner can see subtasks in own event', async () => {
    const rows = await queryAsUser(ownerUserId, `SELECT id FROM task_subtasks WHERE id = $1`, [
      subtaskId,
    ]);
    expect(rows).toHaveLength(1);
  });

  it('[negative] outsider cannot see subtasks in other events', async () => {
    const rows = await queryAsUser(outsiderUserId, `SELECT id FROM task_subtasks WHERE id = $1`, [
      subtaskId,
    ]);
    expect(rows).toHaveLength(0);
  });
});

describe('task_dependencies — #768 RLS', () => {
  let depId: number;

  beforeAll(async () => {
    const depTaskId = await seedTask(ownedEventId, 'Dep Task', ownerUserId);
    const r = await exec(
      `INSERT INTO "${schema}".task_dependencies (task_id, depends_on_id) VALUES ($1, $2) RETURNING id`,
      [ownerTaskId, depTaskId],
    );
    depId = r.rows[0].id as number;
  });

  it('[positive] owner can see task dependencies in own event', async () => {
    const rows = await queryAsUser(ownerUserId, `SELECT id FROM task_dependencies WHERE id = $1`, [
      depId,
    ]);
    expect(rows).toHaveLength(1);
  });

  it('[negative] outsider cannot see task dependencies in other events', async () => {
    const rows = await queryAsUser(
      outsiderUserId,
      `SELECT id FROM task_dependencies WHERE id = $1`,
      [depId],
    );
    expect(rows).toHaveLength(0);
  });
});

describe('timeline_activities — #768 RLS', () => {
  let activityId: number;

  beforeAll(async () => {
    const r = await exec(
      `INSERT INTO "${schema}".timeline_activities (event_id, title) VALUES ($1, 'Kickoff') RETURNING id`,
      [ownedEventId],
    );
    activityId = r.rows[0].id as number;
  });

  it('[positive] owner can see timeline activities in own event', async () => {
    const rows = await queryAsUser(
      ownerUserId,
      `SELECT id FROM timeline_activities WHERE id = $1`,
      [activityId],
    );
    expect(rows).toHaveLength(1);
  });

  it('[negative] outsider cannot see timeline activities in other events', async () => {
    const rows = await queryAsUser(
      outsiderUserId,
      `SELECT id FROM timeline_activities WHERE id = $1`,
      [activityId],
    );
    expect(rows).toHaveLength(0);
  });
});

describe('shopping_lists — #768 RLS', () => {
  let listId: number;

  beforeAll(async () => {
    const r = await exec(
      `INSERT INTO "${schema}".shopping_lists (event_id, name) VALUES ($1, 'Groceries') RETURNING id`,
      [ownedEventId],
    );
    listId = r.rows[0].id as number;
  });

  it('[positive] owner can see shopping lists in own event', async () => {
    const rows = await queryAsUser(ownerUserId, `SELECT id FROM shopping_lists WHERE id = $1`, [
      listId,
    ]);
    expect(rows).toHaveLength(1);
  });

  it('[negative] outsider cannot see shopping lists in other events', async () => {
    const rows = await queryAsUser(outsiderUserId, `SELECT id FROM shopping_lists WHERE id = $1`, [
      listId,
    ]);
    expect(rows).toHaveLength(0);
  });
});

describe('shopping_items — #768 RLS', () => {
  let itemId: number;

  beforeAll(async () => {
    const lr = await exec(
      `INSERT INTO "${schema}".shopping_lists (event_id, name) VALUES ($1, 'List A') RETURNING id`,
      [ownedEventId],
    );
    const listId = lr.rows[0].id as number;
    const r = await exec(
      `INSERT INTO "${schema}".shopping_items (list_id, name) VALUES ($1, 'Chairs') RETURNING id`,
      [listId],
    );
    itemId = r.rows[0].id as number;
  });

  it('[positive] owner can see shopping items in own event lists', async () => {
    const rows = await queryAsUser(ownerUserId, `SELECT id FROM shopping_items WHERE id = $1`, [
      itemId,
    ]);
    expect(rows).toHaveLength(1);
  });

  it('[negative] outsider cannot see shopping items in other events', async () => {
    const rows = await queryAsUser(outsiderUserId, `SELECT id FROM shopping_items WHERE id = $1`, [
      itemId,
    ]);
    expect(rows).toHaveLength(0);
  });
});

describe('store_suggestions — #768 RLS', () => {
  let suggestionId: number;

  beforeAll(async () => {
    const r = await exec(
      `INSERT INTO "${schema}".store_suggestions (event_id, name) VALUES ($1, 'Party Store') RETURNING id`,
      [ownedEventId],
    );
    suggestionId = r.rows[0].id as number;
  });

  it('[positive] owner can see store suggestions in own event', async () => {
    const rows = await queryAsUser(ownerUserId, `SELECT id FROM store_suggestions WHERE id = $1`, [
      suggestionId,
    ]);
    expect(rows).toHaveLength(1);
  });

  it('[negative] outsider cannot see store suggestions in other events', async () => {
    const rows = await queryAsUser(
      outsiderUserId,
      `SELECT id FROM store_suggestions WHERE id = $1`,
      [suggestionId],
    );
    expect(rows).toHaveLength(0);
  });
});

describe('rsvp_questions — #768 RLS', () => {
  let questionId: number;

  beforeAll(async () => {
    const r = await exec(
      `INSERT INTO "${schema}".rsvp_questions (event_id, prompt, question_type)
       VALUES ($1, 'Meal preference?', 'short_text') RETURNING id`,
      [ownedEventId],
    );
    questionId = r.rows[0].id as number;
  });

  it('[positive] owner can see RSVP questions in own event', async () => {
    const rows = await queryAsUser(ownerUserId, `SELECT id FROM rsvp_questions WHERE id = $1`, [
      questionId,
    ]);
    expect(rows).toHaveLength(1);
  });

  it('[negative] outsider cannot see RSVP questions in other events', async () => {
    const rows = await queryAsUser(outsiderUserId, `SELECT id FROM rsvp_questions WHERE id = $1`, [
      questionId,
    ]);
    expect(rows).toHaveLength(0);
  });
});

describe('rsvp_question_responses — #768 RLS', () => {
  let responseId: number;

  beforeAll(async () => {
    const qr = await exec(
      `INSERT INTO "${schema}".rsvp_questions (event_id, prompt, question_type)
       VALUES ($1, 'Diet?', 'short_text') RETURNING id`,
      [ownedEventId],
    );
    const questionId = qr.rows[0].id as number;
    const r = await exec(
      `INSERT INTO "${schema}".rsvp_question_responses (rsvp_id, question_id, response)
       VALUES ($1, $2, 'Vegan') RETURNING id`,
      [memberRsvpId, questionId],
    );
    responseId = r.rows[0].id as number;
  });

  it('[positive] owner can see RSVP question responses in own event', async () => {
    const rows = await queryAsUser(
      ownerUserId,
      `SELECT id FROM rsvp_question_responses WHERE id = $1`,
      [responseId],
    );
    expect(rows).toHaveLength(1);
  });

  it('[negative] outsider cannot see RSVP question responses in other events', async () => {
    const rows = await queryAsUser(
      outsiderUserId,
      `SELECT id FROM rsvp_question_responses WHERE id = $1`,
      [responseId],
    );
    expect(rows).toHaveLength(0);
  });
});

describe('gallery_albums — #768 RLS', () => {
  let albumId: number;

  beforeAll(async () => {
    const r = await exec(
      `INSERT INTO "${schema}".gallery_albums (event_id, name) VALUES ($1, 'Album A') RETURNING id`,
      [ownedEventId],
    );
    albumId = r.rows[0].id as number;
  });

  it('[positive] owner can see gallery albums in own event', async () => {
    const rows = await queryAsUser(ownerUserId, `SELECT id FROM gallery_albums WHERE id = $1`, [
      albumId,
    ]);
    expect(rows).toHaveLength(1);
  });

  it('[negative] outsider cannot see gallery albums in other events', async () => {
    const rows = await queryAsUser(outsiderUserId, `SELECT id FROM gallery_albums WHERE id = $1`, [
      albumId,
    ]);
    expect(rows).toHaveLength(0);
  });
});

describe('communication_log — #768 RLS', () => {
  let logId: number;

  beforeAll(async () => {
    const r = await exec(
      `INSERT INTO "${schema}".communication_log (event_id, communication_type)
       VALUES ($1, 'email') RETURNING id`,
      [ownedEventId],
    );
    logId = r.rows[0].id as number;
  });

  it('[positive] owner can see communication log in own event', async () => {
    const rows = await queryAsUser(ownerUserId, `SELECT id FROM communication_log WHERE id = $1`, [
      logId,
    ]);
    expect(rows).toHaveLength(1);
  });

  it('[negative] outsider cannot see communication log in other events', async () => {
    const rows = await queryAsUser(
      outsiderUserId,
      `SELECT id FROM communication_log WHERE id = $1`,
      [logId],
    );
    expect(rows).toHaveLength(0);
  });
});

describe('event_documents — #768 RLS', () => {
  let docId: number;

  beforeAll(async () => {
    const r = await exec(
      `INSERT INTO "${schema}".event_documents (event_id) VALUES ($1) RETURNING id`,
      [ownedEventId],
    );
    docId = r.rows[0].id as number;
  });

  it('[positive] owner can see event documents in own event', async () => {
    const rows = await queryAsUser(ownerUserId, `SELECT id FROM event_documents WHERE id = $1`, [
      docId,
    ]);
    expect(rows).toHaveLength(1);
  });

  it('[negative] outsider cannot see event documents in other events', async () => {
    const rows = await queryAsUser(outsiderUserId, `SELECT id FROM event_documents WHERE id = $1`, [
      docId,
    ]);
    expect(rows).toHaveLength(0);
  });
});

describe('event_messages — #768 RLS', () => {
  let msgId: number;

  beforeAll(async () => {
    const r = await exec(
      `INSERT INTO "${schema}".event_messages (event_id, sender_id, body)
       VALUES ($1, $2, 'hello') RETURNING id`,
      [ownedEventId, ownerUserId],
    );
    msgId = r.rows[0].id as number;
  });

  it('[positive] owner can see event messages in own event', async () => {
    const rows = await queryAsUser(ownerUserId, `SELECT id FROM event_messages WHERE id = $1`, [
      msgId,
    ]);
    expect(rows).toHaveLength(1);
  });

  it('[negative] outsider cannot see event messages in other events', async () => {
    const rows = await queryAsUser(outsiderUserId, `SELECT id FROM event_messages WHERE id = $1`, [
      msgId,
    ]);
    expect(rows).toHaveLength(0);
  });
});

describe('vendor_favorites — #768 RLS', () => {
  let favoriteId: number;

  beforeAll(async () => {
    const vr = await exec(
      `INSERT INTO "${schema}".vendors (event_id, name) VALUES ($1, 'Vendor A') RETURNING id`,
      [ownedEventId],
    );
    const vendorId = vr.rows[0].id as number;
    const r = await exec(
      `INSERT INTO "${schema}".vendor_favorites (event_id, vendor_id, user_id)
       VALUES ($1, $2, $3) RETURNING id`,
      [ownedEventId, vendorId, ownerUserId],
    );
    favoriteId = r.rows[0].id as number;
  });

  it('[positive] owner can see vendor favorites in own event', async () => {
    const rows = await queryAsUser(ownerUserId, `SELECT id FROM vendor_favorites WHERE id = $1`, [
      favoriteId,
    ]);
    expect(rows).toHaveLength(1);
  });

  it('[negative] outsider cannot see vendor favorites in other events', async () => {
    const rows = await queryAsUser(
      outsiderUserId,
      `SELECT id FROM vendor_favorites WHERE id = $1`,
      [favoriteId],
    );
    expect(rows).toHaveLength(0);
  });
});

describe('rsvp_access_tokens — #768 RLS', () => {
  let outsiderRsvpId: number;

  beforeAll(async () => {
    // token for member rsvp on ownedEvent
    await exec(`INSERT INTO "${schema}".rsvp_access_tokens (rsvp_id, token) VALUES ($1, $2)`, [
      memberRsvpId,
      nextToken(),
    ]);
    // outsider rsvp on their own event
    outsiderRsvpId = await seedRsvp(outsiderEventId, 'Outsider Guest');
    await exec(`INSERT INTO "${schema}".rsvp_access_tokens (rsvp_id, token) VALUES ($1, $2)`, [
      outsiderRsvpId,
      nextToken(),
    ]);
  });

  it('[positive] event owner can see tokens for rsvps in their event', async () => {
    const rows = await queryAsUser(
      ownerUserId,
      `SELECT rsvp_id FROM rsvp_access_tokens WHERE rsvp_id = $1`,
      [memberRsvpId],
    );
    expect(rows).toHaveLength(1);
  });

  it('[negative] outsider cannot see tokens for rsvps in another event', async () => {
    const rows = await queryAsUser(
      outsiderUserId,
      `SELECT rsvp_id FROM rsvp_access_tokens WHERE rsvp_id = $1`,
      [memberRsvpId],
    );
    expect(rows).toHaveLength(0);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// gallery_slideshows
// ════════════════════════════════════════════════════════════════════════════

describe('gallery_slideshows — #768 RLS', () => {
  let outsiderSlideshowId: number;

  beforeAll(async () => {
    outsiderSlideshowId = await seedSlideshow(outsiderEventId);
  });

  it('[positive] event owner can see own slideshows', async () => {
    const rows = await queryAsUser(ownerUserId, `SELECT id FROM gallery_slideshows WHERE id = $1`, [
      ownerSlideshowId,
    ]);
    expect(rows).toHaveLength(1);
  });

  it('[positive] event member can see slideshows of joined event', async () => {
    const rows = await queryAsUser(
      memberUserId,
      `SELECT id FROM gallery_slideshows WHERE id = $1`,
      [ownerSlideshowId],
    );
    expect(rows).toHaveLength(1);
  });

  it('[negative] outsider cannot see slideshows from another event', async () => {
    const rows = await queryAsUser(
      outsiderUserId,
      `SELECT id FROM gallery_slideshows WHERE id = $1`,
      [ownerSlideshowId],
    );
    expect(rows).toHaveLength(0);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// gallery_share_links
// ════════════════════════════════════════════════════════════════════════════

describe('gallery_share_links — #768 RLS', () => {
  let linkId: number;

  beforeAll(async () => {
    const r = await exec(
      `INSERT INTO "${schema}".gallery_share_links (event_id, token) VALUES ($1, $2) RETURNING id`,
      [ownedEventId, nextToken()],
    );
    linkId = r.rows[0].id as number;
  });

  it('[positive] event owner can see share links', async () => {
    const rows = await queryAsUser(
      ownerUserId,
      `SELECT id FROM gallery_share_links WHERE id = $1`,
      [linkId],
    );
    expect(rows).toHaveLength(1);
  });

  it('[positive] event member can see share links', async () => {
    const rows = await queryAsUser(
      memberUserId,
      `SELECT id FROM gallery_share_links WHERE id = $1`,
      [linkId],
    );
    expect(rows).toHaveLength(1);
  });

  it('[negative] outsider cannot see share links from another event', async () => {
    const rows = await queryAsUser(
      outsiderUserId,
      `SELECT id FROM gallery_share_links WHERE id = $1`,
      [linkId],
    );
    expect(rows).toHaveLength(0);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// gallery_comments
// ════════════════════════════════════════════════════════════════════════════

describe('gallery_comments — #768 RLS', () => {
  let commentId: number;
  let outsiderDocId: number;
  let outsiderCommentId: number;

  beforeAll(async () => {
    const r = await exec(
      `INSERT INTO "${schema}".gallery_comments (event_id, document_id, body) VALUES ($1, $2, 'great pic') RETURNING id`,
      [ownedEventId, ownerDocumentId],
    );
    commentId = r.rows[0].id as number;

    outsiderDocId = await seedDocument(outsiderEventId);
    const r2 = await exec(
      `INSERT INTO "${schema}".gallery_comments (event_id, document_id, body) VALUES ($1, $2, 'outsider comment') RETURNING id`,
      [outsiderEventId, outsiderDocId],
    );
    outsiderCommentId = r2.rows[0].id as number;
  });

  it('[positive] event owner can see comments on their event gallery', async () => {
    const rows = await queryAsUser(ownerUserId, `SELECT id FROM gallery_comments WHERE id = $1`, [
      commentId,
    ]);
    expect(rows).toHaveLength(1);
  });

  it('[positive] event member can see comments on joined event gallery', async () => {
    const rows = await queryAsUser(memberUserId, `SELECT id FROM gallery_comments WHERE id = $1`, [
      commentId,
    ]);
    expect(rows).toHaveLength(1);
  });

  it('[negative] outsider cannot see comments from another event', async () => {
    const rows = await queryAsUser(
      outsiderUserId,
      `SELECT id FROM gallery_comments WHERE id = $1`,
      [commentId],
    );
    expect(rows).toHaveLength(0);
  });

  it('[negative] owner cannot see outsider event gallery comments', async () => {
    const rows = await queryAsUser(ownerUserId, `SELECT id FROM gallery_comments WHERE id = $1`, [
      outsiderCommentId,
    ]);
    expect(rows).toHaveLength(0);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// slideshow_items
// ════════════════════════════════════════════════════════════════════════════

describe('slideshow_items — #768 RLS', () => {
  let itemId: number;

  beforeAll(async () => {
    const r = await exec(
      `INSERT INTO "${schema}".slideshow_items (slideshow_id, document_id, sort_order) VALUES ($1, $2, 1) RETURNING id`,
      [ownerSlideshowId, ownerDocumentId],
    );
    itemId = r.rows[0].id as number;
  });

  it('[positive] event owner can see slideshow items', async () => {
    const rows = await queryAsUser(ownerUserId, `SELECT id FROM slideshow_items WHERE id = $1`, [
      itemId,
    ]);
    expect(rows).toHaveLength(1);
  });

  it('[positive] event member can see slideshow items', async () => {
    const rows = await queryAsUser(memberUserId, `SELECT id FROM slideshow_items WHERE id = $1`, [
      itemId,
    ]);
    expect(rows).toHaveLength(1);
  });

  it('[negative] outsider cannot see slideshow items from another event', async () => {
    const rows = await queryAsUser(outsiderUserId, `SELECT id FROM slideshow_items WHERE id = $1`, [
      itemId,
    ]);
    expect(rows).toHaveLength(0);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// communication_tracking_events
// ════════════════════════════════════════════════════════════════════════════

describe('communication_tracking_events — #768 RLS', () => {
  let trackingId: number;
  let outsiderCommLogId: number;
  let outsiderTrackingId: number;

  beforeAll(async () => {
    const r = await exec(
      `INSERT INTO "${schema}".communication_tracking_events (communication_log_id, event_type)
       VALUES ($1, 'open') RETURNING id`,
      [ownerCommLogId],
    );
    trackingId = r.rows[0].id as number;

    outsiderCommLogId = await seedCommunicationLog(outsiderEventId);
    const r2 = await exec(
      `INSERT INTO "${schema}".communication_tracking_events (communication_log_id, event_type)
       VALUES ($1, 'click') RETURNING id`,
      [outsiderCommLogId],
    );
    outsiderTrackingId = r2.rows[0].id as number;
  });

  it('[positive] event owner can see tracking events for their comm log', async () => {
    const rows = await queryAsUser(
      ownerUserId,
      `SELECT id FROM communication_tracking_events WHERE id = $1`,
      [trackingId],
    );
    expect(rows).toHaveLength(1);
  });

  it('[negative] outsider cannot see tracking events from another event', async () => {
    const rows = await queryAsUser(
      outsiderUserId,
      `SELECT id FROM communication_tracking_events WHERE id = $1`,
      [trackingId],
    );
    expect(rows).toHaveLength(0);
  });

  it('[negative] owner cannot see outsider tracking events', async () => {
    const rows = await queryAsUser(
      ownerUserId,
      `SELECT id FROM communication_tracking_events WHERE id = $1`,
      [outsiderTrackingId],
    );
    expect(rows).toHaveLength(0);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// communication_templates
// ════════════════════════════════════════════════════════════════════════════

describe('communication_templates — #768 RLS', () => {
  let globalTplId: number;
  let eventTplId: number;
  let outsiderTplId: number;

  beforeAll(async () => {
    // Global template (event_id = NULL) — visible to all authenticated users
    const r1 = await exec(
      `INSERT INTO "${schema}".communication_templates (event_id, slug, name)
       VALUES (NULL, 'global-invite', 'Global Invite') RETURNING id`,
    );
    globalTplId = r1.rows[0].id as number;

    // Event-scoped template
    const r2 = await exec(
      `INSERT INTO "${schema}".communication_templates (event_id, slug, name)
       VALUES ($1, 'event-invite', 'Event Invite') RETURNING id`,
      [ownedEventId],
    );
    eventTplId = r2.rows[0].id as number;

    // Outsider event-scoped template
    const r3 = await exec(
      `INSERT INTO "${schema}".communication_templates (event_id, slug, name)
       VALUES ($1, 'outsider-invite', 'Outsider Invite') RETURNING id`,
      [outsiderEventId],
    );
    outsiderTplId = r3.rows[0].id as number;
  });

  it('[positive] any authenticated user sees global (NULL event_id) templates', async () => {
    const rows = await queryAsUser(
      outsiderUserId,
      `SELECT id FROM communication_templates WHERE id = $1`,
      [globalTplId],
    );
    expect(rows).toHaveLength(1);
  });

  it('[positive] event owner sees event-scoped templates for their event', async () => {
    const rows = await queryAsUser(
      ownerUserId,
      `SELECT id FROM communication_templates WHERE id = $1`,
      [eventTplId],
    );
    expect(rows).toHaveLength(1);
  });

  it('[negative] outsider cannot see event-scoped templates from another event', async () => {
    const rows = await queryAsUser(
      outsiderUserId,
      `SELECT id FROM communication_templates WHERE id = $1`,
      [eventTplId],
    );
    expect(rows).toHaveLength(0);
  });

  it('[negative] owner cannot see outsider event templates', async () => {
    const rows = await queryAsUser(
      ownerUserId,
      `SELECT id FROM communication_templates WHERE id = $1`,
      [outsiderTplId],
    );
    expect(rows).toHaveLength(0);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// scheduled_reports
// ════════════════════════════════════════════════════════════════════════════

describe('scheduled_reports — #768 RLS', () => {
  let globalReportId: number;
  let outsiderReportId: number;

  beforeAll(async () => {
    // Global report (event_id = NULL, created by ownerUser)
    const r1 = await exec(
      `INSERT INTO "${schema}".scheduled_reports (event_id, created_by) VALUES (NULL, $1) RETURNING id`,
      [ownerUserId],
    );
    globalReportId = r1.rows[0].id as number;

    // Report for outsider's event
    const r2 = await exec(
      `INSERT INTO "${schema}".scheduled_reports (event_id, created_by) VALUES ($1, $2) RETURNING id`,
      [outsiderEventId, outsiderUserId],
    );
    outsiderReportId = r2.rows[0].id as number;
  });

  it('[positive] event owner can see own event-scoped reports', async () => {
    const rows = await queryAsUser(ownerUserId, `SELECT id FROM scheduled_reports WHERE id = $1`, [
      ownerScheduledReportId,
    ]);
    expect(rows).toHaveLength(1);
  });

  it('[positive] creator can see own global (NULL event) reports', async () => {
    const rows = await queryAsUser(ownerUserId, `SELECT id FROM scheduled_reports WHERE id = $1`, [
      globalReportId,
    ]);
    expect(rows).toHaveLength(1);
  });

  it('[negative] outsider cannot see reports belonging to another event', async () => {
    const rows = await queryAsUser(
      outsiderUserId,
      `SELECT id FROM scheduled_reports WHERE id = $1`,
      [ownerScheduledReportId],
    );
    expect(rows).toHaveLength(0);
  });

  it('[negative] non-creator outsider cannot see global report they did not create', async () => {
    const rows = await queryAsUser(
      outsiderUserId,
      `SELECT id FROM scheduled_reports WHERE id = $1`,
      [globalReportId],
    );
    expect(rows).toHaveLength(0);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// scheduled_report_deliveries
// ════════════════════════════════════════════════════════════════════════════

describe('scheduled_report_deliveries — #768 RLS', () => {
  let deliveryId: number;
  let outsiderScheduledReportId: number;
  let outsiderDeliveryId: number;

  beforeAll(async () => {
    const r = await exec(
      `INSERT INTO "${schema}".scheduled_report_deliveries (report_id, status) VALUES ($1, 'success') RETURNING id`,
      [ownerScheduledReportId],
    );
    deliveryId = r.rows[0].id as number;

    const sr = await exec(
      `INSERT INTO "${schema}".scheduled_reports (event_id, created_by) VALUES ($1, $2) RETURNING id`,
      [outsiderEventId, outsiderUserId],
    );
    outsiderScheduledReportId = sr.rows[0].id as number;

    const r2 = await exec(
      `INSERT INTO "${schema}".scheduled_report_deliveries (report_id, status) VALUES ($1, 'success') RETURNING id`,
      [outsiderScheduledReportId],
    );
    outsiderDeliveryId = r2.rows[0].id as number;
  });

  it('[positive] event owner can see deliveries for their reports', async () => {
    const rows = await queryAsUser(
      ownerUserId,
      `SELECT id FROM scheduled_report_deliveries WHERE id = $1`,
      [deliveryId],
    );
    expect(rows).toHaveLength(1);
  });

  it('[negative] outsider cannot see deliveries for another event reports', async () => {
    const rows = await queryAsUser(
      outsiderUserId,
      `SELECT id FROM scheduled_report_deliveries WHERE id = $1`,
      [deliveryId],
    );
    expect(rows).toHaveLength(0);
  });

  it('[negative] owner cannot see outsider event report deliveries', async () => {
    const rows = await queryAsUser(
      ownerUserId,
      `SELECT id FROM scheduled_report_deliveries WHERE id = $1`,
      [outsiderDeliveryId],
    );
    expect(rows).toHaveLength(0);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// event_meal_options
// ════════════════════════════════════════════════════════════════════════════

describe('event_meal_options — #768 RLS', () => {
  let optionId: number;

  beforeAll(async () => {
    const r = await exec(
      `INSERT INTO "${schema}".event_meal_options (event_id, name) VALUES ($1, 'Vegan') RETURNING id`,
      [ownedEventId],
    );
    optionId = r.rows[0].id as number;
  });

  it('[positive] event owner can see meal options', async () => {
    const rows = await queryAsUser(ownerUserId, `SELECT id FROM event_meal_options WHERE id = $1`, [
      optionId,
    ]);
    expect(rows).toHaveLength(1);
  });

  it('[positive] event member can see meal options', async () => {
    const rows = await queryAsUser(
      memberUserId,
      `SELECT id FROM event_meal_options WHERE id = $1`,
      [optionId],
    );
    expect(rows).toHaveLength(1);
  });

  it('[negative] outsider cannot see meal options from another event', async () => {
    const rows = await queryAsUser(
      outsiderUserId,
      `SELECT id FROM event_meal_options WHERE id = $1`,
      [optionId],
    );
    expect(rows).toHaveLength(0);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// event_custom_fields
// ════════════════════════════════════════════════════════════════════════════

describe('event_custom_fields — #768 RLS', () => {
  let fieldId: number;

  beforeAll(async () => {
    const r = await exec(
      `INSERT INTO "${schema}".event_custom_fields (event_id, field_key, label, field_type)
       VALUES ($1, 'dress_code', 'Dress Code', 'text') RETURNING id`,
      [ownedEventId],
    );
    fieldId = r.rows[0].id as number;
  });

  it('[positive] event owner can see custom fields', async () => {
    const rows = await queryAsUser(
      ownerUserId,
      `SELECT id FROM event_custom_fields WHERE id = $1`,
      [fieldId],
    );
    expect(rows).toHaveLength(1);
  });

  it('[positive] event member can see custom fields', async () => {
    const rows = await queryAsUser(
      memberUserId,
      `SELECT id FROM event_custom_fields WHERE id = $1`,
      [fieldId],
    );
    expect(rows).toHaveLength(1);
  });

  it('[negative] outsider cannot see custom fields from another event', async () => {
    const rows = await queryAsUser(
      outsiderUserId,
      `SELECT id FROM event_custom_fields WHERE id = $1`,
      [fieldId],
    );
    expect(rows).toHaveLength(0);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// attendance_events
// ════════════════════════════════════════════════════════════════════════════

describe('attendance_events — #768 RLS', () => {
  let attendanceId: number;
  let outsiderRsvpForAttendance: number;
  let outsiderAttendanceId: number;

  beforeAll(async () => {
    const r = await exec(
      `INSERT INTO "${schema}".attendance_events (event_id, rsvp_id, action)
       VALUES ($1, $2, 'checked_in') RETURNING id`,
      [ownedEventId, memberRsvpId],
    );
    attendanceId = r.rows[0].id as number;

    outsiderRsvpForAttendance = await seedRsvp(outsiderEventId, 'Outsider Attendee');
    const r2 = await exec(
      `INSERT INTO "${schema}".attendance_events (event_id, rsvp_id, action)
       VALUES ($1, $2, 'checked_in') RETURNING id`,
      [outsiderEventId, outsiderRsvpForAttendance],
    );
    outsiderAttendanceId = r2.rows[0].id as number;
  });

  it('[positive] event owner can see attendance records', async () => {
    const rows = await queryAsUser(ownerUserId, `SELECT id FROM attendance_events WHERE id = $1`, [
      attendanceId,
    ]);
    expect(rows).toHaveLength(1);
  });

  it('[positive] event member can see attendance records', async () => {
    const rows = await queryAsUser(memberUserId, `SELECT id FROM attendance_events WHERE id = $1`, [
      attendanceId,
    ]);
    expect(rows).toHaveLength(1);
  });

  it('[negative] outsider cannot see attendance records from another event', async () => {
    const rows = await queryAsUser(
      outsiderUserId,
      `SELECT id FROM attendance_events WHERE id = $1`,
      [attendanceId],
    );
    expect(rows).toHaveLength(0);
  });

  it('[negative] owner cannot see outsider attendance records', async () => {
    const rows = await queryAsUser(ownerUserId, `SELECT id FROM attendance_events WHERE id = $1`, [
      outsiderAttendanceId,
    ]);
    expect(rows).toHaveLength(0);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// vendor_communication_log
// ════════════════════════════════════════════════════════════════════════════

describe('vendor_communication_log — #768 RLS', () => {
  let logId: number;

  beforeAll(async () => {
    const r = await exec(
      `INSERT INTO "${schema}".vendor_communication_log (event_id, subject) VALUES ($1, 'Invoice') RETURNING id`,
      [ownedEventId],
    );
    logId = r.rows[0].id as number;
  });

  it('[positive] event owner can see vendor communication logs', async () => {
    const rows = await queryAsUser(
      ownerUserId,
      `SELECT id FROM vendor_communication_log WHERE id = $1`,
      [logId],
    );
    expect(rows).toHaveLength(1);
  });

  it('[positive] event member can see vendor communication logs', async () => {
    const rows = await queryAsUser(
      memberUserId,
      `SELECT id FROM vendor_communication_log WHERE id = $1`,
      [logId],
    );
    expect(rows).toHaveLength(1);
  });

  it('[negative] outsider cannot see vendor communication logs from another event', async () => {
    const rows = await queryAsUser(
      outsiderUserId,
      `SELECT id FROM vendor_communication_log WHERE id = $1`,
      [logId],
    );
    expect(rows).toHaveLength(0);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// vendor_bookings
// ════════════════════════════════════════════════════════════════════════════

describe('vendor_bookings — #768 RLS', () => {
  let bookingId: number;
  let outsiderBookingId: number;

  beforeAll(async () => {
    const r = await exec(
      `INSERT INTO "${schema}".vendor_bookings (event_id, status) VALUES ($1, 'requested') RETURNING id`,
      [ownedEventId],
    );
    bookingId = r.rows[0].id as number;

    const r2 = await exec(
      `INSERT INTO "${schema}".vendor_bookings (event_id, status) VALUES ($1, 'requested') RETURNING id`,
      [outsiderEventId],
    );
    outsiderBookingId = r2.rows[0].id as number;
  });

  it('[positive] event owner can see vendor bookings', async () => {
    const rows = await queryAsUser(ownerUserId, `SELECT id FROM vendor_bookings WHERE id = $1`, [
      bookingId,
    ]);
    expect(rows).toHaveLength(1);
  });

  it('[positive] event member can see vendor bookings', async () => {
    const rows = await queryAsUser(memberUserId, `SELECT id FROM vendor_bookings WHERE id = $1`, [
      bookingId,
    ]);
    expect(rows).toHaveLength(1);
  });

  it('[negative] outsider cannot see vendor bookings from another event', async () => {
    const rows = await queryAsUser(outsiderUserId, `SELECT id FROM vendor_bookings WHERE id = $1`, [
      bookingId,
    ]);
    expect(rows).toHaveLength(0);
  });

  it('[negative] owner cannot see outsider vendor bookings', async () => {
    const rows = await queryAsUser(ownerUserId, `SELECT id FROM vendor_bookings WHERE id = $1`, [
      outsiderBookingId,
    ]);
    expect(rows).toHaveLength(0);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// vendor_payment_schedules
// ════════════════════════════════════════════════════════════════════════════

describe('vendor_payment_schedules — #768 RLS', () => {
  let scheduleId: number;
  let outsiderScheduleId: number;

  beforeAll(async () => {
    const r = await exec(
      `INSERT INTO "${schema}".vendor_payment_schedules (event_id, due_date, amount)
       VALUES ($1, CURRENT_DATE, 500) RETURNING id`,
      [ownedEventId],
    );
    scheduleId = r.rows[0].id as number;

    const r2 = await exec(
      `INSERT INTO "${schema}".vendor_payment_schedules (event_id, due_date, amount)
       VALUES ($1, CURRENT_DATE, 100) RETURNING id`,
      [outsiderEventId],
    );
    outsiderScheduleId = r2.rows[0].id as number;
  });

  it('[positive] event owner can see payment schedules', async () => {
    const rows = await queryAsUser(
      ownerUserId,
      `SELECT id FROM vendor_payment_schedules WHERE id = $1`,
      [scheduleId],
    );
    expect(rows).toHaveLength(1);
  });

  it('[positive] event member can see payment schedules', async () => {
    const rows = await queryAsUser(
      memberUserId,
      `SELECT id FROM vendor_payment_schedules WHERE id = $1`,
      [scheduleId],
    );
    expect(rows).toHaveLength(1);
  });

  it('[negative] outsider cannot see payment schedules from another event', async () => {
    const rows = await queryAsUser(
      outsiderUserId,
      `SELECT id FROM vendor_payment_schedules WHERE id = $1`,
      [scheduleId],
    );
    expect(rows).toHaveLength(0);
  });

  it('[negative] owner cannot see outsider pay schedules', async () => {
    const rows = await queryAsUser(
      ownerUserId,
      `SELECT id FROM vendor_payment_schedules WHERE id = $1`,
      [outsiderScheduleId],
    );
    expect(rows).toHaveLength(0);
  });
});
