/**
 * Activity feed authorization — integration tests (#423)
 *
 * Verifies the feed endpoint enforces the shared event-access helper:
 * - 401 when unauthenticated
 * - 200 for the event owner
 * - 200 for an event member
 * - 200 for an admin (role_id >= 3)
 * - 403 for an authenticated user with no relationship to the event
 * - 404 when the event does not exist
 * - 404 when the event is soft-deleted
 *
 * Controllers are exercised directly with mock req/res objects so the
 * test suite stays close to the existing patterns (e.g. checkin.test.ts).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Request, Response } from 'express';
import { createPostgresTestDatabase, type TestDatabase } from './helpers/postgres-test-db.js';

// ── Schema ───────────────────────────────────────────────────────────────────
const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS users (
  id             SERIAL PRIMARY KEY,
  email          TEXT UNIQUE NOT NULL,
  password_hash  TEXT NOT NULL DEFAULT 'x',
  display_name   TEXT NOT NULL DEFAULT '',
  email_verified INTEGER DEFAULT 1,
  role_id        INTEGER DEFAULT 1,
  created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  deleted_at     TIMESTAMP
);
CREATE TABLE IF NOT EXISTS events (
  id          SERIAL PRIMARY KEY,
  title       TEXT NOT NULL,
  date        TEXT NOT NULL DEFAULT '',
  location    TEXT NOT NULL DEFAULT '',
  created_by  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  deleted_at  TIMESTAMP
);
CREATE TABLE IF NOT EXISTS event_members (
  event_id  INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role      TEXT DEFAULT 'Member',
  PRIMARY KEY (event_id, user_id)
);
CREATE TABLE IF NOT EXISTS activity_feed (
  id           SERIAL PRIMARY KEY,
  event_id     INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id      INTEGER REFERENCES users(id) ON DELETE SET NULL,
  action_type  TEXT NOT NULL,
  description  TEXT NOT NULL,
  link         TEXT,
  created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
`;

// ── Test database wiring (must be set before controller import) ─────────────
let testDb: TestDatabase;

vi.mock('../src/db/database.js', () => ({
  getDatabase: () => testDb,
  initializeDatabase: async () => testDb,
}));

import { listFeed, logActivity } from '../src/controllers/activity-feed-controller.js';

// ── Mock helpers ────────────────────────────────────────────────────────────
interface MockResponse {
  statusCode: number;
  body: unknown;
  status: (code: number) => MockResponse;
  json: (data: unknown) => MockResponse;
}

function makeRes(): MockResponse {
  const res: MockResponse = {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(data) { this.body = data; return this; },
  };
  return res;
}

function makeReq(
  params: Record<string, string>,
  user?: { id: number; email: string; role_id: number },
): Request {
  return { params, body: {}, query: {}, user } as unknown as Request;
}

// ── Seed helpers ────────────────────────────────────────────────────────────
async function seedUser(
  email: string,
  roleId = 1,
): Promise<number> {
  const result = await testDb.run(
    `INSERT INTO users (email, display_name, role_id) VALUES (?, ?, ?) RETURNING id`,
    [email, email.split('@')[0], roleId],
  );
  return result.lastID as number;
}

async function seedEvent(ownerId: number, opts: { deleted?: boolean } = {}): Promise<number> {
  const result = await testDb.run(
    `INSERT INTO events (title, date, location, created_by, deleted_at)
     VALUES ('Test Event', '2026-07-01', 'Park', ?, ${opts.deleted ? 'CURRENT_TIMESTAMP' : 'NULL'})
     RETURNING id`,
    [ownerId],
  );
  return result.lastID as number;
}

async function addMember(eventId: number, userId: number): Promise<void> {
  await testDb.run(
    `INSERT INTO event_members (event_id, user_id) VALUES (?, ?)`,
    [eventId, userId],
  );
}

// ── Tests ───────────────────────────────────────────────────────────────────
describe('GET /api/events/:eventId/feed — authorization (#422 #423)', () => {
  beforeEach(async () => {
    testDb = await createPostgresTestDatabase(SCHEMA_SQL);
  });

  afterEach(async () => {
    await testDb.close();
  });

  it('returns 401 when the request is unauthenticated', async () => {
    const ownerId = await seedUser('owner@test.com', 2);
    const eventId = await seedEvent(ownerId);

    const req = makeReq({ eventId: String(eventId) }); // no user
    const res = makeRes();

    await listFeed(req, res as unknown as Response);

    expect(res.statusCode).toBe(401);
    expect((res.body as { error: string }).error).toMatch(/auth/i);
  });

  it('returns 200 with the feed for the event owner', async () => {
    const ownerId = await seedUser('owner@test.com', 2);
    const eventId = await seedEvent(ownerId);
    await logActivity(eventId, ownerId, 'event.created', 'Owner created the event');

    const req = makeReq(
      { eventId: String(eventId) },
      { id: ownerId, email: 'owner@test.com', role_id: 2 },
    );
    const res = makeRes();

    await listFeed(req, res as unknown as Response);

    expect(res.statusCode).toBe(200);
    const body = res.body as { feed: Array<{ description: string; actor_name: string }> };
    expect(body.feed).toHaveLength(1);
    expect(body.feed[0].description).toBe('Owner created the event');
  });

  it('returns 200 for an event member', async () => {
    const ownerId = await seedUser('owner@test.com', 2);
    const memberId = await seedUser('member@test.com', 1);
    const eventId = await seedEvent(ownerId);
    await addMember(eventId, memberId);
    await logActivity(eventId, ownerId, 'task.created', 'Owner added a task');

    const req = makeReq(
      { eventId: String(eventId) },
      { id: memberId, email: 'member@test.com', role_id: 1 },
    );
    const res = makeRes();

    await listFeed(req, res as unknown as Response);

    expect(res.statusCode).toBe(200);
    const body = res.body as { feed: unknown[] };
    expect(body.feed).toHaveLength(1);
  });

  it('returns 200 for a platform admin even without explicit membership', async () => {
    const ownerId = await seedUser('owner@test.com', 2);
    const adminId = await seedUser('admin@test.com', 3);
    const eventId = await seedEvent(ownerId);
    await logActivity(eventId, ownerId, 'event.updated', 'Owner edited the event');

    const req = makeReq(
      { eventId: String(eventId) },
      { id: adminId, email: 'admin@test.com', role_id: 3 },
    );
    const res = makeRes();

    await listFeed(req, res as unknown as Response);

    expect(res.statusCode).toBe(200);
  });

  it('returns 403 for an authenticated user who is neither owner, member, nor admin', async () => {
    const ownerId = await seedUser('owner@test.com', 2);
    const outsiderId = await seedUser('outsider@test.com', 1);
    const eventId = await seedEvent(ownerId);
    await logActivity(eventId, ownerId, 'rsvp.created', 'Sensitive feed entry');

    const req = makeReq(
      { eventId: String(eventId) },
      { id: outsiderId, email: 'outsider@test.com', role_id: 1 },
    );
    const res = makeRes();

    await listFeed(req, res as unknown as Response);

    expect(res.statusCode).toBe(403);
    expect((res.body as { error: string }).error).toMatch(/not authorised/i);
    // Body must not leak feed contents
    expect(res.body).not.toHaveProperty('feed');
  });

  it('returns 404 when the event does not exist', async () => {
    const ownerId = await seedUser('owner@test.com', 2);

    const req = makeReq(
      { eventId: '999999' },
      { id: ownerId, email: 'owner@test.com', role_id: 2 },
    );
    const res = makeRes();

    await listFeed(req, res as unknown as Response);

    expect(res.statusCode).toBe(404);
  });

  it('returns 404 when the event is soft-deleted (and does not leak feed)', async () => {
    const ownerId = await seedUser('owner@test.com', 2);
    const eventId = await seedEvent(ownerId, { deleted: true });

    const req = makeReq(
      { eventId: String(eventId) },
      { id: ownerId, email: 'owner@test.com', role_id: 2 },
    );
    const res = makeRes();

    await listFeed(req, res as unknown as Response);

    expect(res.statusCode).toBe(404);
    expect(res.body).not.toHaveProperty('feed');
  });
});
