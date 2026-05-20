/**
 * Integration tests for Task #771 guests first-class table/controller.
 */
import type { Request, Response } from 'express';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeDatabase, getDatabase, initializeDatabase } from '../src/db/database.js';
import {
  createGuest,
  deleteGuest,
  getGuest,
  listGuests,
  updateGuest,
} from '../src/controllers/guests-controller.js';
import { resolveTestDatabaseUrl } from '../test-database-url.js';

const originalDatabaseUrl = process.env.DATABASE_URL;
const defaultDatabaseUrl = resolveTestDatabaseUrl();

if (!originalDatabaseUrl) {
  process.env.DATABASE_URL = defaultDatabaseUrl;
}

interface MockResponse {
  statusCode: number;
  body: unknown;
  headersSent: boolean;
  status(code: number): MockResponse;
  json(data: unknown): MockResponse;
  send(data?: unknown): MockResponse;
}

function makeRes(): MockResponse {
  const res: MockResponse = {
    statusCode: 200,
    body: null,
    headersSent: false,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(data: unknown) {
      this.body = data;
      this.headersSent = true;
      return this;
    },
    send(data?: unknown) {
      this.body = data ?? null;
      this.headersSent = true;
      return this;
    },
  };
  return res;
}

function makeReq(
  overrides: Partial<Request> & { user?: { id: number; email: string; role_id: number } },
): Request {
  return {
    params: {},
    body: {},
    headers: {},
    ...overrides,
  } as unknown as Request;
}

let ownerId = 0;
let eventId = 0;
let otherEventId = 0;

beforeAll(async (): Promise<void> => {
  await initializeDatabase();
  const db = getDatabase();

  const seedKey = `guests-771-${Date.now()}`;

  const userResult = await db.run(
    `INSERT INTO users (email, password_hash, display_name, role_id)
     VALUES (?, ?, ?, ?) RETURNING id`,
    [`${seedKey}@example.com`, 'hashed-password', 'Guest Owner', 2],
  );
  ownerId = Number(userResult.lastID);

  const eventResult = await db.run(
    `INSERT INTO events (title, date, location, status, created_by)
     VALUES (?, ?, ?, ?, ?) RETURNING id`,
    ['Guest Records Event', '2030-10-01', 'Main Hall', 'Active', ownerId],
  );
  eventId = Number(eventResult.lastID);

  const otherEventResult = await db.run(
    `INSERT INTO events (title, date, location, status, created_by)
     VALUES (?, ?, ?, ?, ?) RETURNING id`,
    ['Other Event', '2030-11-01', 'Room B', 'Active', ownerId],
  );
  otherEventId = Number(otherEventResult.lastID);
});

afterAll(async (): Promise<void> => {
  const db = getDatabase();
  await db.run(`DELETE FROM events WHERE id IN (?, ?)`, [eventId, otherEventId]);
  await db.run(`DELETE FROM users WHERE id = ?`, [ownerId]);
  await closeDatabase();
  if (originalDatabaseUrl === undefined) {
    delete process.env.DATABASE_URL;
  } else {
    process.env.DATABASE_URL = originalDatabaseUrl;
  }
});

describe('v24 migration - schema', () => {
  it('creates the guests table', async () => {
    const db = getDatabase();
    const row = await db.get<{ exists: boolean }>(
      `SELECT EXISTS (
         SELECT 1 FROM information_schema.tables
         WHERE table_schema = 'public' AND table_name = 'guests'
       ) AS exists`,
    );
    expect(row?.exists).toBe(true);
  });

  it('adds guest_id column to rsvps', async () => {
    const db = getDatabase();
    const col = await db.get<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'rsvps' AND column_name = 'guest_id'`,
    );
    expect(col?.column_name).toBe('guest_id');
  });
});

describe('createGuest', () => {
  it('creates a guest and returns 201', async () => {
    const req = makeReq({
      params: { eventId: String(eventId) },
      body: {
        name: 'Alice Smith',
        email: 'alice@example.com',
        phone: '555-1234',
        dietary_restriction: 'Vegan',
      },
      user: { id: ownerId, email: 'owner@example.com', role_id: 2 },
    });
    const res = makeRes();

    await createGuest(req as Request, res as unknown as Response, () => {});
    expect(res.statusCode).toBe(201);
    const body = res.body as Record<string, unknown>;
    expect(body.name).toBe('Alice Smith');
    expect(body.email).toBe('alice@example.com');
    expect(body.event_id).toBe(eventId);
  });

  it('returns 409 when duplicate email exists for the same event', async () => {
    const req = makeReq({
      params: { eventId: String(eventId) },
      body: { name: 'Dup Guest', email: 'ALICE@EXAMPLE.COM' },
      user: { id: ownerId, email: 'owner@example.com', role_id: 2 },
    });
    const res = makeRes();

    await createGuest(req as Request, res as unknown as Response, () => {});
    expect(res.statusCode).toBe(409);
  });
});

describe('listGuests', () => {
  it('returns guests array scoped to event', async () => {
    const db = getDatabase();
    await db.run(`INSERT INTO guests (event_id, name, email) VALUES (?, ?, ?)`, [
      otherEventId,
      'Other Event Guest',
      'other-event@example.com',
    ]);

    const req = makeReq({
      params: { eventId: String(eventId) },
      user: { id: ownerId, email: 'owner@example.com', role_id: 2 },
    });
    const res = makeRes();

    await listGuests(req as Request, res as unknown as Response, () => {});
    expect(res.statusCode).toBe(200);
    const body = res.body as Array<{ event_id: number }>;
    expect(Array.isArray(body)).toBe(true);
    expect(body.every((g) => g.event_id === eventId)).toBe(true);

    await db.run(`DELETE FROM guests WHERE email = 'other-event@example.com' AND event_id = ?`, [
      otherEventId,
    ]);
  });
});

describe('getGuest and updateGuest', () => {
  it('gets and updates an existing guest', async () => {
    const db = getDatabase();
    const result = await db.run(
      `INSERT INTO guests (event_id, name, email) VALUES (?, ?, ?) RETURNING id`,
      [eventId, 'Update Before', 'update-before@example.com'],
    );
    const guestId = Number(result.lastID);

    const getReq = makeReq({
      params: { eventId: String(eventId), id: String(guestId) },
      user: { id: ownerId, email: 'owner@example.com', role_id: 2 },
    });
    const getRes = makeRes();

    await getGuest(getReq as Request, getRes as unknown as Response, () => {});
    expect(getRes.statusCode).toBe(200);

    const updateReq = makeReq({
      params: { eventId: String(eventId), id: String(guestId) },
      body: {
        name: 'Update After',
        email: 'update-after@example.com',
        dietary_restriction: 'Gluten Free',
      },
      user: { id: ownerId, email: 'owner@example.com', role_id: 2 },
    });
    const updateRes = makeRes();

    await updateGuest(updateReq as Request, updateRes as unknown as Response, () => {});
    expect(updateRes.statusCode).toBe(200);
    const body = updateRes.body as Record<string, unknown>;
    expect(body.name).toBe('Update After');

    await db.run(`DELETE FROM guests WHERE id = ?`, [guestId]);
  });
});

describe('deleteGuest', () => {
  it('deletes guest and keeps RSVP row (guest_id -> null)', async () => {
    const db = getDatabase();

    const guestResult = await db.run(
      `INSERT INTO guests (event_id, name, email) VALUES (?, ?, ?) RETURNING id`,
      [eventId, 'Delete Me', 'delete-me@example.com'],
    );
    const guestId = Number(guestResult.lastID);

    const rsvpResult = await db.run(
      `INSERT INTO rsvps (event_id, name, email, guests, canonical_status, guest_id)
       VALUES (?, ?, ?, ?, ?, ?) RETURNING id`,
      [eventId, 'Delete Me', 'delete-me@example.com', 1, 'pending', guestId],
    );
    const rsvpId = Number(rsvpResult.lastID);

    const req = makeReq({
      params: { eventId: String(eventId), id: String(guestId) },
      user: { id: ownerId, email: 'owner@example.com', role_id: 2 },
    });
    const res = makeRes();

    await deleteGuest(req as Request, res as unknown as Response, () => {});
    expect(res.statusCode).toBe(204);

    const rRow = await db.get<{ guest_id: number | null }>(
      `SELECT guest_id FROM rsvps WHERE id = ?`,
      [rsvpId],
    );
    expect(rRow?.guest_id).toBeNull();

    await db.run(`DELETE FROM rsvps WHERE id = ?`, [rsvpId]);
  });
});
