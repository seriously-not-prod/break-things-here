/**
 * Tests for STORY #240 — In-App Notification Center
 *
 * Verifies that:
 *  - GET /api/notifications returns notifications for the authenticated user
 *  - GET /api/notifications returns unreadCount correctly
 *  - PATCH /api/notifications/:id/read marks a single notification as read
 *  - PATCH /api/notifications/read-all marks all notifications as read
 *  - Users cannot read each other's notifications (isolation)
 *  - 404 returned for unknown or other-user's notification
 *  - 401 returned when no user is authenticated
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createTestDb } from '../src/test-utils/create-test-db.js';
import type { DbWrapper } from '../src/db/database.js';

// ── Mock the database module ──────────────────────────────────────────────────
let testDb: DbWrapper;

vi.mock('../src/db/database.js', async (importOriginal) => {
  const original = await importOriginal<typeof import('../src/db/database.js')>();
  return {
    ...original,
    getDatabase: () => testDb,
    initializeDatabase: async () => testDb,
    closeDatabase: async () => {},
  };
});

// ── Lazy-import after mocks ───────────────────────────────────────────────────
const { getNotifications, markAllRead, markOneRead } = await import(
  '../src/controllers/notifications-controller.js'
);

// ── Helpers ───────────────────────────────────────────────────────────────────
function buildApp(userId = 1) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).user = { id: userId, email: 'user@example.com', role_id: 1 };
    next();
  });
  app.get('/api/notifications', getNotifications);
  app.patch('/api/notifications/read-all', markAllRead);
  app.patch('/api/notifications/:id/read', markOneRead);
  return app;
}

function buildUnauthApp() {
  const app = express();
  app.use(express.json());
  // no user injected — simulates missing auth
  app.get('/api/notifications', getNotifications);
  app.patch('/api/notifications/read-all', markAllRead);
  app.patch('/api/notifications/:id/read', markOneRead);
  return app;
}

async function insertUser(db: DbWrapper, id: number, email: string) {
  await db.run(
    `INSERT INTO users (id, email, password_hash, display_name, role_id) VALUES (?, ?, 'hash', 'Test', 1)`,
    [id, email],
  );
}

async function insertNotification(
  db: DbWrapper,
  userId: number,
  title: string,
  body = '',
  read = 0,
  type = 'info',
  link: string | null = null,
): Promise<number> {
  const row = await db.get<{ id: number }>(
    `INSERT INTO notifications (user_id, type, title, body, read, link) VALUES (?, ?, ?, ?, ?, ?) RETURNING id`,
    [userId, type, title, body, read, link],
  );
  return row!.id;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('GET /api/notifications', () => {
  beforeEach(async () => {
    testDb = await createTestDb();
    await insertUser(testDb, 1, 'user@example.com');
  });

  it('returns empty list when user has no notifications', async () => {
    const res = await request(buildApp()).get('/api/notifications');

    expect(res.status).toBe(200);
    expect(res.body.notifications).toEqual([]);
    expect(res.body.unreadCount).toBe(0);
  });

  it('returns notifications for the authenticated user', async () => {
    await insertNotification(testDb, 1, 'You have a new task', 'Task A assigned');
    await insertNotification(testDb, 1, 'Event starts tomorrow');

    const res = await request(buildApp()).get('/api/notifications');

    expect(res.status).toBe(200);
    expect(res.body.notifications).toHaveLength(2);
  });

  it('returns correct unreadCount', async () => {
    await insertNotification(testDb, 1, 'Unread 1', '', 0);
    await insertNotification(testDb, 1, 'Unread 2', '', 0);
    await insertNotification(testDb, 1, 'Already read', '', 1);

    const res = await request(buildApp()).get('/api/notifications');

    expect(res.status).toBe(200);
    expect(res.body.unreadCount).toBe(2);
    expect(res.body.notifications).toHaveLength(3);
  });

  it('does not return notifications belonging to another user', async () => {
    await insertUser(testDb, 2, 'other@example.com');
    await insertNotification(testDb, 2, 'Other user notification');

    const res = await request(buildApp(1)).get('/api/notifications');

    expect(res.status).toBe(200);
    expect(res.body.notifications).toHaveLength(0);
  });

  it('returns 401 when user is not authenticated', async () => {
    const res = await request(buildUnauthApp()).get('/api/notifications');
    expect(res.status).toBe(401);
  });

  it('returns notifications in newest-first order', async () => {
    await insertNotification(testDb, 1, 'First');
    await insertNotification(testDb, 1, 'Second');
    await insertNotification(testDb, 1, 'Third');

    const res = await request(buildApp()).get('/api/notifications');

    expect(res.status).toBe(200);
    // Newest should be Third (highest id)
    expect(res.body.notifications[0].title).toBe('Third');
    expect(res.body.notifications[2].title).toBe('First');
  });
});

describe('PATCH /api/notifications/:id/read', () => {
  beforeEach(async () => {
    testDb = await createTestDb();
    await insertUser(testDb, 1, 'user@example.com');
    await insertUser(testDb, 2, 'other@example.com');
  });

  it('marks a notification as read', async () => {
    const id = await insertNotification(testDb, 1, 'Unread notification');

    const res = await request(buildApp()).patch(`/api/notifications/${id}/read`);

    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Notification marked as read');

    const row = await testDb.get<{ read: number }>('SELECT read FROM notifications WHERE id = ?', [id]);
    expect(row?.read).toBe(1);
  });

  it('returns 404 for a notification belonging to a different user', async () => {
    const id = await insertNotification(testDb, 2, 'Other user notification');

    const res = await request(buildApp(1)).patch(`/api/notifications/${id}/read`);

    expect(res.status).toBe(404);
  });

  it('returns 404 for a non-existent notification', async () => {
    const res = await request(buildApp()).patch('/api/notifications/99999/read');
    expect(res.status).toBe(404);
  });

  it('returns 400 for invalid (non-numeric) id', async () => {
    const res = await request(buildApp()).patch('/api/notifications/abc/read');
    expect(res.status).toBe(400);
  });

  it('returns 401 when user is not authenticated', async () => {
    const id = await insertNotification(testDb, 1, 'Some notification');
    const res = await request(buildUnauthApp()).patch(`/api/notifications/${id}/read`);
    expect(res.status).toBe(401);
  });
});

describe('PATCH /api/notifications/read-all', () => {
  beforeEach(async () => {
    testDb = await createTestDb();
    await insertUser(testDb, 1, 'user@example.com');
    await insertUser(testDb, 2, 'other@example.com');
  });

  it('marks all unread notifications for the user as read', async () => {
    await insertNotification(testDb, 1, 'Notif 1', '', 0);
    await insertNotification(testDb, 1, 'Notif 2', '', 0);
    await insertNotification(testDb, 1, 'Already read', '', 1);

    const res = await request(buildApp()).patch('/api/notifications/read-all');

    expect(res.status).toBe(200);
    expect(res.body.message).toBe('All notifications marked as read');

    const unread = await testDb.all<{ id: number }>(
      'SELECT id FROM notifications WHERE user_id = 1 AND read = 0',
      [],
    );
    expect(unread).toHaveLength(0);
  });

  it('does not affect notifications of another user', async () => {
    await insertNotification(testDb, 2, 'Other unread', '', 0);

    await request(buildApp(1)).patch('/api/notifications/read-all');

    const row = await testDb.get<{ read: number }>(
      'SELECT read FROM notifications WHERE user_id = 2',
      [],
    );
    expect(row?.read).toBe(0);
  });

  it('returns 200 with no-op when no unread notifications exist', async () => {
    const res = await request(buildApp()).patch('/api/notifications/read-all');
    expect(res.status).toBe(200);
  });

  it('returns 401 when user is not authenticated', async () => {
    const res = await request(buildUnauthApp()).patch('/api/notifications/read-all');
    expect(res.status).toBe(401);
  });
});
