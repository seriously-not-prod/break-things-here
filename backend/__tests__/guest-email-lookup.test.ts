import type { Request, Response } from 'express';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeDatabase, getDatabase, initializeDatabase } from '../src/db/database.js';
import { lookupRsvpsByEmail } from '../src/controllers/guest-merge-controller.js';
import { resolveTestDatabaseUrl } from '../test-database-url.js';

const originalDatabaseUrl = process.env.DATABASE_URL;
const defaultDatabaseUrl = resolveTestDatabaseUrl();

if (!originalDatabaseUrl) {
  process.env.DATABASE_URL = defaultDatabaseUrl;
}

interface MockResponse {
  statusCode: number;
  body: unknown;
  status(code: number): MockResponse;
  json(data: unknown): MockResponse;
}

function makeResponse(): MockResponse {
  return {
    statusCode: 200,
    body: null,
    status(code: number): MockResponse {
      this.statusCode = code;
      return this;
    },
    json(data: unknown): MockResponse {
      this.body = data;
      return this;
    },
  };
}

let ownerId = 0;
let eventId = 0;

beforeAll(async (): Promise<void> => {
  await initializeDatabase();
  const db = getDatabase();

  const seedKey = `guest-lookup-${Date.now()}`;
  const userResult = await db.run(
    `INSERT INTO users (email, password_hash, display_name, role_id)
     VALUES (?, ?, ?, ?) RETURNING id`,
    [`${seedKey}@example.com`, 'hashed-password', 'Lookup Owner', 2],
  );
  ownerId = Number(userResult.lastID);

  const eventResult = await db.run(
    `INSERT INTO events (title, date, location, status, created_by)
     VALUES (?, ?, ?, ?, ?) RETURNING id`,
    ['Guest Lookup Event', '2030-08-01', 'Hall A', 'Active', ownerId],
  );
  eventId = Number(eventResult.lastID);

  const one = await db.run(
    `INSERT INTO rsvps (event_id, name, email, guests, status)
     VALUES (?, ?, ?, ?, ?) RETURNING id`,
    [eventId, 'Alex Guest', 'alex@example.com', 1, 'Going'],
  );
  const two = await db.run(
    `INSERT INTO rsvps (event_id, name, email, guests, status)
     VALUES (?, ?, ?, ?, ?) RETURNING id`,
    [eventId, 'A. Guest', 'Alex@Example.com', 2, 'Pending'],
  );

  await db.run(`UPDATE rsvps SET updated_at = ? WHERE id = ?`, ['2026-01-01T00:00:00.000Z', Number(one.lastID)]);
  await db.run(`UPDATE rsvps SET updated_at = ? WHERE id = ?`, ['2026-01-03T00:00:00.000Z', Number(two.lastID)]);

  await db.run(
    `INSERT INTO rsvps (event_id, name, email, guests, status)
     VALUES (?, ?, ?, ?, ?)`,
    [eventId, 'Other Person', 'other@example.com', 1, 'Going'],
  );
});

afterAll(async (): Promise<void> => {
  const db = getDatabase();
  if (eventId) {
    await db.run('DELETE FROM rsvps WHERE event_id = ?', [eventId]);
    await db.run('DELETE FROM events WHERE id = ?', [eventId]);
  }
  if (ownerId) {
    await db.run('DELETE FROM users WHERE id = ?', [ownerId]);
  }

  await closeDatabase();

  if (originalDatabaseUrl) {
    process.env.DATABASE_URL = originalDatabaseUrl;
  } else {
    delete process.env.DATABASE_URL;
  }
});

describe('lookupRsvpsByEmail', () => {
  it('returns exact-email matches and a merge suggestion', async () => {
    const req = {
      params: { eventId: String(eventId) },
      query: { email: 'alex@example.com' },
      user: { id: ownerId, email: 'owner@example.com', role_id: 2 },
    } as unknown as Request;
    const res = makeResponse();

    await lookupRsvpsByEmail(req, res as unknown as Response);

    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({
      email: 'alex@example.com',
      matches: [
        expect.objectContaining({ email: 'Alex@Example.com' }),
        expect.objectContaining({ email: 'alex@example.com' }),
      ],
      mergeSuggestion: {
        recommendedPrimaryId: expect.any(Number),
        sourceRsvpIds: expect.any(Array),
      },
    });

    const payload = res.body as {
      matches: Array<{ id: number }>;
      mergeSuggestion: { recommendedPrimaryId: number; sourceRsvpIds: number[] } | null;
    };

    expect(payload.matches).toHaveLength(2);
    expect(payload.mergeSuggestion).not.toBeNull();
    expect(payload.mergeSuggestion?.recommendedPrimaryId).toBe(payload.matches[0]?.id);
    expect(payload.mergeSuggestion?.sourceRsvpIds).toEqual([payload.matches[1]?.id]);
  });

  it('returns 400 when email query is missing', async () => {
    const req = {
      params: { eventId: String(eventId) },
      query: {},
      user: { id: ownerId, email: 'owner@example.com', role_id: 2 },
    } as unknown as Request;
    const res = makeResponse();

    await lookupRsvpsByEmail(req, res as unknown as Response);

    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ error: 'email query parameter is required.' });
  });
});
