import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPostgresTestDatabase, type TestDatabase } from './helpers/postgres-test-db.js';

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS users (
  id            SERIAL PRIMARY KEY,
  email         TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  display_name  TEXT NOT NULL,
  email_verified INTEGER DEFAULT 0,
  role_id       INTEGER DEFAULT 1,
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
  capacity    INTEGER,
  status      TEXT DEFAULT 'Draft',
  created_by  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  deleted_at  TIMESTAMP
);
CREATE TABLE IF NOT EXISTS event_members (
  event_id    INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role        TEXT DEFAULT 'editor',
  PRIMARY KEY (event_id, user_id)
);
CREATE TABLE IF NOT EXISTS rsvps (
  id          SERIAL PRIMARY KEY,
  event_id    INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  email       TEXT NOT NULL,
  guests      INTEGER DEFAULT 1,
  status      TEXT DEFAULT 'Pending',
  notes       TEXT,
  source      TEXT DEFAULT 'public',
  checked_in  BOOLEAN DEFAULT FALSE,
  checked_in_at TIMESTAMP,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(event_id, email)
);
CREATE TABLE IF NOT EXISTS seating_tables (
  id SERIAL PRIMARY KEY,
  event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  capacity INTEGER DEFAULT 8,
  layout_x INTEGER,
  layout_y INTEGER,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS seating_assignments (
  table_id INTEGER NOT NULL REFERENCES seating_tables(id) ON DELETE CASCADE,
  rsvp_id INTEGER NOT NULL REFERENCES rsvps(id) ON DELETE CASCADE,
  PRIMARY KEY (table_id, rsvp_id)
);
`;

let testDb: TestDatabase;

vi.mock('../src/db/database.js', () => ({
  getDatabase: () => testDb,
  initializeDatabase: async () => testDb,
}));

import {
  assignGuest,
  createTable,
  listTables,
  updateTableLayout,
} from '../src/controllers/seating-controller.js';

function makeRes() {
  const res: {
    statusCode: number;
    body: unknown;
    status: (code: number) => typeof res;
    json: (data: unknown) => typeof res;
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
  };
  return res;
}

function makeReq(
  params: Record<string, string>,
  body: Record<string, unknown> = {},
  user = { id: 1, email: 'staff@test.com', role_id: 2 },
) {
  return { params, body, user } as unknown as import('express').Request;
}

async function seedUser(db: TestDatabase): Promise<number> {
  const result = await db.run(
    `INSERT INTO users (email, password_hash, display_name, email_verified, role_id)
     VALUES ('owner@test.com', 'hash', 'Owner', 1, 2) RETURNING id`,
  );
  return result.lastID as number;
}

async function seedEvent(db: TestDatabase, userId: number): Promise<number> {
  const result = await db.run(
    `INSERT INTO events (title, date, location, created_by)
     VALUES ('Fest', '2026-07-01', 'Park', ?) RETURNING id`,
    [userId],
  );
  return result.lastID as number;
}

async function seedRsvp(
  db: TestDatabase,
  eventId: number,
  email: string,
  name: string,
): Promise<number> {
  const result = await db.run(
    `INSERT INTO rsvps (event_id, name, email, guests, status)
      VALUES (?, ?, ?, ?, ?) RETURNING id
      ON CONFLICT DO NOTHING`,
    [eventId, name, email, 1, 'confirmed'],
  );
  return result.lastID as number;
}

describe('seating editor controllers — issue #457', () => {
  beforeEach(async () => {
    testDb = await createPostgresTestDatabase(SCHEMA_SQL);
  });

  afterEach(async () => {
    await testDb.close();
  });

  it('creates tables with default persisted layout coordinates', async () => {
    const userId = await seedUser(testDb);
    const eventId = await seedEvent(testDb, userId);

    const req = makeReq(
      { eventId: String(eventId) },
      { name: 'VIP Table', capacity: 6 },
      {
        id: userId,
        email: 'owner@test.com',
        role_id: 2,
      },
    );
    const res = makeRes();

    await createTable(req, res as unknown as import('express').Response);

    expect(res.statusCode).toBe(201);
    const body = res.body as { table: { layout_x: number; layout_y: number } };
    expect(body.table.layout_x).toBeGreaterThanOrEqual(0);
    expect(body.table.layout_y).toBeGreaterThanOrEqual(0);
  });

  it('persists dragged table coordinates through the layout update endpoint', async () => {
    const userId = await seedUser(testDb);
    const eventId = await seedEvent(testDb, userId);
    const table = await testDb.run(
      `INSERT INTO seating_tables (event_id, name, capacity, layout_x, layout_y)
       VALUES (?, 'VIP Table', 6, 32, 32) RETURNING id`,
      [eventId],
    );

    const req = makeReq(
      { eventId: String(eventId), tableId: String(table.lastID) },
      { layout_x: 244, layout_y: 188 },
      { id: userId, email: 'owner@test.com', role_id: 2 },
    );
    const res = makeRes();

    await updateTableLayout(req, res as unknown as import('express').Response);

    expect(res.statusCode).toBe(200);
    const row = await testDb.get<{ layout_x: number; layout_y: number }>(
      'SELECT layout_x, layout_y FROM seating_tables WHERE id = ?',
      [table.lastID],
    );
    expect(row).toEqual({ layout_x: 244, layout_y: 188 });
  });

  it('lists tables with stored coordinates and assigned guests', async () => {
    const userId = await seedUser(testDb);
    const eventId = await seedEvent(testDb, userId);
    const table = await testDb.run(
      `INSERT INTO seating_tables (event_id, name, capacity, layout_x, layout_y)
       VALUES (?, 'VIP Table', 6, 120, 80) RETURNING id`,
      [eventId],
    );
    const rsvpId = await seedRsvp(testDb, eventId, 'jane@test.com', 'Jane Doe');

    const assignReq = makeReq(
      { eventId: String(eventId), tableId: String(table.lastID), rsvpId: String(rsvpId) },
      {},
      { id: userId, email: 'owner@test.com', role_id: 2 },
    );
    await assignGuest(assignReq, makeRes() as unknown as import('express').Response);

    const req = makeReq(
      { eventId: String(eventId) },
      {},
      { id: userId, email: 'owner@test.com', role_id: 2 },
    );
    const res = makeRes();

    await listTables(req, res as unknown as import('express').Response);

    expect(res.statusCode).toBe(200);
    const body = res.body as {
      tables: Array<{ layout_x: number; layout_y: number; guests: Array<{ rsvp_id: number }> }>;
    };
    expect(body.tables[0].layout_x).toBe(120);
    expect(body.tables[0].layout_y).toBe(80);
    expect(body.tables[0].guests).toHaveLength(1);
    expect(body.tables[0].guests[0].rsvp_id).toBe(rsvpId);
  });
});
