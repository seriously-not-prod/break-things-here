/**
 * Tests for STORY #239 — Task Assignment Notification
 *
 * Verifies that:
 *  - sendTaskAssignmentEmail is called after createTask when assignee is an email
 *  - sendTaskAssignmentEmail is called after updateTask when assignee changes to a new email
 *  - No email is sent when assignee is not an email address
 *  - No email is sent when assignee does not change on update
 *  - Email contains task title, event title, and due date
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

// ── Mock nodemailer ───────────────────────────────────────────────────────────
const mockSendMail = vi.fn().mockResolvedValue({ messageId: 'test-id' });

vi.mock('nodemailer', () => ({
  default: {
    createTransport: vi.fn(() => ({ sendMail: mockSendMail })),
  },
}));

// ── Lazy-import after mocks ───────────────────────────────────────────────────
const { createTask, updateTask } = await import('../src/controllers/task-controller.js');
const { sendTaskAssignmentEmail } = await import('../src/utils/auth-helpers.js');

// ── Minimal Express app ───────────────────────────────────────────────────────
function buildApp() {
  const app = express();
  app.use(express.json());
  // Inject a fake authenticated user so auth checks pass
  app.use((req, _res, next) => {
    (req as any).user = { id: 1, email: 'organizer@example.com', role_id: 2 };
    next();
  });
  app.post('/tasks', (req, res) => createTask(req, res));
  app.put('/tasks/:id', (req, res) => updateTask(req, res));
  return app;
}

// ── Seed helpers ──────────────────────────────────────────────────────────────
async function seedEvent(db: DbWrapper, title = 'Summer Festival 2026') {
  const result = await db.run(
    `INSERT INTO events (title, date, location, status, created_by)
     VALUES (?, ?, ?, ?, ?) RETURNING id`,
    [title, '2026-07-15', 'Central Park', 'Active', 1],
  );
  return result.lastID as number;
}

async function seedTask(
  db: DbWrapper,
  eventId: number,
  overrides: Record<string, unknown> = {},
) {
  const result = await db.run(
    `INSERT INTO tasks (event_id, title, description, assignee, due_date, status)
     VALUES (?, ?, ?, ?, ?, ?) RETURNING id`,
    [
      eventId,
      overrides.title ?? 'Set up stage',
      overrides.description ?? null,
      overrides.assignee ?? null,
      overrides.due_date ?? '2026-07-10',
      overrides.status ?? 'Pending',
    ],
  );
  return result.lastID as number;
}

// ─────────────────────────────────────────────────────────────────────────────

describe('Task Assignment Notification (#239)', () => {
  beforeEach(async () => {
    testDb = await createTestDb();
    mockSendMail.mockClear();
  });

  // ── sendTaskAssignmentEmail unit tests ──────────────────────────────────────
  describe('sendTaskAssignmentEmail()', () => {
    it('sends an email to the assignee address', async () => {
      await sendTaskAssignmentEmail('alice@example.com', 'Set up stage', 'Summer Festival', '2026-07-10');

      expect(mockSendMail).toHaveBeenCalledOnce();
      expect(mockSendMail.mock.calls[0][0].to).toBe('alice@example.com');
    });

    it('includes the task title in subject and body', async () => {
      await sendTaskAssignmentEmail('alice@example.com', 'Decorate entrance', 'Summer Festival', null);

      const mail = mockSendMail.mock.calls[0][0];
      expect(mail.subject).toContain('Decorate entrance');
      expect(mail.text).toContain('Decorate entrance');
    });

    it('includes the event title in the body', async () => {
      await sendTaskAssignmentEmail('bob@example.com', 'Sound check', 'Jazz Night', '2026-08-01');

      const mail = mockSendMail.mock.calls[0][0];
      expect(mail.text).toContain('Jazz Night');
    });

    it('includes the due date in the body when provided', async () => {
      await sendTaskAssignmentEmail('carol@example.com', 'Catering setup', 'Autumn Gala', '2026-10-05');

      const mail = mockSendMail.mock.calls[0][0];
      expect(mail.text).toContain('2026-10-05');
    });

    it('shows "No due date" when due date is null', async () => {
      await sendTaskAssignmentEmail('dave@example.com', 'Photography', 'Winter Fair', null);

      const mail = mockSendMail.mock.calls[0][0];
      expect(mail.text).toContain('No due date');
    });

    it('uses FROM_EMAIL env variable when set', async () => {
      const orig = process.env.FROM_EMAIL;
      process.env.FROM_EMAIL = 'tasks@festival.example.com';

      await sendTaskAssignmentEmail('x@y.com', 'Task', 'Event', null);

      expect(mockSendMail.mock.calls[0][0].from).toBe('tasks@festival.example.com');
      process.env.FROM_EMAIL = orig;
    });

    it('falls back to noreply@festival-planner.local when FROM_EMAIL is unset', async () => {
      const orig = process.env.FROM_EMAIL;
      delete process.env.FROM_EMAIL;

      await sendTaskAssignmentEmail('x@y.com', 'Task', 'Event', null);

      expect(mockSendMail.mock.calls[0][0].from).toBe('noreply@festival-planner.local');
      process.env.FROM_EMAIL = orig;
    });

    it('throws when nodemailer sendMail rejects', async () => {
      mockSendMail.mockRejectedValueOnce(new Error('SMTP refused'));

      await expect(
        sendTaskAssignmentEmail('fail@example.com', 'Task', 'Event', null),
      ).rejects.toThrow('SMTP refused');
    });
  });

  // ── createTask integration ──────────────────────────────────────────────────
  describe('createTask — assignment email integration', () => {
    it('sends email when assignee is a valid email address', async () => {
      const eventId = await seedEvent(testDb);
      const app = buildApp();

      const res = await request(app).post('/tasks').send({
        event_id: eventId,
        title: 'Set up stage',
        assignee: 'crew@example.com',
        due_date: '2026-07-10',
      });

      expect(res.status).toBe(201);
      await new Promise((r) => setTimeout(r, 50));
      expect(mockSendMail).toHaveBeenCalledOnce();
    });

    it('email contains the task title', async () => {
      const eventId = await seedEvent(testDb);
      const app = buildApp();

      await request(app).post('/tasks').send({
        event_id: eventId,
        title: 'Sound check',
        assignee: 'tech@example.com',
      });

      await new Promise((r) => setTimeout(r, 50));
      const mail = mockSendMail.mock.calls[0][0];
      expect(mail.subject).toContain('Sound check');
      expect(mail.text).toContain('Sound check');
    });

    it('email contains the event title', async () => {
      const eventId = await seedEvent(testDb, 'Jazz Night');
      const app = buildApp();

      await request(app).post('/tasks').send({
        event_id: eventId,
        title: 'Stage setup',
        assignee: 'crew@example.com',
      });

      await new Promise((r) => setTimeout(r, 50));
      expect(mockSendMail.mock.calls[0][0].text).toContain('Jazz Night');
    });

    it('does NOT send email when assignee is a plain name (not an email)', async () => {
      const eventId = await seedEvent(testDb);
      const app = buildApp();

      const res = await request(app).post('/tasks').send({
        event_id: eventId,
        title: 'Set up stage',
        assignee: 'John Smith',
      });

      expect(res.status).toBe(201);
      await new Promise((r) => setTimeout(r, 50));
      expect(mockSendMail).not.toHaveBeenCalled();
    });

    it('does NOT send email when no assignee provided', async () => {
      const eventId = await seedEvent(testDb);
      const app = buildApp();

      const res = await request(app).post('/tasks').send({
        event_id: eventId,
        title: 'Parking management',
      });

      expect(res.status).toBe(201);
      await new Promise((r) => setTimeout(r, 50));
      expect(mockSendMail).not.toHaveBeenCalled();
    });

    it('returns 201 even if email sending fails (fire-and-forget)', async () => {
      mockSendMail.mockRejectedValueOnce(new Error('SMTP down'));
      const eventId = await seedEvent(testDb);
      const app = buildApp();

      const res = await request(app).post('/tasks').send({
        event_id: eventId,
        title: 'Stage setup',
        assignee: 'crew@example.com',
      });

      expect(res.status).toBe(201);
      await new Promise((r) => setTimeout(r, 50));
    });

    it('does NOT send email when event does not exist (404)', async () => {
      const app = buildApp();

      const res = await request(app).post('/tasks').send({
        event_id: 99999,
        title: 'Ghost task',
        assignee: 'ghost@example.com',
      });

      expect(res.status).toBe(404);
      await new Promise((r) => setTimeout(r, 50));
      expect(mockSendMail).not.toHaveBeenCalled();
    });
  });

  // ── updateTask integration ──────────────────────────────────────────────────
  describe('updateTask — assignment email on reassignment', () => {
    it('sends email when assignee changes to a new email', async () => {
      const eventId = await seedEvent(testDb);
      const taskId = await seedTask(testDb, eventId, { assignee: 'old@example.com' });
      const app = buildApp();

      const res = await request(app).put(`/tasks/${taskId}`).send({
        assignee: 'new@example.com',
      });

      expect(res.status).toBe(200);
      await new Promise((r) => setTimeout(r, 50));
      expect(mockSendMail).toHaveBeenCalledOnce();
      expect(mockSendMail.mock.calls[0][0].to).toBe('new@example.com');
    });

    it('does NOT send email when assignee is unchanged', async () => {
      const eventId = await seedEvent(testDb);
      const taskId = await seedTask(testDb, eventId, { assignee: 'same@example.com' });
      const app = buildApp();

      await request(app).put(`/tasks/${taskId}`).send({
        assignee: 'same@example.com',
        title: 'Updated title',
      });

      await new Promise((r) => setTimeout(r, 50));
      expect(mockSendMail).not.toHaveBeenCalled();
    });

    it('does NOT send email when update has no assignee field', async () => {
      const eventId = await seedEvent(testDb);
      const taskId = await seedTask(testDb, eventId, { assignee: 'crew@example.com' });
      const app = buildApp();

      await request(app).put(`/tasks/${taskId}`).send({ title: 'New title' });

      await new Promise((r) => setTimeout(r, 50));
      expect(mockSendMail).not.toHaveBeenCalled();
    });

    it('does NOT send email when new assignee is not an email', async () => {
      const eventId = await seedEvent(testDb);
      const taskId = await seedTask(testDb, eventId, { assignee: 'old@example.com' });
      const app = buildApp();

      const res = await request(app).put(`/tasks/${taskId}`).send({
        assignee: 'Jane Doe',
      });

      expect(res.status).toBe(200);
      await new Promise((r) => setTimeout(r, 50));
      expect(mockSendMail).not.toHaveBeenCalled();
    });

    it('returns 200 even if email sending fails (fire-and-forget)', async () => {
      mockSendMail.mockRejectedValueOnce(new Error('SMTP down'));
      const eventId = await seedEvent(testDb);
      const taskId = await seedTask(testDb, eventId, { assignee: null });
      const app = buildApp();

      const res = await request(app).put(`/tasks/${taskId}`).send({
        assignee: 'newcrew@example.com',
      });

      expect(res.status).toBe(200);
      await new Promise((r) => setTimeout(r, 50));
    });
  });
});
