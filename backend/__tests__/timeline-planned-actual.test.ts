/**
 * Planned-vs-actual timeline workflow — issue #460
 *
 * Covers:
 * - Creating an activity with planned/actual times and status
 * - Updating planned/actual times separately from display times
 * - The /comparison endpoint returns variance calculations
 * - Status field is validated (reject invalid values)
 * - Existing CRUD (list, create, update, delete) still works
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createPostgresTestDatabase, type TestDatabase } from './helpers/postgres-test-db.js';

// ── Minimal schema ────────────────────────────────────────────────────────────
const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS users (
  id            SERIAL PRIMARY KEY,
  email         TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  display_name  TEXT NOT NULL,
  email_verified INTEGER DEFAULT 0,
  role_id       INTEGER DEFAULT 2,
  account_locked INTEGER DEFAULT 0,
  login_attempts INTEGER DEFAULT 0,
  created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  deleted_at    TIMESTAMP
);
CREATE TABLE IF NOT EXISTS events (
  id          SERIAL PRIMARY KEY,
  title       TEXT NOT NULL,
  date        TEXT NOT NULL DEFAULT '',
  location    TEXT NOT NULL DEFAULT '',
  status      TEXT DEFAULT 'Draft',
  is_public   BOOLEAN DEFAULT FALSE,
  created_by  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  deleted_at  TIMESTAMP
);
CREATE TABLE IF NOT EXISTS event_members (
  event_id  INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role      TEXT NOT NULL DEFAULT 'member',
  PRIMARY KEY (event_id, user_id)
);
CREATE TABLE IF NOT EXISTS vendors (
  id       SERIAL PRIMARY KEY,
  event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  name     TEXT NOT NULL
);
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
`;

// ── Test database instance ────────────────────────────────────────────────────
let testDb: TestDatabase;

vi.mock('../src/db/database.js', () => ({
  getDatabase: () => testDb,
  initializeDatabase: async () => testDb,
}));

// Import controllers AFTER mock is set up
import {
  createActivity,
  deleteActivity,
  getTimelineComparison,
  listActivities,
  updateActivity,
} from '../src/controllers/timeline-controller.js';

// ── Response/Request helpers ──────────────────────────────────────────────────
function makeRes() {
  const res: {
    statusCode: number;
    body: unknown;
    status: (code: number) => typeof res;
    json: (data: unknown) => typeof res;
    send: (data: unknown) => typeof res;
  } = {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(data) {
      this.body = data;
      return this;
    },
    send(data) {
      this.body = data;
      return this;
    },
  };
  return res;
}

function makeReq(
  params: Record<string, string>,
  body: Record<string, unknown> = {},
  user = { id: 1, email: 'owner@test.com', role_id: 2 },
) {
  return { params, body, user } as unknown as import('express').Request;
}

// ── Seed helpers ──────────────────────────────────────────────────────────────
async function seedUser(db: TestDatabase): Promise<number> {
  const r = await db.run(
    `INSERT INTO users (email, password_hash, display_name) VALUES ('owner@test.com', 'hash', 'Owner') RETURNING id`,
  );
  return r.lastID as number;
}

async function seedEvent(db: TestDatabase, userId: number): Promise<number> {
  const r = await db.run(
    `INSERT INTO events (title, date, location, created_by) VALUES ('Festival', '2026-08-01', 'Park', ?) RETURNING id`,
    [userId],
  );
  return r.lastID as number;
}

// ── Tests ─────────────────────────────────────────────────────────────────────
describe('Timeline planned-vs-actual workflow — #460', () => {
  let userId: number;
  let eventId: number;

  beforeEach(async () => {
    testDb = await createPostgresTestDatabase(SCHEMA_SQL);
    userId = await seedUser(testDb);
    eventId = await seedEvent(testDb, userId);
  });

  afterEach(async () => {
    await testDb.close();
  });

  // ── Existing CRUD remains functional ──────────────────────────────────────

  it('lists activities for an event (existing behaviour)', async () => {
    await testDb.run(
      `INSERT INTO timeline_activities (event_id, title, sort_order, created_by)
       VALUES (?, 'Sound Check', 0, ?) RETURNING id`,
      [eventId, userId],
    );

    const req = makeReq({ eventId: String(eventId) });
    const res = makeRes();
    await listActivities(req, res as unknown as import('express').Response);

    expect(res.statusCode).toBe(200);
    const body = res.body as { activities: unknown[] };
    expect(body.activities).toHaveLength(1);
  });

  it('creates an activity with no optional fields (backward compatibility)', async () => {
    const req = makeReq({ eventId: String(eventId) }, { title: 'Welcome' });
    const res = makeRes();
    await createActivity(req, res as unknown as import('express').Response);

    expect(res.statusCode).toBe(201);
    const body = res.body as { activity: Record<string, unknown> };
    expect(body.activity.title).toBe('Welcome');
    expect(body.activity.status).toBe('planned');
  });

  it('returns 400 when title is missing', async () => {
    const req = makeReq({ eventId: String(eventId) }, { title: '' });
    const res = makeRes();
    await createActivity(req, res as unknown as import('express').Response);

    expect(res.statusCode).toBe(400);
  });

  it('deletes an activity', async () => {
    const r = await testDb.run(
      `INSERT INTO timeline_activities (event_id, title, sort_order, created_by)
       VALUES (?, 'Teardown', 0, ?) RETURNING id`,
      [eventId, userId],
    );
    const actId = r.lastID as number;

    const req = makeReq({ eventId: String(eventId), id: String(actId) });
    const res = makeRes();
    await deleteActivity(req, res as unknown as import('express').Response);

    expect(res.statusCode).toBe(204);
    const row = await testDb.get('SELECT id FROM timeline_activities WHERE id = ?', [actId]);
    expect(row).toBeUndefined();
  });

  // ── Planned/actual time capture ────────────────────────────────────────────

  it('creates an activity with planned and actual times', async () => {
    const req = makeReq(
      { eventId: String(eventId) },
      {
        title: 'Doors Open',
        planned_start_time: '2026-08-01T18:00:00Z',
        planned_end_time: '2026-08-01T18:30:00Z',
        actual_start_time: '2026-08-01T18:05:00Z',
        actual_end_time: '2026-08-01T18:35:00Z',
        status: 'completed',
      },
    );
    const res = makeRes();
    await createActivity(req, res as unknown as import('express').Response);

    expect(res.statusCode).toBe(201);
    const body = res.body as { activity: Record<string, unknown> };
    expect(body.activity.planned_start_time).not.toBeNull();
    expect(body.activity.actual_start_time).not.toBeNull();
    expect(body.activity.status).toBe('completed');
  });

  it('updates planned and actual times independently', async () => {
    const r = await testDb.run(
      `INSERT INTO timeline_activities (event_id, title, sort_order, created_by, status)
       VALUES (?, 'Lighting Rig', 0, ?, 'planned') RETURNING id`,
      [eventId, userId],
    );
    const actId = r.lastID as number;

    const req = makeReq(
      { eventId: String(eventId), id: String(actId) },
      {
        planned_start_time: '2026-08-01T14:00:00Z',
        planned_end_time: '2026-08-01T16:00:00Z',
        status: 'in-progress',
      },
    );
    const res = makeRes();
    await updateActivity(req, res as unknown as import('express').Response);

    expect(res.statusCode).toBe(200);
    const body = res.body as { activity: Record<string, unknown> };
    expect(body.activity.status).toBe('in-progress');
    expect(body.activity.planned_start_time).not.toBeNull();
  });

  it('defaults unknown status values to existing status on update', async () => {
    const r = await testDb.run(
      `INSERT INTO timeline_activities (event_id, title, sort_order, created_by, status)
       VALUES (?, 'Band Setup', 0, ?, 'planned') RETURNING id`,
      [eventId, userId],
    );
    const actId = r.lastID as number;

    const req = makeReq(
      { eventId: String(eventId), id: String(actId) },
      {
        status: 'invalid-value',
      },
    );
    const res = makeRes();
    await updateActivity(req, res as unknown as import('express').Response);

    // Status should fall back to existing value ('planned')
    const body = res.body as { activity: Record<string, unknown> };
    expect(body.activity.status).toBe('planned');
  });

  // ── Comparison endpoint ───────────────────────────────────────────────────

  it('comparison endpoint returns planned and actual data with variance', async () => {
    // planned: 18:00–18:30, actual: 18:05–18:35 → start variance +5m
    await testDb.run(
      `INSERT INTO timeline_activities
       (event_id, title, sort_order, created_by, status,
        planned_start_time, planned_end_time,
        actual_start_time, actual_end_time)
       VALUES (?, 'Show Open', 0, ?, 'completed',
        '2026-08-01T18:00:00Z', '2026-08-01T18:30:00Z',
        '2026-08-01T18:05:00Z', '2026-08-01T18:35:00Z')
       RETURNING id`,
      [eventId, userId],
    );

    const req = makeReq({ eventId: String(eventId) });
    const res = makeRes();
    await getTimelineComparison(req, res as unknown as import('express').Response);

    expect(res.statusCode).toBe(200);
    const body = res.body as {
      comparison: Array<{
        title: string;
        status: string;
        start_variance_minutes: number | null;
        end_variance_minutes: number | null;
        planned_duration_minutes: number | null;
        actual_duration_minutes: number | null;
      }>;
      summary: {
        total: number;
        completed: number;
        planned: number;
        in_progress: number;
        skipped: number;
      };
    };

    expect(body.comparison).toHaveLength(1);
    const item = body.comparison[0];
    expect(item.title).toBe('Show Open');
    expect(item.status).toBe('completed');
    expect(item.start_variance_minutes).toBe(5);
    expect(item.end_variance_minutes).toBe(5);
    expect(item.planned_duration_minutes).toBe(30);
    expect(item.actual_duration_minutes).toBe(30);

    expect(body.summary.total).toBe(1);
    expect(body.summary.completed).toBe(1);
    expect(body.summary.planned).toBe(0);
  });

  it('comparison returns null variance when actual times are not set', async () => {
    await testDb.run(
      `INSERT INTO timeline_activities
       (event_id, title, sort_order, created_by, status,
        planned_start_time, planned_end_time)
       VALUES (?, 'Sound Check', 0, ?, 'planned',
        '2026-08-01T16:00:00Z', '2026-08-01T17:00:00Z')
       RETURNING id`,
      [eventId, userId],
    );

    const req = makeReq({ eventId: String(eventId) });
    const res = makeRes();
    await getTimelineComparison(req, res as unknown as import('express').Response);

    const body = res.body as {
      comparison: Array<{ start_variance_minutes: number | null }>;
    };
    expect(body.comparison[0].start_variance_minutes).toBeNull();
  });

  it('comparison summary correctly counts statuses', async () => {
    const statuses = ['planned', 'in-progress', 'completed', 'skipped'];
    for (const [i, s] of statuses.entries()) {
      await testDb.run(
        `INSERT INTO timeline_activities (event_id, title, sort_order, created_by, status)
         VALUES (?, ?, ?, ?, ?) RETURNING id`,
        [eventId, `Activity ${i}`, i, userId, s],
      );
    }

    const req = makeReq({ eventId: String(eventId) });
    const res = makeRes();
    await getTimelineComparison(req, res as unknown as import('express').Response);

    const body = res.body as {
      summary: {
        total: number;
        planned: number;
        in_progress: number;
        completed: number;
        skipped: number;
      };
    };
    expect(body.summary.total).toBe(4);
    expect(body.summary.planned).toBe(1);
    expect(body.summary.in_progress).toBe(1);
    expect(body.summary.completed).toBe(1);
    expect(body.summary.skipped).toBe(1);
  });
});
