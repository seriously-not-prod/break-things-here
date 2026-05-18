/**
 * Check-in controller integration tests — issue #387
 *
 * Covers:
 * - Happy path: unverified guest gets checked in (200 + checked_in=true)
 * - Idempotent re-check-in: calling the endpoint twice returns 200 with no DB write
 * - Not-found: returns 404 when RSVP or event doesn't exist
 *
 * Controllers are called directly with lightweight mock req/res objects so
 * these tests run without a real HTTP server.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createPostgresTestDatabase, type TestDatabase } from './helpers/postgres-test-db.js';

// ── Schema ──────────────────────────────────────────────────────────────────
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
  canonical_status TEXT,
  late_arrival BOOLEAN DEFAULT FALSE,
  arrival_delay_minutes INTEGER,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(event_id, email)
);
CREATE TABLE IF NOT EXISTS attendance_events (
  id          SERIAL PRIMARY KEY,
  event_id    INTEGER NOT NULL,
  rsvp_id     INTEGER NOT NULL,
  action      TEXT NOT NULL,
  source      TEXT NOT NULL DEFAULT 'manual',
  occurred_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  actor_id    INTEGER,
  metadata    JSONB
);
`;

// ── Test database ────────────────────────────────────────────────────────────
let testDb: TestDatabase;

vi.mock('../src/db/database.js', () => ({
  getDatabase: () => testDb,
  initializeDatabase: async () => testDb,
}));

// Import controllers AFTER mock is set up
import { checkInGuest } from '../src/controllers/rsvps-controller.js';

// ── Helpers ──────────────────────────────────────────────────────────────────
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

function makeReq(params: Record<string, string>, user = { id: 1, email: 'staff@test.com', role_id: 2 }) {
  return { params, body: {}, user } as unknown as import('express').Request;
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

async function seedRsvp(db: TestDatabase, eventId: number, checkedIn = false): Promise<number> {
  const result = await db.run(
    `INSERT INTO rsvps (event_id, name, email, guests, status, checked_in)
     VALUES (?, 'Jane Doe', 'jane@test.com', 1, 'Going', ?) RETURNING id`,
    [eventId, checkedIn],
  );
  return result.lastID as number;
}

// ── Tests ─────────────────────────────────────────────────────────────────────
describe('checkInGuest — issue #387', () => {
  beforeEach(async () => {
    testDb = await createPostgresTestDatabase(SCHEMA_SQL);
  });

  afterEach(async () => {
    await testDb.close();
  });

  it('marks a guest as checked in and returns the updated RSVP (happy path)', async () => {
    const userId = await seedUser(testDb);
    const eventId = await seedEvent(testDb, userId);
    const rsvpId = await seedRsvp(testDb, eventId, false);

    const req = makeReq({ eventId: String(eventId), id: String(rsvpId) });
    const res = makeRes();

    await checkInGuest(req, res as unknown as import('express').Response);

    expect(res.statusCode).toBe(200);
    const body = res.body as { rsvp: Record<string, unknown> };
    expect(body.rsvp.checked_in).toBe(true);
    expect(body.rsvp.checked_in_at).not.toBeNull();

    // Verify persisted in DB
    const row = await testDb.get<{ checked_in: boolean }>(
      'SELECT checked_in FROM rsvps WHERE id = ?',
      [rsvpId],
    );
    expect(row?.checked_in).toBe(true);
  });

  it('is idempotent: re-checking an already-checked-in guest returns 200 without writing again', async () => {
    const userId = await seedUser(testDb);
    const eventId = await seedEvent(testDb, userId);
    const rsvpId = await seedRsvp(testDb, eventId, true);

    // Record the initial checked_in_at
    const before = await testDb.get<{ checked_in_at: string }>(
      'SELECT checked_in_at FROM rsvps WHERE id = ?',
      [rsvpId],
    );

    const req = makeReq({ eventId: String(eventId), id: String(rsvpId) });
    const res1 = makeRes();
    await checkInGuest(req, res1 as unknown as import('express').Response);

    expect(res1.statusCode).toBe(200);
    const body = res1.body as { rsvp: Record<string, unknown> };
    expect(body.rsvp.checked_in).toBe(true);

    // checked_in_at must not have changed (no UPDATE executed)
    const after = await testDb.get<{ checked_in_at: string }>(
      'SELECT checked_in_at FROM rsvps WHERE id = ?',
      [rsvpId],
    );
    expect(after?.checked_in_at).toEqual(before?.checked_in_at);
  });

  it('returns 404 when the RSVP does not exist', async () => {
    const userId = await seedUser(testDb);
    const eventId = await seedEvent(testDb, userId);

    const req = makeReq({ eventId: String(eventId), id: '99999' });
    const res = makeRes();
    await checkInGuest(req, res as unknown as import('express').Response);

    expect(res.statusCode).toBe(404);
    const body = res.body as { error: string };
    expect(body.error).toContain('not found');
  });

  it('returns 404 when the RSVP belongs to a different event', async () => {
    const userId = await seedUser(testDb);
    const eventId = await seedEvent(testDb, userId);
    const otherEventId = await seedEvent(testDb, userId);
    const rsvpId = await seedRsvp(testDb, otherEventId, false);

    const req = makeReq({ eventId: String(eventId), id: String(rsvpId) });
    const res = makeRes();
    await checkInGuest(req, res as unknown as import('express').Response);

    expect(res.statusCode).toBe(404);
  });
});
