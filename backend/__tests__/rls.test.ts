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

async function createRlsTestContext(): Promise<RlsTestContext> {
  const schema = `rls_test_${randomUUID().replace(/-/g, '_')}`;
  const pool = new pg.Pool({ connectionString: CONNECTION_STRING });

  await pool.query(`CREATE SCHEMA "${schema}"`);
  await pool.query(`SET search_path TO "${schema}", public`);

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
      PRIMARY KEY (event_id, user_id)
    )
  `);

  // Enable RLS on pilot tables
  await pool.query(`ALTER TABLE "${schema}".events ENABLE ROW LEVEL SECURITY`);
  await pool.query(`ALTER TABLE "${schema}".events FORCE ROW LEVEL SECURITY`);
  await pool.query(`ALTER TABLE "${schema}".event_members ENABLE ROW LEVEL SECURITY`);
  await pool.query(`ALTER TABLE "${schema}".event_members FORCE ROW LEVEL SECURITY`);

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
    await client.query(`SET search_path TO "${schema}", public`);
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

async function seedEvent(pool: pg.Pool, schema: string, title: string, createdBy: number): Promise<number> {
  const result = await pool.query<{ id: number }>(
    `INSERT INTO "${schema}".events (title, created_by) VALUES ($1, $2) RETURNING id`,
    [title, createdBy],
  );
  return result.rows[0].id;
}

async function addMember(pool: pg.Pool, schema: string, eventId: number, userId: number): Promise<void> {
  await pool.query(
    `INSERT INTO "${schema}".event_members (event_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
    [eventId, userId],
  );
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

    const rows = await queryAsUser(ctx.pool, ctx.schema, alice, `SELECT id, title FROM "${ctx.schema}".events`);
    expect(rows).toHaveLength(1);
    expect(rows[0].title).toBe('Alice Event');
  });

  it('owner cannot see events created by another user', async () => {
    const alice = await seedUser(ctx.pool, ctx.schema, 'alice2@example.com');
    const bob = await seedUser(ctx.pool, ctx.schema, 'bob@example.com');
    await seedEvent(ctx.pool, ctx.schema, 'Bob Event', bob);

    const rows = await queryAsUser(ctx.pool, ctx.schema, alice, `SELECT id FROM "${ctx.schema}".events`);
    expect(rows).toHaveLength(0);
  });

  it('event member sees events they belong to (not owner)', async () => {
    const alice = await seedUser(ctx.pool, ctx.schema, 'alice3@example.com');
    const bob = await seedUser(ctx.pool, ctx.schema, 'bob2@example.com');
    const eventId = await seedEvent(ctx.pool, ctx.schema, 'Alice Event 2', alice);

    await addMember(ctx.pool, ctx.schema, eventId, bob);

    const rows = await queryAsUser<{ title: string }>(ctx.pool, ctx.schema, bob, `SELECT title FROM "${ctx.schema}".events`);
    expect(rows).toHaveLength(1);
    expect(rows[0].title).toBe('Alice Event 2');
  });

  it('non-member cannot see events they are not part of', async () => {
    const alice = await seedUser(ctx.pool, ctx.schema, 'alice4@example.com');
    const bob = await seedUser(ctx.pool, ctx.schema, 'bob3@example.com');
    await seedEvent(ctx.pool, ctx.schema, 'Private Event', alice);

    const rows = await queryAsUser(ctx.pool, ctx.schema, bob, `SELECT id FROM "${ctx.schema}".events`);
    expect(rows).toHaveLength(0);
  });

  it('owner sees both their events and events where they are a member', async () => {
    const alice = await seedUser(ctx.pool, ctx.schema, 'alice5@example.com');
    const bob = await seedUser(ctx.pool, ctx.schema, 'bob4@example.com');

    await seedEvent(ctx.pool, ctx.schema, 'Alice Own Event', alice);
    const bobEventId = await seedEvent(ctx.pool, ctx.schema, 'Bob Event 2', bob);
    await addMember(ctx.pool, ctx.schema, bobEventId, alice);

    const rows = await queryAsUser(ctx.pool, ctx.schema, alice, `SELECT id FROM "${ctx.schema}".events ORDER BY id`);
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

    const aliceRows = await queryAsUser(ctx.pool, ctx.schema, alice, `SELECT user_id FROM "${ctx.schema}".event_members`);
    expect(aliceRows).toHaveLength(1);
    expect(aliceRows[0].user_id).toBe(alice);

    const bobRows = await queryAsUser(ctx.pool, ctx.schema, bob, `SELECT user_id FROM "${ctx.schema}".event_members`);
    expect(bobRows).toHaveLength(1);
    expect(bobRows[0].user_id).toBe(bob);
  });

  it('user with no memberships sees no event_members rows', async () => {
    const alice = await seedUser(ctx.pool, ctx.schema, 'alice7@example.com');
    const bob = await seedUser(ctx.pool, ctx.schema, 'bob6@example.com');
    const eventId = await seedEvent(ctx.pool, ctx.schema, 'Event', alice);
    await addMember(ctx.pool, ctx.schema, eventId, alice);

    const rows = await queryAsUser(ctx.pool, ctx.schema, bob, `SELECT * FROM "${ctx.schema}".event_members`);
    expect(rows).toHaveLength(0);
  });
});

describe('RLS pilot — no context set', () => {
  it('queries without user context see no events (NULLIF returns NULL)', async () => {
    const alice = await seedUser(ctx.pool, ctx.schema, 'alice8@example.com');
    await seedEvent(ctx.pool, ctx.schema, 'Hidden Event', alice);

    const client = await ctx.pool.connect();
    try {
      await client.query(`SET search_path TO "${ctx.schema}", public`);
      const result = await client.query(`SELECT id FROM "${ctx.schema}".events`);
      expect(result.rows).toHaveLength(0);
    } finally {
      client.release();
    }
  });
});
