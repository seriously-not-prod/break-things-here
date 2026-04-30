/**
 * Tests for STORY #238 — RSVP Confirmation Email
 *
 * Verifies that:
 *  - sendRsvpConfirmationEmail is called after a successful RSVP insert
 *  - The email contains event title, date, and RSVP status
 *  - sendRsvpConfirmationEmail calls nodemailer sendMail with correct args
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
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

// ── Lazy-import controllers after mocks are set up ────────────────────────────
const { submitRsvp } = await import('../src/controllers/rsvp-controller.js');
const { sendRsvpConfirmationEmail } = await import('../src/utils/auth-helpers.js');

// ── Helper: build a minimal Express app for RSVP routes ──────────────────────
function buildApp() {
  const app = express();
  app.use(express.json());
  app.post('/rsvps', (req, res) => submitRsvp(req, res));
  return app;
}

// ── Seed helpers ──────────────────────────────────────────────────────────────
async function seedEvent(db: DbWrapper, overrides: Record<string, unknown> = {}) {
  const result = await db.run(
    `INSERT INTO events (title, date, location, status, created_by)
     VALUES (?, ?, ?, ?, ?)
     RETURNING id`,
    [
      overrides.title ?? 'Summer Festival 2026',
      overrides.date ?? '2026-07-15',
      overrides.location ?? 'Central Park',
      overrides.status ?? 'Active',
      overrides.created_by ?? 1,
    ],
  );
  return result.lastID as number;
}

// ─────────────────────────────────────────────────────────────────────────────

describe('RSVP Confirmation Email (#238)', () => {
  beforeEach(async () => {
    testDb = await createTestDb();
    mockSendMail.mockClear();
  });

  // ── sendRsvpConfirmationEmail unit tests ────────────────────────────────────
  describe('sendRsvpConfirmationEmail()', () => {
    it('sends an email to the attendee address', async () => {
      await sendRsvpConfirmationEmail(
        'alice@example.com',
        'Alice',
        'Summer Festival 2026',
        '2026-07-15',
        'Pending',
      );

      expect(mockSendMail).toHaveBeenCalledOnce();
      const call = mockSendMail.mock.calls[0][0];
      expect(call.to).toBe('alice@example.com');
    });

    it('includes the event title in subject and body', async () => {
      await sendRsvpConfirmationEmail(
        'bob@example.com',
        'Bob',
        'Winter Gala',
        '2026-12-01',
        'Confirmed',
      );

      const call = mockSendMail.mock.calls[0][0];
      expect(call.subject).toContain('Winter Gala');
      expect(call.text).toContain('Winter Gala');
    });

    it('includes the event date in the body', async () => {
      await sendRsvpConfirmationEmail(
        'carol@example.com',
        'Carol',
        'Spring Fair',
        '2026-04-10',
        'Pending',
      );

      const call = mockSendMail.mock.calls[0][0];
      expect(call.text).toContain('2026-04-10');
    });

    it('includes the RSVP status in the body', async () => {
      await sendRsvpConfirmationEmail(
        'dave@example.com',
        'Dave',
        'Autumn Market',
        '2026-10-20',
        'Declined',
      );

      const call = mockSendMail.mock.calls[0][0];
      expect(call.text).toContain('Declined');
    });

    it('includes the attendee name in the body', async () => {
      await sendRsvpConfirmationEmail(
        'eve@example.com',
        'Eve',
        'Tech Meetup',
        '2026-09-05',
        'Confirmed',
      );

      const call = mockSendMail.mock.calls[0][0];
      expect(call.text).toContain('Eve');
    });

    it('sends from the configured FROM_EMAIL env variable', async () => {
      const original = process.env.FROM_EMAIL;
      process.env.FROM_EMAIL = 'events@festival.example.com';

      await sendRsvpConfirmationEmail('x@y.com', 'X', 'Evt', '2026-01-01', 'Pending');

      const call = mockSendMail.mock.calls[0][0];
      expect(call.from).toBe('events@festival.example.com');

      process.env.FROM_EMAIL = original;
    });

    it('falls back to noreply@festival-planner.local when FROM_EMAIL is unset', async () => {
      const original = process.env.FROM_EMAIL;
      delete process.env.FROM_EMAIL;

      await sendRsvpConfirmationEmail('x@y.com', 'X', 'Evt', '2026-01-01', 'Pending');

      const call = mockSendMail.mock.calls[0][0];
      expect(call.from).toBe('noreply@festival-planner.local');

      process.env.FROM_EMAIL = original;
    });

    it('throws when nodemailer sendMail rejects', async () => {
      mockSendMail.mockRejectedValueOnce(new Error('SMTP connection refused'));

      await expect(
        sendRsvpConfirmationEmail('fail@example.com', 'Fail', 'Evt', '2026-01-01', 'Pending'),
      ).rejects.toThrow('SMTP connection refused');
    });
  });

  // ── Integration: submitRsvp triggers email ──────────────────────────────────
  describe('submitRsvp — confirmation email integration', () => {
    it('calls sendRsvpConfirmationEmail after a successful RSVP insert', async () => {
      const eventId = await seedEvent(testDb);
      const app = buildApp();

      const res = await request(app).post('/rsvps').send({
        event_id: eventId,
        name: 'Alice',
        email: 'alice@example.com',
        guests: 1,
        status: 'Pending',
      });

      expect(res.status).toBe(201);

      // Allow the fire-and-forget email promise to settle
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(mockSendMail).toHaveBeenCalledOnce();
    });

    it('email contains the correct event title', async () => {
      const eventId = await seedEvent(testDb, { title: 'Jazz Night' });
      const app = buildApp();

      await request(app).post('/rsvps').send({
        event_id: eventId,
        name: 'Bob',
        email: 'bob@example.com',
      });

      await new Promise((resolve) => setTimeout(resolve, 50));

      const call = mockSendMail.mock.calls[0][0];
      expect(call.subject).toContain('Jazz Night');
      expect(call.text).toContain('Jazz Night');
    });

    it('email contains the correct event date', async () => {
      const eventId = await seedEvent(testDb, { date: '2026-08-20' });
      const app = buildApp();

      await request(app).post('/rsvps').send({
        event_id: eventId,
        name: 'Carol',
        email: 'carol@example.com',
      });

      await new Promise((resolve) => setTimeout(resolve, 50));

      const call = mockSendMail.mock.calls[0][0];
      expect(call.text).toContain('2026-08-20');
    });

    it('email contains the RSVP status', async () => {
      const eventId = await seedEvent(testDb);
      const app = buildApp();

      await request(app).post('/rsvps').send({
        event_id: eventId,
        name: 'Dave',
        email: 'dave@example.com',
        status: 'Confirmed',
      });

      await new Promise((resolve) => setTimeout(resolve, 50));

      const call = mockSendMail.mock.calls[0][0];
      expect(call.text).toContain('Confirmed');
    });

    it('returns 201 even if email sending fails (fire-and-forget)', async () => {
      mockSendMail.mockRejectedValueOnce(new Error('SMTP down'));
      const eventId = await seedEvent(testDb);
      const app = buildApp();

      const res = await request(app).post('/rsvps').send({
        event_id: eventId,
        name: 'Eve',
        email: 'eve@example.com',
      });

      expect(res.status).toBe(201);

      // Allow the rejected promise to settle without crashing
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    it('does NOT send email when required fields are missing (400 response)', async () => {
      const app = buildApp();

      const res = await request(app).post('/rsvps').send({ name: 'NoEvent' });

      expect(res.status).toBe(400);
      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(mockSendMail).not.toHaveBeenCalled();
    });

    it('does NOT send email when event does not exist (404 response)', async () => {
      const app = buildApp();

      const res = await request(app).post('/rsvps').send({
        event_id: 99999,
        name: 'Ghost',
        email: 'ghost@example.com',
      });

      expect(res.status).toBe(404);
      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(mockSendMail).not.toHaveBeenCalled();
    });

    it('does NOT send email on duplicate RSVP (409 response)', async () => {
      const eventId = await seedEvent(testDb);
      const app = buildApp();

      // First RSVP
      await request(app).post('/rsvps').send({
        event_id: eventId,
        name: 'Alice',
        email: 'alice@example.com',
      });
      await new Promise((resolve) => setTimeout(resolve, 50));
      mockSendMail.mockClear();

      // Duplicate RSVP
      const res = await request(app).post('/rsvps').send({
        event_id: eventId,
        name: 'Alice',
        email: 'alice@example.com',
      });

      expect(res.status).toBe(409);
      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(mockSendMail).not.toHaveBeenCalled();
    });
  });
});
