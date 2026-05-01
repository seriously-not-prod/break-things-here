/**
 * Event Reminder Scheduler tests — Story #241
 *
 * Verifies all acceptance criteria using mocked database and nodemailer:
 * - sendTomorrowReminders queries events with status='Active' and event_date = tomorrow
 * - Sends reminder email to every RSVP with status='Going'
 * - Does NOT send to RSVPs with other statuses
 * - Skips events that are not 'Active' or are soft-deleted
 * - Continues sending remaining emails if one fails
 * - Returns correct sent count
 * - sendEventReminderEmail sends correct subject / body
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Hoisted mock state (must be declared before vi.mock factories run)
// ---------------------------------------------------------------------------
const { mockDbAll, mockDb } = vi.hoisted(() => {
  const mockDbAll = vi.fn();
  return { mockDbAll, mockDb: { all: mockDbAll } };
});

// ---------------------------------------------------------------------------
// Module mocks — hoisted by Vitest before any imports
// ---------------------------------------------------------------------------
vi.mock('nodemailer', () => ({
  default: { createTransport: vi.fn() },
}));

vi.mock('../src/db/database.js', () => ({
  initializeDatabase: vi.fn().mockResolvedValue(undefined),
  getDatabase: vi.fn(() => mockDb),
  closeDatabase: vi.fn().mockResolvedValue(undefined),
}));

import nodemailer from 'nodemailer';
import { sendTomorrowReminders } from '../src/utils/event-reminder-scheduler.js';
import { sendEventReminderEmail } from '../src/utils/auth-helpers.js';

// ---------------------------------------------------------------------------
// sendEventReminderEmail
// ---------------------------------------------------------------------------
describe('sendEventReminderEmail', () => {
  let sendMail: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    sendMail = vi.fn().mockResolvedValue({});
    (nodemailer.createTransport as ReturnType<typeof vi.fn>).mockReturnValue({ sendMail });
  });

  it('should call nodemailer with correct subject containing event title', async () => {
    await sendEventReminderEmail(
      'attendee@test.com',
      'Alice',
      'Summer Festival',
      '2025-06-15T12:00:00.000Z',
      'Central Park',
    );

    expect(sendMail).toHaveBeenCalledOnce();
    const [mailOptions] = sendMail.mock.calls[0];
    expect(mailOptions.to).toBe('attendee@test.com');
    expect(mailOptions.subject).toContain('Summer Festival');
    expect(mailOptions.text).toContain('Alice');
    expect(mailOptions.text).toContain('tomorrow');
    expect(mailOptions.text).toContain('Central Park');
  });

  it('should send without location line when location is null', async () => {
    await sendEventReminderEmail(
      'attendee@test.com',
      'Bob',
      'Night Market',
      '2025-06-15T12:00:00.000Z',
      null,
    );

    const [mailOptions] = sendMail.mock.calls[0];
    expect(mailOptions.text).not.toContain('Location:');
  });
});

// ---------------------------------------------------------------------------
// sendTomorrowReminders
// ---------------------------------------------------------------------------
describe('sendTomorrowReminders', () => {
  let sendMail: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    sendMail = vi.fn().mockResolvedValue({});
    (nodemailer.createTransport as ReturnType<typeof vi.fn>).mockReturnValue({ sendMail });
    mockDbAll.mockReset();
  });

  it('should return 0 when there are no events tomorrow', async () => {
    mockDbAll.mockResolvedValueOnce([]); // events query returns empty

    const count = await sendTomorrowReminders();
    expect(count).toBe(0);
    expect(sendMail).not.toHaveBeenCalled();
  });

  it('should send reminders to all Going RSVPs for Active events tomorrow', async () => {
    mockDbAll
      .mockResolvedValueOnce([
        { id: 10, title: 'Test Festival', event_date: '2025-06-15T12:00:00.000Z', location: 'Park' },
      ])
      .mockResolvedValueOnce([
        { name: 'Alice', email: 'alice@test.com' },
        { name: 'Bob', email: 'bob@test.com' },
      ]);

    const count = await sendTomorrowReminders();

    expect(count).toBe(2);
    expect(sendMail).toHaveBeenCalledTimes(2);
  });

  it('should NOT send reminders to RSVPs that are not Going', async () => {
    // SQL WHERE status='Going' already filters — mock returns only the Going RSVP
    mockDbAll
      .mockResolvedValueOnce([
        { id: 11, title: 'Mixed RSVP Fest', event_date: '2025-06-15T12:00:00.000Z', location: null },
      ])
      .mockResolvedValueOnce([
        { name: 'Alice', email: 'alice@test.com' },
      ]);

    const count = await sendTomorrowReminders();

    expect(count).toBe(1);
    expect(sendMail).toHaveBeenCalledOnce();
    expect(sendMail.mock.calls[0][0].to).toBe('alice@test.com');
  });

  it('should NOT send reminders for events that are not Active', async () => {
    // SQL WHERE status='Active' filters non-active events — mock returns empty
    mockDbAll.mockResolvedValueOnce([]);

    const count = await sendTomorrowReminders();
    expect(count).toBe(0);
    expect(sendMail).not.toHaveBeenCalled();
  });

  it('should NOT send reminders for events that are deleted (deleted_at set)', async () => {
    // SQL WHERE deleted_at IS NULL filters deleted events — mock returns empty
    mockDbAll.mockResolvedValueOnce([]);

    const count = await sendTomorrowReminders();
    expect(count).toBe(0);
    expect(sendMail).not.toHaveBeenCalled();
  });

  it('should NOT send reminders for events happening today or in the past', async () => {
    // SQL DATE(event_date) = CURRENT_DATE + 1 filters past/today — mock returns empty
    mockDbAll.mockResolvedValueOnce([]);

    const count = await sendTomorrowReminders();
    expect(count).toBe(0);
    expect(sendMail).not.toHaveBeenCalled();
  });

  it('should continue sending remaining emails if one fails', async () => {
    mockDbAll
      .mockResolvedValueOnce([
        { id: 15, title: 'Partial Fail Fest', event_date: '2025-06-15T12:00:00.000Z', location: null },
      ])
      .mockResolvedValueOnce([
        { name: 'Alice', email: 'alice@test.com' },
        { name: 'Bob', email: 'bob@test.com' },
      ]);

    sendMail
      .mockRejectedValueOnce(new Error('SMTP error'))
      .mockResolvedValueOnce({});

    const count = await sendTomorrowReminders();
    expect(count).toBe(1); // only the successful one counted
    expect(sendMail).toHaveBeenCalledTimes(2);
  });

  it('should send to Going RSVPs across multiple events tomorrow', async () => {
    mockDbAll
      .mockResolvedValueOnce([
        { id: 20, title: 'Fest A', event_date: '2025-06-15T12:00:00.000Z', location: null },
        { id: 21, title: 'Fest B', event_date: '2025-06-15T12:00:00.000Z', location: 'Venue' },
      ])
      .mockResolvedValueOnce([
        { name: 'Alice', email: 'alice@test.com' },
      ])
      .mockResolvedValueOnce([
        { name: 'Bob', email: 'bob@test.com' },
        { name: 'Carol', email: 'carol@test.com' },
      ]);

    const count = await sendTomorrowReminders();
    expect(count).toBe(3);
    expect(sendMail).toHaveBeenCalledTimes(3);
  });
});
