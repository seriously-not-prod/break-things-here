/**
 * Notification preferences — integration tests (#786)
 *
 * Verifies:
 * - GET  /api/users/me/notification-preferences returns the full matrix
 * - PATCH /api/users/me/notification-preferences updates entries
 * - Disabled preference suppresses in-app dispatch via createBatchedNotification
 * - 401 when unauthenticated
 * - 400 for invalid payloads
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
CREATE TABLE IF NOT EXISTS notification_preferences (
  id         SERIAL PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  channel    TEXT NOT NULL CHECK (channel IN ('email', 'in_app')),
  category   TEXT NOT NULL CHECK (category IN (
    'task_due', 'task_overdue', 'task_assigned', 'budget_alert',
    'rsvp_submitted', 'event_update', 'chat_message', 'event_reminder'
  )),
  enabled    BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (user_id, channel, category)
);
CREATE TABLE IF NOT EXISTS notifications (
  id                SERIAL PRIMARY KEY,
  user_id           INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type              TEXT,
  title             TEXT,
  body              TEXT,
  link              TEXT,
  is_read           BOOLEAN DEFAULT FALSE,
  notification_type TEXT,
  batch_key         TEXT,
  batch_count       INTEGER DEFAULT 1,
  delivered_at      TIMESTAMP,
  created_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS notification_batch_rules (
  id                  SERIAL PRIMARY KEY,
  notification_type   TEXT NOT NULL UNIQUE,
  batch_window_mins   INTEGER NOT NULL DEFAULT 15,
  max_per_window      INTEGER NOT NULL DEFAULT 5,
  created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
`;

// ── Test database wiring ────────────────────────────────────────────────────
let testDb: TestDatabase;

vi.mock('../src/db/database.js', () => ({
  getDatabase: () => testDb,
  initializeDatabase: async () => testDb,
}));

import {
  listPreferences,
  patchPreferences,
} from '../src/controllers/notification-preferences-controller.js';

import { createBatchedNotification } from '../src/controllers/notifications-controller.js';

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
  body: Record<string, unknown> = {},
  user?: { id: number; email: string; role_id: number },
): Request {
  return { body, params: {}, query: {}, user } as unknown as Request;
}

// ── Seed helpers ────────────────────────────────────────────────────────────
async function seedUser(email: string): Promise<number> {
  const result = await testDb.run(
    `INSERT INTO users (email, display_name) VALUES ($1, $2) RETURNING id`,
    [email, email.split('@')[0]],
  );
  return result.lastID as number;
}

async function seedPreferences(userId: number): Promise<void> {
  const channels = ['email', 'in_app'];
  const categories = [
    'task_due',
    'task_overdue',
    'task_assigned',
    'budget_alert',
    'rsvp_submitted',
    'event_update',
    'chat_message',
    'event_reminder',
  ];
  for (const channel of channels) {
    for (const category of categories) {
      await testDb.run(
        `INSERT INTO notification_preferences (user_id, channel, category, enabled)
         VALUES ($1, $2, $3, TRUE)
         ON CONFLICT (user_id, channel, category) DO NOTHING`,
        [userId, channel, category],
      );
    }
  }
}

// ── Tests ───────────────────────────────────────────────────────────────────
describe('Notification preferences (#786)', () => {
  beforeEach(async () => {
    testDb = await createPostgresTestDatabase(SCHEMA_SQL);
  });

  afterEach(async () => {
    await testDb.close();
  });

  // ── GET /api/users/me/notification-preferences ──────────────────────────

  it('returns 401 when unauthenticated', async () => {
    const req = makeReq();
    const res = makeRes();
    await listPreferences(req, res as unknown as Response);
    expect(res.statusCode).toBe(401);
  });

  it('returns default-enabled matrix for a user with seeded preferences', async () => {
    const userId = await seedUser('alice@example.com');
    await seedPreferences(userId);

    const req = makeReq({}, { id: userId, email: 'alice@example.com', role_id: 1 });
    const res = makeRes();
    await listPreferences(req, res as unknown as Response);

    expect(res.statusCode).toBe(200);
    const body = res.body as { preferences: Record<string, Record<string, boolean>> };
    expect(body.preferences).toBeDefined();

    // All categories should be present with both channels enabled
    expect(body.preferences.budget_alert).toEqual({ email: true, in_app: true });
    expect(body.preferences.task_due).toEqual({ email: true, in_app: true });
    expect(body.preferences.chat_message).toEqual({ email: true, in_app: true });
  });

  it('returns defaults for a user with no preferences rows', async () => {
    const userId = await seedUser('bob@example.com');

    const req = makeReq({}, { id: userId, email: 'bob@example.com', role_id: 1 });
    const res = makeRes();
    await listPreferences(req, res as unknown as Response);

    expect(res.statusCode).toBe(200);
    const body = res.body as { preferences: Record<string, Record<string, boolean>> };
    // Even without rows, the matrix should default to all enabled
    expect(body.preferences.task_due).toEqual({ email: true, in_app: true });
  });

  // ── PATCH /api/users/me/notification-preferences ────────────────────────

  it('returns 401 when unauthenticated for PATCH', async () => {
    const req = makeReq({ updates: [{ channel: 'email', category: 'task_due', enabled: false }] });
    const res = makeRes();
    await patchPreferences(req, res as unknown as Response);
    expect(res.statusCode).toBe(401);
  });

  it('returns 400 when updates array is missing', async () => {
    const userId = await seedUser('carol@example.com');
    const req = makeReq({}, { id: userId, email: 'carol@example.com', role_id: 1 });
    const res = makeRes();
    await patchPreferences(req, res as unknown as Response);
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 for invalid channel', async () => {
    const userId = await seedUser('dave@example.com');
    const req = makeReq(
      { updates: [{ channel: 'push', category: 'task_due', enabled: false }] },
      { id: userId, email: 'dave@example.com', role_id: 1 },
    );
    const res = makeRes();
    await patchPreferences(req, res as unknown as Response);
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 for invalid category', async () => {
    const userId = await seedUser('eve@example.com');
    const req = makeReq(
      { updates: [{ channel: 'email', category: 'invalid_type', enabled: false }] },
      { id: userId, email: 'eve@example.com', role_id: 1 },
    );
    const res = makeRes();
    await patchPreferences(req, res as unknown as Response);
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 when enabled is not a boolean', async () => {
    const userId = await seedUser('frank@example.com');
    const req = makeReq(
      { updates: [{ channel: 'email', category: 'task_due', enabled: 'yes' }] },
      { id: userId, email: 'frank@example.com', role_id: 1 },
    );
    const res = makeRes();
    await patchPreferences(req, res as unknown as Response);
    expect(res.statusCode).toBe(400);
  });

  it('successfully disables a channel and returns updated matrix', async () => {
    const userId = await seedUser('grace@example.com');
    await seedPreferences(userId);

    const req = makeReq(
      {
        updates: [
          { channel: 'email', category: 'budget_alert', enabled: false },
          { channel: 'in_app', category: 'chat_message', enabled: false },
        ],
      },
      { id: userId, email: 'grace@example.com', role_id: 1 },
    );
    const res = makeRes();
    await patchPreferences(req, res as unknown as Response);

    expect(res.statusCode).toBe(200);
    const body = res.body as { preferences: Record<string, Record<string, boolean>> };
    expect(body.preferences.budget_alert.email).toBe(false);
    expect(body.preferences.budget_alert.in_app).toBe(true);
    expect(body.preferences.chat_message.in_app).toBe(false);
    expect(body.preferences.chat_message.email).toBe(true);
    // Unmodified categories remain enabled
    expect(body.preferences.task_due).toEqual({ email: true, in_app: true });
  });

  // ── Dispatch guard: disabled preference suppresses in-app dispatch ──────

  it('suppresses in-app dispatch when preference is disabled', async () => {
    const userId = await seedUser('heidi@example.com');

    // Seed preference with in_app disabled for budget_alert
    await testDb.run(
      `INSERT INTO notification_preferences (user_id, channel, category, enabled)
       VALUES ($1, 'in_app', 'budget_alert', FALSE)`,
      [userId],
    );

    // Attempt to create a batched notification
    const created = await createBatchedNotification(
      userId,
      'budget_alert',
      'Budget Warning',
      'Test body',
    );

    // Should be suppressed
    expect(created).toBe(false);

    // Verify no notification was inserted
    const rows = await testDb.all('SELECT * FROM notifications WHERE user_id = $1', [userId]);
    expect(rows).toHaveLength(0);
  });

  it('allows in-app dispatch when preference is enabled', async () => {
    const userId = await seedUser('ivan@example.com');

    // Seed preference with in_app enabled for budget_alert
    await testDb.run(
      `INSERT INTO notification_preferences (user_id, channel, category, enabled)
       VALUES ($1, 'in_app', 'budget_alert', TRUE)`,
      [userId],
    );

    const created = await createBatchedNotification(
      userId,
      'budget_alert',
      'Budget Warning',
      'Test body',
    );

    expect(created).toBe(true);

    const rows = await testDb.all('SELECT * FROM notifications WHERE user_id = $1', [userId]);
    expect(rows).toHaveLength(1);
  });

  it('allows dispatch when no preference row exists (opt-out model)', async () => {
    const userId = await seedUser('judy@example.com');

    // No preferences seeded — should default to enabled
    const created = await createBatchedNotification(userId, 'task_due', 'Task Due', 'Test body');

    expect(created).toBe(true);

    const rows = await testDb.all('SELECT * FROM notifications WHERE user_id = $1', [userId]);
    expect(rows).toHaveLength(1);
  });
});
