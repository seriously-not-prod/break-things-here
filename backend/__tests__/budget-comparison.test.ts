import type { Request, Response } from 'express';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { compareSimilarEvents } from '../src/controllers/budget-controller.js';
import { closeDatabase, getDatabase, initializeDatabase } from '../src/db/database.js';
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
let otherOwnerId = 0;
let currentEventId = 0;
let similarEventId = 0;
let hiddenEventId = 0;
let unrelatedEventId = 0;

beforeAll(async (): Promise<void> => {
  await initializeDatabase();
  const db = getDatabase();

  const seedKey = `budget-compare-${Date.now()}`;
  const ownerResult = await db.run(
    `INSERT INTO users (email, password_hash, display_name, role_id)
     VALUES (?, ?, ?, ?) RETURNING id`,
    [`${seedKey}-owner@example.com`, 'hashed-password', 'Budget Owner', 2],
  );
  ownerId = Number(ownerResult.lastID);

  const otherOwnerResult = await db.run(
    `INSERT INTO users (email, password_hash, display_name, role_id)
     VALUES (?, ?, ?, ?) RETURNING id`,
    [`${seedKey}-other@example.com`, 'hashed-password', 'Other Owner', 2],
  );
  otherOwnerId = Number(otherOwnerResult.lastID);

  const currentEventResult = await db.run(
    `INSERT INTO events (title, date, location, capacity, status, created_by, event_type, tags)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
    [
      'Summer Music Fest',
      '2031-06-15',
      'River Park',
      200,
      'Active',
      ownerId,
      'Music',
      'outdoor,summer,local',
    ],
  );
  currentEventId = Number(currentEventResult.lastID);

  const similarEventResult = await db.run(
    `INSERT INTO events (title, date, location, capacity, status, created_by, event_type, tags)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
    ['City Music Night', '2031-07-10', 'River Park', 220, 'Active', ownerId, 'Music', 'summer,vip'],
  );
  similarEventId = Number(similarEventResult.lastID);

  const hiddenEventResult = await db.run(
    `INSERT INTO events (title, date, location, capacity, status, created_by, event_type, tags)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
    [
      'Private Music Gala',
      '2031-07-01',
      'River Park',
      210,
      'Active',
      otherOwnerId,
      'Music',
      'summer,private',
    ],
  );
  hiddenEventId = Number(hiddenEventResult.lastID);

  const unrelatedEventResult = await db.run(
    `INSERT INTO events (title, date, location, capacity, status, created_by, event_type, tags)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
    [
      'Tech Expo',
      '2032-01-20',
      'Convention Center',
      1200,
      'Active',
      ownerId,
      'Technology',
      'indoor,b2b',
    ],
  );
  unrelatedEventId = Number(unrelatedEventResult.lastID);

  await db.run(
    `INSERT INTO budget_categories (event_id, name, allocated_amount, color, tax_rate, gratuity_rate, contingency_rate)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [currentEventId, 'Catering', 1000, '#ff6600', 8, 10, 5],
  );
  await db.run(
    `INSERT INTO budget_categories (event_id, name, allocated_amount, color, tax_rate, gratuity_rate, contingency_rate)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [similarEventId, 'Catering', 1500, '#00aa88', 10, 12, 5],
  );
  await db.run(
    `INSERT INTO budget_categories (event_id, name, allocated_amount, color, tax_rate, gratuity_rate, contingency_rate)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [hiddenEventId, 'Catering', 1900, '#8833ff', 10, 10, 10],
  );
  await db.run(
    `INSERT INTO budget_categories (event_id, name, allocated_amount, color, tax_rate, gratuity_rate, contingency_rate)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [unrelatedEventId, 'Booths', 2500, '#111111', 0, 0, 0],
  );

  const currentCategory = await db.get<{ id: number }>(
    'SELECT id FROM budget_categories WHERE event_id = ? LIMIT 1',
    [currentEventId],
  );
  const similarCategory = await db.get<{ id: number }>(
    'SELECT id FROM budget_categories WHERE event_id = ? LIMIT 1',
    [similarEventId],
  );
  const hiddenCategory = await db.get<{ id: number }>(
    'SELECT id FROM budget_categories WHERE event_id = ? LIMIT 1',
    [hiddenEventId],
  );

  await db.run(
    `INSERT INTO expenses (event_id, category_id, title, amount, payment_status)
     VALUES (?, ?, ?, ?, ?)`,
    [currentEventId, currentCategory?.id, 'Deposit', 600, 'pending'],
  );
  await db.run(
    `INSERT INTO expenses (event_id, category_id, title, amount, payment_status)
     VALUES (?, ?, ?, ?, ?)`,
    [similarEventId, similarCategory?.id, 'Venue hold', 900, 'pending'],
  );
  await db.run(
    `INSERT INTO expenses (event_id, category_id, title, amount, payment_status)
     VALUES (?, ?, ?, ?, ?)`,
    [hiddenEventId, hiddenCategory?.id, 'Private deposit', 1500, 'pending'],
  );
});

afterAll(async (): Promise<void> => {
  const db = getDatabase();

  for (const eventId of [currentEventId, similarEventId, hiddenEventId, unrelatedEventId]) {
    if (eventId) {
      await db.run('DELETE FROM expenses WHERE event_id = ?', [eventId]);
      await db.run('DELETE FROM budget_categories WHERE event_id = ?', [eventId]);
      await db.run('DELETE FROM event_members WHERE event_id = ?', [eventId]);
      await db.run('DELETE FROM events WHERE id = ?', [eventId]);
    }
  }

  for (const userId of [ownerId, otherOwnerId]) {
    if (userId) {
      await db.run('DELETE FROM users WHERE id = ?', [userId]);
    }
  }

  await closeDatabase();

  if (originalDatabaseUrl) {
    process.env.DATABASE_URL = originalDatabaseUrl;
  } else {
    delete process.env.DATABASE_URL;
  }
});

describe('compareSimilarEvents', () => {
  it('returns only accessible similar events with budget summaries', async () => {
    const req = {
      params: { eventId: String(currentEventId) },
      user: { id: ownerId, email: 'owner@example.com', role_id: 2 },
    } as unknown as Request;
    const res = makeResponse();

    await compareSimilarEvents(req, res as Response);

    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({
      currentEvent: {
        id: currentEventId,
        title: 'Summer Music Fest',
        summary: {
          totalAllocated: 1000,
          totalSpent: 600,
          totalPlanned: 1230,
          categoryCount: 1,
        },
      },
      overview: {
        averageSpent: 900,
        averagePlanned: 1905,
      },
    });

    const body = res.body as {
      comparison: Array<{
        id: number;
        title: string;
        matchReasons: string[];
        summary: { totalPlanned: number; totalSpent: number; plannedPercentUsed: number };
      }>;
    };

    expect(body.comparison).toHaveLength(1);
    expect(body.comparison[0]).toMatchObject({
      id: similarEventId,
      title: 'City Music Night',
      summary: {
        totalPlanned: 1905,
        totalSpent: 900,
        plannedPercentUsed: 47,
      },
    });
    expect(body.comparison[0].matchReasons).toContain('Same event type');
    expect(body.comparison[0].matchReasons).toContain('Same location');
    expect(
      body.comparison[0].matchReasons.some((reason) => reason.startsWith('Shared tags:')),
    ).toBe(true);
    expect(body.comparison.some((item) => item.id === hiddenEventId)).toBe(false);
  });

  it('requires authentication', async () => {
    const req = {
      params: { eventId: String(currentEventId) },
    } as unknown as Request;
    const res = makeResponse();

    await compareSimilarEvents(req, res as Response);

    expect(res.statusCode).toBe(401);
    expect(res.body).toMatchObject({ error: 'Authentication required.' });
  });
});
