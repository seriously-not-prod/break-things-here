import type { Request, Response } from 'express';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeDatabase, getDatabase, initializeDatabase } from '../src/db/database.js';
import { exportEventReport, getEventSummary } from '../src/controllers/analytics-controller.js';
import { resolveTestDatabaseUrl } from '../test-database-url.js';

const originalDatabaseUrl = process.env.DATABASE_URL;
const defaultDatabaseUrl = resolveTestDatabaseUrl();

if (!originalDatabaseUrl) {
  process.env.DATABASE_URL = defaultDatabaseUrl;
}

interface MockResponse {
  statusCode: number;
  body: unknown;
  headers: Record<string, string>;
  status(code: number): MockResponse;
  json(data: unknown): MockResponse;
  send(data: unknown): MockResponse;
  setHeader(name: string, value: string): void;
}

function makeResponse(): MockResponse {
  return {
    statusCode: 200,
    body: null,
    headers: {},
    status(code: number): MockResponse {
      this.statusCode = code;
      return this;
    },
    json(data: unknown): MockResponse {
      this.body = data;
      return this;
    },
    send(data: unknown): MockResponse {
      this.body = data;
      return this;
    },
    setHeader(name: string, value: string): void {
      this.headers[name] = value;
    },
  };
}

let ownerId = 0;
let eventId = 0;

beforeAll(async (): Promise<void> => {
  await initializeDatabase();
  const db = getDatabase();

  await db.exec('ALTER TABLE events ADD COLUMN IF NOT EXISTS event_date TEXT');
  await db.exec("UPDATE events SET event_date = COALESCE(event_date, date)");

  const seedKey = `analytics-${Date.now()}`;
  const userResult = await db.run(
    `INSERT INTO users (email, password_hash, display_name, role_id)
     VALUES (?, ?, ?, ?) RETURNING id`,
    [`${seedKey}@example.com`, 'hashed-password', 'Analytics Owner', 2],
  );
  ownerId = Number(userResult.lastID);

  const eventResult = await db.run(
    `INSERT INTO events (title, date, event_date, location, status, created_by)
     VALUES (?, ?, ?, ?, ?, ?) RETURNING id`,
    ['Analytics Event', '2030-09-15', '2030-09-15', 'Main Grounds', 'Active', ownerId],
  );
  eventId = Number(eventResult.lastID);

  const categoryResult = await db.run(
    `INSERT INTO budget_categories (event_id, name, allocated_amount, color)
     VALUES (?, ?, ?, ?) RETURNING id`,
    [eventId, 'Catering', 1000, '#ff6600'],
  );
  const categoryId = Number(categoryResult.lastID);

  await db.run(
    `INSERT INTO expenses (event_id, category_id, title, amount, payment_status)
     VALUES (?, ?, ?, ?, ?)`,
    [eventId, categoryId, 'Buffet deposit', 450, 'Pending'],
  );

  await db.run(
    `INSERT INTO tasks (event_id, title, status, priority, created_by)
     VALUES (?, ?, ?, ?, ?)`,
    [eventId, 'Book stage', 'Complete', 'High', ownerId],
  );
  await db.run(
    `INSERT INTO tasks (event_id, title, status, priority, created_by)
     VALUES (?, ?, ?, ?, ?)`,
    [eventId, 'Confirm vendors', 'Pending', 'Medium', ownerId],
  );

  await db.run(
    `INSERT INTO rsvps (event_id, name, email, guests, status, checked_in)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [eventId, 'Alex Guest', `${seedKey}+1@example.com`, 2, 'Going', true],
  );
  await db.run(
    `INSERT INTO rsvps (event_id, name, email, guests, status, checked_in)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [eventId, 'Blair Guest', `${seedKey}+2@example.com`, 1, 'Pending', false],
  );
  await db.run(
    `INSERT INTO rsvps (event_id, name, email, guests, status, checked_in)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [eventId, 'Casey Guest', `${seedKey}+3@example.com`, 1, 'Declined', false],
  );
});

afterAll(async (): Promise<void> => {
  const db = getDatabase();
  if (eventId) {
    await db.run('DELETE FROM notifications WHERE link LIKE ?', [`/events/${eventId}%`]);
    await db.run('DELETE FROM expenses WHERE event_id = ?', [eventId]);
    await db.run('DELETE FROM budget_categories WHERE event_id = ?', [eventId]);
    await db.run('DELETE FROM rsvps WHERE event_id = ?', [eventId]);
    await db.run('DELETE FROM tasks WHERE event_id = ?', [eventId]);
    await db.run('DELETE FROM events WHERE id = ?', [eventId]);
  }
  if (ownerId) {
    await db.run('DELETE FROM users WHERE id = ?', [ownerId]);
  }

  // Drop the legacy column we added in beforeAll. Without this, subsequent
  // test files that re-run runMigrations hit a column-collision when the
  // migration tries to rename event_date → date (which already exists).
  await db.exec('ALTER TABLE events DROP COLUMN IF EXISTS event_date');

  await closeDatabase();

  if (originalDatabaseUrl) {
    process.env.DATABASE_URL = originalDatabaseUrl;
  } else {
    delete process.env.DATABASE_URL;
  }
});

describe('analytics controller', () => {
  it('returns the expected analytics shape for an event', async () => {
    const req = {
      params: { eventId: String(eventId) },
      user: { id: ownerId, email: 'analytics-owner@example.com', role_id: 2 },
    } as unknown as Request;
    const res = makeResponse();

    await getEventSummary(req, res as Response);

    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({
      totalRsvps: 3,
      confirmedRsvps: 1,
      declinedRsvps: 1,
      pendingRsvps: 1,
      checkedInCount: 1,
      acceptanceRate: 33,
      totalBudgetAllocated: 1000,
      totalBudgetSpent: 450,
      budgetUtilizationPct: 45,
      taskCompletionRate: 50,
    });
    expect(res.body).toHaveProperty('tasksByStatus');
    expect(res.body).toHaveProperty('vendorsByStatus');
    expect(res.body).toHaveProperty('rsvpByDietaryRestriction');
    expect(res.body).toHaveProperty('topExpenseCategories');
  });

  it('exports a CSV report for the event', async () => {
    const req = {
      params: { eventId: String(eventId) },
      query: { format: 'csv' },
      user: { id: ownerId, email: 'analytics-owner@example.com', role_id: 2 },
    } as unknown as Request;
    const res = makeResponse();

    await exportEventReport(req, res as Response);

    expect(res.statusCode).toBe(200);
    expect(res.headers['Content-Type']).toContain('text/csv');
    expect(String(res.body)).toContain('RSVP LIST');
    expect(String(res.body)).toContain('BUDGET SUMMARY');
    expect(String(res.body)).toContain('Alex Guest');
    expect(String(res.body)).toContain('Catering');
  });
});
