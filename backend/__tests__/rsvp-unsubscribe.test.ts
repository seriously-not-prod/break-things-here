/**
 * setUnsubscribed controller integration tests — issue #444
 *
 * Covers:
 * - Happy path: toggle unsubscribed_at on (true) sets a non-null timestamp
 * - Happy path: toggle off (false) clears unsubscribed_at to null
 * - Idempotent: calling subscribe/unsubscribe twice is safe
 * - Access control: unauthenticated → 401
 * - Validation: missing boolean body → 400
 * - Not found: invalid RSVP or event → 404
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createPostgresTestDatabase, type TestDatabase } from './helpers/postgres-test-db.js';

// ── Schema ───────────────────────────────────────────────────────────────────
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
  id         SERIAL PRIMARY KEY,
  event_id   INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role       TEXT DEFAULT 'Helper',
  UNIQUE(event_id, user_id)
);
CREATE TABLE IF NOT EXISTS rsvps (
  id              SERIAL PRIMARY KEY,
  event_id        INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  email           TEXT NOT NULL,
  guests          INTEGER DEFAULT 1,
  status          TEXT DEFAULT 'Pending',
  notes           TEXT,
  source          TEXT DEFAULT 'public',
  checked_in      BOOLEAN DEFAULT FALSE,
  checked_in_at   TIMESTAMP,
  unsubscribed_at TIMESTAMP,
  created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(event_id, email)
);
`;

// ── Test database ─────────────────────────────────────────────────────────────
let testDb: TestDatabase;

vi.mock('../src/db/database.js', () => ({
  getDatabase: () => testDb,
  initializeDatabase: async () => testDb,
}));

import { setUnsubscribed } from '../src/controllers/rsvps-controller.js';

// ── Helpers ───────────────────────────────────────────────────────────────────
function makeRes() {
  const res: {
    statusCode: number;
    body: unknown;
    status: (code: number) => typeof res;
    json: (data: unknown) => typeof res;
  } = {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(data) { this.body = data; return this; },
  };
  return res;
}

function makeReq(
  params: Record<string, string>,
  body: Record<string, unknown> = {},
  user: { id: number; email: string; role_id: number } | null = { id: 1, email: 'owner@test.com', role_id: 2 },
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
    `INSERT INTO events (title, date, location, created_by) VALUES ('Fest', '2026-07-01', 'Park', ?) RETURNING id`,
    [userId],
  );
  return result.lastID as number;
}

async function seedRsvp(db: TestDatabase, eventId: number, unsubscribed = false): Promise<number> {
  const result = await db.run(
    `INSERT INTO rsvps (event_id, name, email, guests, status, unsubscribed_at)
     VALUES (?, 'Jane Doe', 'jane@test.com', 1, 'Going', ${unsubscribed ? 'CURRENT_TIMESTAMP' : 'NULL'}) RETURNING id`,
    [eventId],
  );
  return result.lastID as number;
}

// ── Tests ─────────────────────────────────────────────────────────────────────
describe('setUnsubscribed — issue #444', () => {
  beforeEach(async () => {
    testDb = await createPostgresTestDatabase(SCHEMA_SQL);
  });

  afterEach(async () => {
    await testDb.close();
  });

  it('sets unsubscribed_at when unsubscribed=true (subscribe off)', async () => {
    const userId = await seedUser(testDb);
    const eventId = await seedEvent(testDb, userId);
    const rsvpId = await seedRsvp(testDb, eventId, false);

    const req = makeReq({ eventId: String(eventId), id: String(rsvpId) }, { unsubscribed: true });
    const res = makeRes();

    await setUnsubscribed(req, res as unknown as import('express').Response);

    expect(res.statusCode).toBe(200);
    const body = res.body as { rsvp: Record<string, unknown> };
    expect(body.rsvp.unsubscribed_at).not.toBeNull();

    const row = await testDb.get<{ unsubscribed_at: string | null }>(
      'SELECT unsubscribed_at FROM rsvps WHERE id = ?',
      [rsvpId],
    );
    expect(row?.unsubscribed_at).not.toBeNull();
  });

  it('clears unsubscribed_at when unsubscribed=false (re-subscribe)', async () => {
    const userId = await seedUser(testDb);
    const eventId = await seedEvent(testDb, userId);
    const rsvpId = await seedRsvp(testDb, eventId, true);

    const req = makeReq({ eventId: String(eventId), id: String(rsvpId) }, { unsubscribed: false });
    const res = makeRes();

    await setUnsubscribed(req, res as unknown as import('express').Response);

    expect(res.statusCode).toBe(200);
    const body = res.body as { rsvp: Record<string, unknown> };
    expect(body.rsvp.unsubscribed_at).toBeNull();

    const row = await testDb.get<{ unsubscribed_at: string | null }>(
      'SELECT unsubscribed_at FROM rsvps WHERE id = ?',
      [rsvpId],
    );
    expect(row?.unsubscribed_at).toBeNull();
  });

  it('is idempotent: unsubscribing twice leaves unsubscribed_at set', async () => {
    const userId = await seedUser(testDb);
    const eventId = await seedEvent(testDb, userId);
    const rsvpId = await seedRsvp(testDb, eventId, false);

    for (let i = 0; i < 2; i++) {
      const req = makeReq({ eventId: String(eventId), id: String(rsvpId) }, { unsubscribed: true });
      const res = makeRes();
      await setUnsubscribed(req, res as unknown as import('express').Response);
      expect(res.statusCode).toBe(200);
    }

    const row = await testDb.get<{ unsubscribed_at: string | null }>(
      'SELECT unsubscribed_at FROM rsvps WHERE id = ?',
      [rsvpId],
    );
    expect(row?.unsubscribed_at).not.toBeNull();
  });

  it('returns 401 when unauthenticated', async () => {
    const req = makeReq({ eventId: '1', id: '1' }, { unsubscribed: true }, null);
    const res = makeRes();

    await setUnsubscribed(req, res as unknown as import('express').Response);

    expect(res.statusCode).toBe(401);
  });

  it('returns 400 when body does not include a boolean unsubscribed field', async () => {
    const userId = await seedUser(testDb);
    const eventId = await seedEvent(testDb, userId);
    const rsvpId = await seedRsvp(testDb, eventId);

    const req = makeReq({ eventId: String(eventId), id: String(rsvpId) }, { unsubscribed: 'yes' });
    const res = makeRes();

    await setUnsubscribed(req, res as unknown as import('express').Response);

    expect(res.statusCode).toBe(400);
    const body = res.body as { error: string };
    expect(body.error).toMatch(/boolean/i);
  });

  it('returns 404 when the RSVP does not exist', async () => {
    const userId = await seedUser(testDb);
    const eventId = await seedEvent(testDb, userId);

    const req = makeReq({ eventId: String(eventId), id: '9999' }, { unsubscribed: true });
    const res = makeRes();

    await setUnsubscribed(req, res as unknown as import('express').Response);

    expect(res.statusCode).toBe(404);
  });
});
