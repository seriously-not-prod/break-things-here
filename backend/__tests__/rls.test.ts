/**
 * RLS integration tests — issues #421, #472, #474
 *
 * Proves that PostgreSQL row-level security policies on the events and
 * event_members pilot tables allow and deny access correctly.
 *
 * Each test creates its own isolated schema, seeds data, enables RLS,
 * then validates visibility via the withUserContext / SET LOCAL pattern.
 *
 * Requirements verified:
 *   - Event owner sees their own events
 *   - Event owner cannot see other users' events
 *   - Event member sees events they belong to (via event_members)
 *   - Non-member cannot see events they are not invited to
 *   - event_members row visibility is scoped to the requesting user
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import pg from 'pg';
import { randomUUID } from 'node:crypto';
import { resolveTestDatabaseUrl } from '../test-database-url.js';

const CONNECTION_STRING = resolveTestDatabaseUrl();

// ── Per-test isolated schema ─────────────────────────────────────────────────

interface RlsTestContext {
  pool: pg.Pool;
  schema: string;
  close: () => Promise<void>;
}

// PostgreSQL superusers bypass RLS. We create a dedicated non-superuser role
// for each test context and use SET LOCAL ROLE inside each query transaction so
// that RLS policies actually apply.
const RLS_TEST_ROLE = 'equip_rls_test_role';

async function createRlsTestContext(): Promise<RlsTestContext> {
  const schema = `rls_test_${randomUUID().replace(/-/g, '_')}`;
  const pool = new pg.Pool({ connectionString: CONNECTION_STRING });

  // Ensure the non-superuser test role exists (once per DB lifetime)
  await pool.query(`
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${RLS_TEST_ROLE}') THEN
        CREATE ROLE ${RLS_TEST_ROLE} NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE;
      END IF;
    END $$;
  `);

  await pool.query(`CREATE SCHEMA "${schema}"`);
  await pool.query(`GRANT USAGE ON SCHEMA "${schema}" TO ${RLS_TEST_ROLE}`);

  await pool.query(`
    CREATE TABLE "${schema}".users (
      id SERIAL PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      display_name TEXT NOT NULL
    )
  `);

  await pool.query(`
    CREATE TABLE "${schema}".events (
      id SERIAL PRIMARY KEY,
      title TEXT NOT NULL,
      created_by INTEGER NOT NULL REFERENCES "${schema}".users(id)
    )
  `);

  await pool.query(`
    CREATE TABLE "${schema}".event_members (
      event_id INTEGER NOT NULL REFERENCES "${schema}".events(id),
      user_id  INTEGER NOT NULL REFERENCES "${schema}".users(id),
      role     TEXT DEFAULT 'Member',
  PRIMARY KEY (event_id, user_id)
    )
  `);

  await pool.query(`
    CREATE TABLE "${schema}".tasks (
      id SERIAL PRIMARY KEY,
      event_id INTEGER NOT NULL REFERENCES "${schema}".events(id),
      title TEXT NOT NULL
    )
  `);

  await pool.query(`
    CREATE TABLE "${schema}".expenses (
      id SERIAL PRIMARY KEY,
      event_id INTEGER NOT NULL REFERENCES "${schema}".events(id),
      title TEXT NOT NULL,
      amount NUMERIC(10,2) NOT NULL DEFAULT 0
    )
  `);

  await pool.query(`
    CREATE TABLE "${schema}".vendors (
      id SERIAL PRIMARY KEY,
      event_id INTEGER NOT NULL REFERENCES "${schema}".events(id),
      name TEXT NOT NULL
    )
  `);

  await pool.query(`
    CREATE TABLE "${schema}".rsvps (
      id SERIAL PRIMARY KEY,
      event_id INTEGER NOT NULL REFERENCES "${schema}".events(id),
      guest_name TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'Pending'
    )
  `);

  await pool.query(
    `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA "${schema}" TO ${RLS_TEST_ROLE}`,
  );
  await pool.query(`GRANT USAGE ON ALL SEQUENCES IN SCHEMA "${schema}" TO ${RLS_TEST_ROLE}`);

  // Enable RLS on pilot tables
  await pool.query(`ALTER TABLE "${schema}".events ENABLE ROW LEVEL SECURITY`);
  await pool.query(`ALTER TABLE "${schema}".events FORCE ROW LEVEL SECURITY`);
  await pool.query(`ALTER TABLE "${schema}".event_members ENABLE ROW LEVEL SECURITY`);
  await pool.query(`ALTER TABLE "${schema}".event_members FORCE ROW LEVEL SECURITY`);
  await pool.query(`ALTER TABLE "${schema}".tasks ENABLE ROW LEVEL SECURITY`);
  await pool.query(`ALTER TABLE "${schema}".tasks FORCE ROW LEVEL SECURITY`);
  await pool.query(`ALTER TABLE "${schema}".expenses ENABLE ROW LEVEL SECURITY`);
  await pool.query(`ALTER TABLE "${schema}".expenses FORCE ROW LEVEL SECURITY`);
  await pool.query(`ALTER TABLE "${schema}".vendors ENABLE ROW LEVEL SECURITY`);
  await pool.query(`ALTER TABLE "${schema}".vendors FORCE ROW LEVEL SECURITY`);
  await pool.query(`ALTER TABLE "${schema}".rsvps ENABLE ROW LEVEL SECURITY`);
  await pool.query(`ALTER TABLE "${schema}".rsvps FORCE ROW LEVEL SECURITY`);

  // Owner policy: see events you created
  await pool.query(`
    CREATE POLICY rls_events_owner ON "${schema}".events
      USING (
        created_by = NULLIF(current_setting('app.current_user_id', true), '')::int
      )
  `);

  // Member policy: see events you belong to
  await pool.query(`
    CREATE POLICY rls_events_member ON "${schema}".events
      USING (
        id IN (
          SELECT event_id FROM "${schema}".event_members
          WHERE user_id = NULLIF(current_setting('app.current_user_id', true), '')::int
        )
      )
  `);

  // Event members — see only your own membership rows
  await pool.query(`
    CREATE POLICY rls_event_members_self ON "${schema}".event_members
      USING (
        user_id = NULLIF(current_setting('app.current_user_id', true), '')::int
      )
  `);

  await pool.query(`
    CREATE POLICY rls_tasks_event_member ON "${schema}".tasks
      USING (
        event_id IN (
          SELECT event_id FROM "${schema}".event_members
          WHERE user_id = NULLIF(current_setting('app.current_user_id', true), '')::int
        )
      )
  `);

  await pool.query(`
    CREATE POLICY rls_expenses_event_member ON "${schema}".expenses
      USING (
        event_id IN (
          SELECT event_id FROM "${schema}".event_members
          WHERE user_id = NULLIF(current_setting('app.current_user_id', true), '')::int
        )
      )
  `);

  await pool.query(`
    CREATE POLICY rls_vendors_event_member ON "${schema}".vendors
      USING (
        event_id IN (
          SELECT event_id FROM "${schema}".event_members
          WHERE user_id = NULLIF(current_setting('app.current_user_id', true), '')::int
        )
      )
  `);

  await pool.query(`
    CREATE POLICY rls_rsvps_access ON "${schema}".rsvps
      USING (
        event_id IN (
          SELECT event_id FROM "${schema}".event_members
          WHERE user_id = NULLIF(current_setting('app.current_user_id', true), '')::int
            AND LOWER(role) IN ('organizer', 'admin', 'collaborator', 'owner', 'co-organizer', 'helper')
        )
      )
  `);

  return {
    pool,
    schema,
    close: async () => {
      await pool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await pool.end();
    },
  };
}

// ── Query helper that runs with a specific user context ──────────────────────

async function queryAsUser<T extends pg.QueryResultRow = pg.QueryResultRow>(
  pool: pg.Pool,
  schema: string,
  userId: number,
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`SET LOCAL search_path TO "${schema}", public`);
    // Switch to non-superuser role so RLS policies are enforced
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

// ── Test data helpers ────────────────────────────────────────────────────────

async function seedUser(pool: pg.Pool, schema: string, email: string): Promise<number> {
  const result = await pool.query<{ id: number }>(
    `INSERT INTO "${schema}".users (email, display_name) VALUES ($1, $2) RETURNING id`,
    [email, email.split('@')[0]],
  );
  return result.rows[0].id;
}

async function seedEvent(
  pool: pg.Pool,
  schema: string,
  title: string,
  createdBy: number,
): Promise<number> {
  const result = await pool.query<{ id: number }>(
    `INSERT INTO "${schema}".events (title, created_by) VALUES ($1, $2) RETURNING id`,
    [title, createdBy],
  );
  return result.rows[0].id;
}

async function addMember(
  pool: pg.Pool,
  schema: string,
  eventId: number,
  userId: number,
): Promise<void> {
  await pool.query(
    `INSERT INTO "${schema}".event_members (event_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
    [eventId, userId],
  );
}

async function seedTask(
  pool: pg.Pool,
  schema: string,
  eventId: number,
  title: string,
): Promise<number> {
  const result = await pool.query<{ id: number }>(
    `INSERT INTO "${schema}".tasks (event_id, title) VALUES ($1, $2) RETURNING id`,
    [eventId, title],
  );
  return result.rows[0].id;
}

async function seedExpense(
  pool: pg.Pool,
  schema: string,
  eventId: number,
  title: string,
): Promise<number> {
  const result = await pool.query<{ id: number }>(
    `INSERT INTO "${schema}".expenses (event_id, title, amount) VALUES ($1, $2, $3) RETURNING id`,
    [eventId, title, 100],
  );
  return result.rows[0].id;
}

async function seedVendor(
  pool: pg.Pool,
  schema: string,
  eventId: number,
  name: string,
): Promise<number> {
  const result = await pool.query<{ id: number }>(
    `INSERT INTO "${schema}".vendors (event_id, name) VALUES ($1, $2) RETURNING id`,
    [eventId, name],
  );
  return result.rows[0].id;
}

// ── Tests ────────────────────────────────────────────────────────────────────

let ctx: RlsTestContext;

beforeEach(async () => {
  ctx = await createRlsTestContext();
});

afterEach(async () => {
  await ctx.close();
});

describe('RLS pilot — events table', () => {
  it('owner can see their own events', async () => {
    const alice = await seedUser(ctx.pool, ctx.schema, 'alice@example.com');
    await seedEvent(ctx.pool, ctx.schema, 'Alice Event', alice);

    const rows = await queryAsUser(
      ctx.pool,
      ctx.schema,
      alice,
      `SELECT id, title FROM "${ctx.schema}".events`,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].title).toBe('Alice Event');
  });

  it('owner cannot see events created by another user', async () => {
    const alice = await seedUser(ctx.pool, ctx.schema, 'alice2@example.com');
    const bob = await seedUser(ctx.pool, ctx.schema, 'bob@example.com');
    await seedEvent(ctx.pool, ctx.schema, 'Bob Event', bob);

    const rows = await queryAsUser(
      ctx.pool,
      ctx.schema,
      alice,
      `SELECT id FROM "${ctx.schema}".events`,
    );
    expect(rows).toHaveLength(0);
  });

  it('event member sees events they belong to (not owner)', async () => {
    const alice = await seedUser(ctx.pool, ctx.schema, 'alice3@example.com');
    const bob = await seedUser(ctx.pool, ctx.schema, 'bob2@example.com');
    const eventId = await seedEvent(ctx.pool, ctx.schema, 'Alice Event 2', alice);

    await addMember(ctx.pool, ctx.schema, eventId, bob);

    const rows = await queryAsUser<{ title: string }>(
      ctx.pool,
      ctx.schema,
      bob,
      `SELECT title FROM "${ctx.schema}".events`,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].title).toBe('Alice Event 2');
  });

  it('non-member cannot see events they are not part of', async () => {
    const alice = await seedUser(ctx.pool, ctx.schema, 'alice4@example.com');
    const bob = await seedUser(ctx.pool, ctx.schema, 'bob3@example.com');
    await seedEvent(ctx.pool, ctx.schema, 'Private Event', alice);

    const rows = await queryAsUser(
      ctx.pool,
      ctx.schema,
      bob,
      `SELECT id FROM "${ctx.schema}".events`,
    );
    expect(rows).toHaveLength(0);
  });

  it('owner sees both their events and events where they are a member', async () => {
    const alice = await seedUser(ctx.pool, ctx.schema, 'alice5@example.com');
    const bob = await seedUser(ctx.pool, ctx.schema, 'bob4@example.com');

    await seedEvent(ctx.pool, ctx.schema, 'Alice Own Event', alice);
    const bobEventId = await seedEvent(ctx.pool, ctx.schema, 'Bob Event 2', bob);
    await addMember(ctx.pool, ctx.schema, bobEventId, alice);

    const rows = await queryAsUser(
      ctx.pool,
      ctx.schema,
      alice,
      `SELECT id FROM "${ctx.schema}".events ORDER BY id`,
    );
    expect(rows).toHaveLength(2);
  });
});

describe('RLS pilot — event_members table', () => {
  it('user sees only their own membership rows', async () => {
    const alice = await seedUser(ctx.pool, ctx.schema, 'alice6@example.com');
    const bob = await seedUser(ctx.pool, ctx.schema, 'bob5@example.com');
    const eve = await seedUser(ctx.pool, ctx.schema, 'eve@example.com');

    const eventId = await seedEvent(ctx.pool, ctx.schema, 'Shared Event', alice);
    await addMember(ctx.pool, ctx.schema, eventId, alice);
    await addMember(ctx.pool, ctx.schema, eventId, bob);
    await addMember(ctx.pool, ctx.schema, eventId, eve);

    const aliceRows = await queryAsUser(
      ctx.pool,
      ctx.schema,
      alice,
      `SELECT user_id FROM "${ctx.schema}".event_members`,
    );
    expect(aliceRows).toHaveLength(1);
    expect(aliceRows[0].user_id).toBe(alice);

    const bobRows = await queryAsUser(
      ctx.pool,
      ctx.schema,
      bob,
      `SELECT user_id FROM "${ctx.schema}".event_members`,
    );
    expect(bobRows).toHaveLength(1);
    expect(bobRows[0].user_id).toBe(bob);
  });

  it('user with no memberships sees no event_members rows', async () => {
    const alice = await seedUser(ctx.pool, ctx.schema, 'alice7@example.com');
    const bob = await seedUser(ctx.pool, ctx.schema, 'bob6@example.com');
    const eventId = await seedEvent(ctx.pool, ctx.schema, 'Event', alice);
    await addMember(ctx.pool, ctx.schema, eventId, alice);

    const rows = await queryAsUser(
      ctx.pool,
      ctx.schema,
      bob,
      `SELECT * FROM "${ctx.schema}".event_members`,
    );
    expect(rows).toHaveLength(0);
  });
});

describe('RLS pilot — no context set', () => {
  it('queries without user context see no events (NULLIF returns NULL)', async () => {
    const alice = await seedUser(ctx.pool, ctx.schema, 'alice8@example.com');
    await seedEvent(ctx.pool, ctx.schema, 'Hidden Event', alice);

    const client = await ctx.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SET LOCAL search_path TO "${ctx.schema}", public`);
      await client.query(`SET LOCAL ROLE ${RLS_TEST_ROLE}`);
      // No app.current_user_id set — policy uses NULLIF which returns NULL → no match
      const result = await client.query(`SELECT id FROM "${ctx.schema}".events`);
      await client.query('COMMIT');
      expect(result.rows).toHaveLength(0);
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  });
});

describe('RLS v2 regression matrix — read/write allow-deny', () => {
  it('read path #1: tasks visible only to event members', async () => {
    const owner = await seedUser(ctx.pool, ctx.schema, 'owner1@example.com');
    const member = await seedUser(ctx.pool, ctx.schema, 'member1@example.com');
    const outsider = await seedUser(ctx.pool, ctx.schema, 'outsider1@example.com');
    const eventId = await seedEvent(ctx.pool, ctx.schema, 'Read Tasks Event', owner);
    await addMember(ctx.pool, ctx.schema, eventId, member);
    await seedTask(ctx.pool, ctx.schema, eventId, 'Task One');

    const allowed = await queryAsUser<{ title: string }>(
      ctx.pool,
      ctx.schema,
      member,
      `SELECT title FROM "${ctx.schema}".tasks`,
    );
    expect(allowed).toHaveLength(1);
    expect(allowed[0].title).toBe('Task One');

    const denied = await queryAsUser(
      ctx.pool,
      ctx.schema,
      outsider,
      `SELECT title FROM "${ctx.schema}".tasks`,
    );
    expect(denied).toHaveLength(0);
  });

  it('read path #2: expenses visible only to event members', async () => {
    const owner = await seedUser(ctx.pool, ctx.schema, 'owner2@example.com');
    const member = await seedUser(ctx.pool, ctx.schema, 'member2@example.com');
    const outsider = await seedUser(ctx.pool, ctx.schema, 'outsider2@example.com');
    const eventId = await seedEvent(ctx.pool, ctx.schema, 'Read Expenses Event', owner);
    await addMember(ctx.pool, ctx.schema, eventId, member);
    await seedExpense(ctx.pool, ctx.schema, eventId, 'Venue Deposit');

    const allowed = await queryAsUser<{ title: string }>(
      ctx.pool,
      ctx.schema,
      member,
      `SELECT title FROM "${ctx.schema}".expenses`,
    );
    expect(allowed).toHaveLength(1);
    expect(allowed[0].title).toBe('Venue Deposit');

    const denied = await queryAsUser(
      ctx.pool,
      ctx.schema,
      outsider,
      `SELECT title FROM "${ctx.schema}".expenses`,
    );
    expect(denied).toHaveLength(0);
  });

  it('read path #3: vendors visible only to event members', async () => {
    const owner = await seedUser(ctx.pool, ctx.schema, 'owner3@example.com');
    const member = await seedUser(ctx.pool, ctx.schema, 'member3@example.com');
    const outsider = await seedUser(ctx.pool, ctx.schema, 'outsider3@example.com');
    const eventId = await seedEvent(ctx.pool, ctx.schema, 'Read Vendors Event', owner);
    await addMember(ctx.pool, ctx.schema, eventId, member);
    await seedVendor(ctx.pool, ctx.schema, eventId, 'Best Catering');

    const allowed = await queryAsUser<{ name: string }>(
      ctx.pool,
      ctx.schema,
      member,
      `SELECT name FROM "${ctx.schema}".vendors`,
    );
    expect(allowed).toHaveLength(1);
    expect(allowed[0].name).toBe('Best Catering');

    const denied = await queryAsUser(
      ctx.pool,
      ctx.schema,
      outsider,
      `SELECT name FROM "${ctx.schema}".vendors`,
    );
    expect(denied).toHaveLength(0);
  });

  it('write path #1: task insert allows members and denies outsiders', async () => {
    const owner = await seedUser(ctx.pool, ctx.schema, 'owner4@example.com');
    const member = await seedUser(ctx.pool, ctx.schema, 'member4@example.com');
    const outsider = await seedUser(ctx.pool, ctx.schema, 'outsider4@example.com');
    const eventId = await seedEvent(ctx.pool, ctx.schema, 'Write Task Event', owner);
    await addMember(ctx.pool, ctx.schema, eventId, member);

    const inserted = await queryAsUser<{ title: string }>(
      ctx.pool,
      ctx.schema,
      member,
      `INSERT INTO "${ctx.schema}".tasks (event_id, title) VALUES ($1, $2) RETURNING title`,
      [eventId, 'Member Inserted Task'],
    );
    expect(inserted).toHaveLength(1);
    expect(inserted[0].title).toBe('Member Inserted Task');

    await expect(
      queryAsUser(
        ctx.pool,
        ctx.schema,
        outsider,
        `INSERT INTO "${ctx.schema}".tasks (event_id, title) VALUES ($1, $2) RETURNING id`,
        [eventId, 'Outsider Task'],
      ),
    ).rejects.toThrow(/row-level security policy/i);
  });

  it('write path #2: expense update allows members and denies outsiders', async () => {
    const owner = await seedUser(ctx.pool, ctx.schema, 'owner5@example.com');
    const member = await seedUser(ctx.pool, ctx.schema, 'member5@example.com');
    const outsider = await seedUser(ctx.pool, ctx.schema, 'outsider5@example.com');
    const eventId = await seedEvent(ctx.pool, ctx.schema, 'Write Expense Event', owner);
    await addMember(ctx.pool, ctx.schema, eventId, member);
    const expenseId = await seedExpense(ctx.pool, ctx.schema, eventId, 'Floral');

    const updated = await queryAsUser<{ title: string }>(
      ctx.pool,
      ctx.schema,
      member,
      `UPDATE "${ctx.schema}".expenses SET title = $1 WHERE id = $2 RETURNING title`,
      ['Floral Updated', expenseId],
    );
    expect(updated).toHaveLength(1);
    expect(updated[0].title).toBe('Floral Updated');

    const denied = await queryAsUser(
      ctx.pool,
      ctx.schema,
      outsider,
      `UPDATE "${ctx.schema}".expenses SET title = $1 WHERE id = $2 RETURNING id`,
      ['Outsider Update', expenseId],
    );
    expect(denied).toHaveLength(0);
  });

  it('write path #3: vendor delete allows members and denies outsiders', async () => {
    const owner = await seedUser(ctx.pool, ctx.schema, 'owner6@example.com');
    const member = await seedUser(ctx.pool, ctx.schema, 'member6@example.com');
    const outsider = await seedUser(ctx.pool, ctx.schema, 'outsider6@example.com');
    const eventId = await seedEvent(ctx.pool, ctx.schema, 'Write Vendor Event', owner);
    await addMember(ctx.pool, ctx.schema, eventId, member);

    const deletableVendor = await seedVendor(ctx.pool, ctx.schema, eventId, 'Delete Me Vendor');
    const protectedVendor = await seedVendor(ctx.pool, ctx.schema, eventId, 'Protected Vendor');

    const deleted = await queryAsUser<{ id: number }>(
      ctx.pool,
      ctx.schema,
      member,
      `DELETE FROM "${ctx.schema}".vendors WHERE id = $1 RETURNING id`,
      [deletableVendor],
    );
    expect(deleted).toHaveLength(1);
    expect(deleted[0].id).toBe(deletableVendor);

    const denied = await queryAsUser(
      ctx.pool,
      ctx.schema,
      outsider,
      `DELETE FROM "${ctx.schema}".vendors WHERE id = $1 RETURNING id`,
      [protectedVendor],
    );
    expect(denied).toHaveLength(0);
  });
});
