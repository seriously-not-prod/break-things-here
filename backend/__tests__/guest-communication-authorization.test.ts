/**
 * Guest-communication authorization — integration tests (#424)
 *
 * Adjacent to the feed test (#423). Verifies that the two endpoints
 * promoted to the shared helper enforce the right level:
 *   - listCommunicationLog → requireEventAccess({ allowMembers: true })
 *   - bulkSend (invite/reminder) → requireEventAccess({ ownerOnly: true })
 *
 * Mirrors feed-authorization.test.ts: per-test PostgreSQL schema,
 * direct controller invocation with mock req/res, nodemailer mocked so
 * the owner-success path can be exercised without an SMTP server.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Request, Response } from 'express';
import { createPostgresTestDatabase, type TestDatabase } from './helpers/postgres-test-db.js';

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
  PRIMARY KEY (event_id, user_id)
);
CREATE TABLE IF NOT EXISTS rsvps (
  id         SERIAL PRIMARY KEY,
  event_id   INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  email      TEXT NOT NULL,
  status     TEXT DEFAULT 'Going'
);
CREATE TABLE IF NOT EXISTS communication_log (
  id                  SERIAL PRIMARY KEY,
  event_id            INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  guest_email         TEXT,
  communication_type  TEXT,
  subject             TEXT,
  content             TEXT,
  status              TEXT,
  sent_by             INTEGER REFERENCES users(id) ON DELETE SET NULL,
  sent_at             TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
`;

let testDb: TestDatabase;

vi.mock('../src/db/database.js', () => ({
  getDatabase: () => testDb,
  initializeDatabase: async () => testDb,
}));

const sendMailMock = vi.fn(async () => ({ accepted: ['x'], rejected: [], response: 'ok' }));

vi.mock('nodemailer', () => ({
  default: {
    createTransport: () => ({ sendMail: sendMailMock }),
  },
}));

import {
  bulkSendInvitation,
  sendReminder,
  listCommunicationLog,
} from '../src/controllers/guest-communication-controller.js';

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
  body: Record<string, unknown> = {},
  user?: { id: number; email: string; role_id: number },
): Request {
  return { params, body, query: {}, user } as unknown as Request;
}

async function seedUser(email: string, roleId = 1): Promise<number> {
  const result = await testDb.run(
    `INSERT INTO users (email, display_name, role_id) VALUES (?, ?, ?) RETURNING id`,
    [email, email.split('@')[0], roleId],
  );
  return result.lastID as number;
}

async function seedEvent(ownerId: number): Promise<number> {
  const result = await testDb.run(
    `INSERT INTO events (title, date, location, created_by) VALUES ('Fest', '2026-07-01', 'Park', ?) RETURNING id`,
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

async function seedRsvp(eventId: number, email = 'guest@test.com'): Promise<number> {
  const result = await testDb.run(
    `INSERT INTO rsvps (event_id, name, email, status) VALUES (?, ?, ?, 'Going') RETURNING id`,
    [eventId, 'Guest', email],
  );
  return result.lastID as number;
}

const validBody = { subject: 'Hello', body: 'Body for {name} re {event}' };

beforeEach(async () => {
  testDb = await createPostgresTestDatabase(SCHEMA_SQL);
  sendMailMock.mockClear();
});

afterEach(async () => {
  await testDb.close();
});

describe('GET /api/events/:eventId/communication — listCommunicationLog (#424)', () => {
  it('returns 401 when unauthenticated', async () => {
    const ownerId = await seedUser('owner@test.com', 2);
    const eventId = await seedEvent(ownerId);

    const req = makeReq({ eventId: String(eventId) });
    const res = makeRes();

    await listCommunicationLog(req, res as unknown as Response);

    expect(res.statusCode).toBe(401);
  });

  it('returns 200 for the owner', async () => {
    const ownerId = await seedUser('owner@test.com', 2);
    const eventId = await seedEvent(ownerId);

    const req = makeReq({ eventId: String(eventId) }, {}, {
      id: ownerId, email: 'owner@test.com', role_id: 2,
    });
    const res = makeRes();

    await listCommunicationLog(req, res as unknown as Response);

    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty('log');
  });

  it('returns 200 for an event member', async () => {
    const ownerId = await seedUser('owner@test.com', 2);
    const memberId = await seedUser('member@test.com', 1);
    const eventId = await seedEvent(ownerId);
    await addMember(eventId, memberId);

    const req = makeReq({ eventId: String(eventId) }, {}, {
      id: memberId, email: 'member@test.com', role_id: 1,
    });
    const res = makeRes();

    await listCommunicationLog(req, res as unknown as Response);

    expect(res.statusCode).toBe(200);
  });

  it('returns 403 for an unrelated user (no leak of log contents)', async () => {
    const ownerId = await seedUser('owner@test.com', 2);
    const outsiderId = await seedUser('outsider@test.com', 1);
    const eventId = await seedEvent(ownerId);

    const req = makeReq({ eventId: String(eventId) }, {}, {
      id: outsiderId, email: 'outsider@test.com', role_id: 1,
    });
    const res = makeRes();

    await listCommunicationLog(req, res as unknown as Response);

    expect(res.statusCode).toBe(403);
    expect(res.body).not.toHaveProperty('log');
  });

  it('returns 404 when the event does not exist', async () => {
    const ownerId = await seedUser('owner@test.com', 2);

    const req = makeReq({ eventId: '999999' }, {}, {
      id: ownerId, email: 'owner@test.com', role_id: 2,
    });
    const res = makeRes();

    await listCommunicationLog(req, res as unknown as Response);

    expect(res.statusCode).toBe(404);
  });
});

describe('POST /api/events/:eventId/communication/{invite,reminder} — bulkSend (#424)', () => {
  it('returns 401 when unauthenticated', async () => {
    const ownerId = await seedUser('owner@test.com', 2);
    const eventId = await seedEvent(ownerId);

    const req = makeReq({ eventId: String(eventId) }, validBody);
    const res = makeRes();

    await bulkSendInvitation(req, res as unknown as Response);

    expect(res.statusCode).toBe(401);
    expect(sendMailMock).not.toHaveBeenCalled();
  });

  it('returns 403 when an event member (not owner) attempts to broadcast', async () => {
    const ownerId = await seedUser('owner@test.com', 2);
    const memberId = await seedUser('member@test.com', 1);
    const eventId = await seedEvent(ownerId);
    await addMember(eventId, memberId);
    await seedRsvp(eventId);

    const req = makeReq({ eventId: String(eventId) }, validBody, {
      id: memberId, email: 'member@test.com', role_id: 1,
    });
    const res = makeRes();

    await bulkSendInvitation(req, res as unknown as Response);

    expect(res.statusCode).toBe(403);
    expect(sendMailMock).not.toHaveBeenCalled();
  });

  it('returns 403 when an unrelated user attempts to broadcast', async () => {
    const ownerId = await seedUser('owner@test.com', 2);
    const outsiderId = await seedUser('outsider@test.com', 1);
    const eventId = await seedEvent(ownerId);
    await seedRsvp(eventId);

    const req = makeReq({ eventId: String(eventId) }, validBody, {
      id: outsiderId, email: 'outsider@test.com', role_id: 1,
    });
    const res = makeRes();

    await sendReminder(req, res as unknown as Response);

    expect(res.statusCode).toBe(403);
    expect(sendMailMock).not.toHaveBeenCalled();
  });

  it('returns 200 for the owner and dispatches mail', async () => {
    const ownerId = await seedUser('owner@test.com', 2);
    const eventId = await seedEvent(ownerId);
    await seedRsvp(eventId, 'one@test.com');
    await seedRsvp(eventId, 'two@test.com');

    const req = makeReq({ eventId: String(eventId) }, validBody, {
      id: ownerId, email: 'owner@test.com', role_id: 2,
    });
    const res = makeRes();

    await bulkSendInvitation(req, res as unknown as Response);

    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({ sent: 2, failed: 0 });
    expect(sendMailMock).toHaveBeenCalledTimes(2);

    // Each row in communication_log must record the owner as sender.
    const rows = await testDb.all<{ sent_by: number; communication_type: string }>(
      'SELECT sent_by, communication_type FROM communication_log WHERE event_id = ?',
      [eventId],
    );
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(row.sent_by).toBe(ownerId);
      expect(row.communication_type).toBe('invitation');
    }
  });
});
