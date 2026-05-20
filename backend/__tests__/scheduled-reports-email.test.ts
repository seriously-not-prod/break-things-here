/**
 * Integration test for scheduled-report email delivery (#814).
 *
 * Validates:
 *   - sendReportEmail sends via nodemailer transport
 *   - Delivery row created in scheduled_report_deliveries with correct status
 *   - Exponential backoff retry on transient failures (3 attempts)
 *   - Unsubscribe link present in email body
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { closeDatabase, getDatabase, initializeDatabase } from '../src/db/database.js';
import { resolveTestDatabaseUrl } from '../test-database-url.js';

const originalDatabaseUrl = process.env.DATABASE_URL;
const defaultDatabaseUrl = resolveTestDatabaseUrl();

if (!originalDatabaseUrl) {
  process.env.DATABASE_URL = defaultDatabaseUrl;
}

// Mock the mailer so no real SMTP is needed
const mockSendMail = vi.fn();
vi.mock('../src/utils/mailer.js', () => ({
  sendMail: (...args: unknown[]) => mockSendMail(...args),
}));

// Mock renderPayload to avoid needing real event data
const mockRenderPayload = vi.fn();
vi.mock('../src/controllers/reports-controller.js', () => ({
  renderPayload: (...args: unknown[]) => mockRenderPayload(...args),
}));

// Import after mocks are set up
const { sendReportEmail } = await import('../src/services/reports/send-email.js');

let ownerId = 0;
let eventId = 0;
let reportId = 0;

beforeAll(async (): Promise<void> => {
  await initializeDatabase();
  const db = getDatabase();

  const seedKey = `report-email-${Date.now()}`;
  const userResult = await db.run(
    `INSERT INTO users (email, password_hash, display_name, role_id)
     VALUES ($1, $2, $3, $4) RETURNING id`,
    [`${seedKey}@example.com`, 'hashed-password', 'Report Owner', 2],
  );
  ownerId = Number(userResult.lastID);

  const eventResult = await db.run(
    `INSERT INTO events (title, date, location, status, created_by)
     VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    ['Report Email Event', '2030-06-01', 'Test Venue', 'Active', ownerId],
  );
  eventId = Number(eventResult.lastID);
});

beforeEach(async (): Promise<void> => {
  mockSendMail.mockReset();
  mockRenderPayload.mockReset();
  mockRenderPayload.mockResolvedValue({ summary: 'test data' });

  const db = getDatabase();
  const result = await db.run(
    `INSERT INTO scheduled_reports (event_id, report_type, frequency, recipients, is_active, created_by, next_run_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
    [eventId, 'budget_summary', 'daily', JSON.stringify(['alice@example.com', 'bob@example.com']), true, ownerId, new Date().toISOString()],
  );
  reportId = Number(result.lastID);
});

afterEach(async (): Promise<void> => {
  const db = getDatabase();
  await db.run(`DELETE FROM scheduled_report_deliveries WHERE report_id = $1`, [reportId]);
  await db.run(`DELETE FROM scheduled_reports WHERE id = $1`, [reportId]);
});

afterAll(async (): Promise<void> => {
  const db = getDatabase();
  await db.run(`DELETE FROM events WHERE id = $1`, [eventId]);
  await db.run(`DELETE FROM users WHERE id = $1`, [ownerId]);
  await closeDatabase();
  if (originalDatabaseUrl) {
    process.env.DATABASE_URL = originalDatabaseUrl;
  }
});

describe('sendReportEmail', () => {
  it('should send emails to all recipients and record delivery row', async () => {
    mockSendMail.mockResolvedValue(undefined);

    await sendReportEmail({
      id: reportId,
      report_type: 'budget_summary',
      recipients: ['alice@example.com', 'bob@example.com'],
      event_id: eventId,
    });

    // Verify sendMail was called for each recipient
    expect(mockSendMail).toHaveBeenCalledTimes(2);
    expect(mockSendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'alice@example.com',
        subject: 'Scheduled Report: budget_summary',
      }),
    );
    expect(mockSendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'bob@example.com',
        subject: 'Scheduled Report: budget_summary',
      }),
    );

    // Verify delivery row was created
    const db = getDatabase();
    const delivery = await db.get<{ report_id: number; status: string; error_message: string | null }>(
      `SELECT report_id, status, error_message FROM scheduled_report_deliveries WHERE report_id = $1`,
      [reportId],
    );
    expect(delivery).toBeDefined();
    expect(delivery!.status).toBe('success');
    expect(delivery!.error_message).toBeNull();
  });

  it('should include unsubscribe link in email body', async () => {
    mockSendMail.mockResolvedValue(undefined);

    await sendReportEmail({
      id: reportId,
      report_type: 'budget_summary',
      recipients: ['alice@example.com'],
      event_id: eventId,
    });

    const callArgs = mockSendMail.mock.calls[0][0] as { text: string; html: string };
    expect(callArgs.text).toContain('unsubscribe');
    expect(callArgs.text).toContain(`/api/reports/${reportId}/unsubscribe`);
    expect(callArgs.html).toContain('Unsubscribe');
    expect(callArgs.html).toContain(`/api/reports/${reportId}/unsubscribe`);
  });

  it('should retry with exponential backoff on failure (3 attempts)', async () => {
    mockSendMail
      .mockRejectedValueOnce(new Error('Connection timeout'))
      .mockRejectedValueOnce(new Error('Connection timeout'))
      .mockResolvedValueOnce(undefined);

    await sendReportEmail({
      id: reportId,
      report_type: 'budget_summary',
      recipients: ['alice@example.com'],
      event_id: eventId,
    });

    // 3 attempts total: 2 failures + 1 success
    expect(mockSendMail).toHaveBeenCalledTimes(3);

    // Delivery should still be recorded as success
    const db = getDatabase();
    const delivery = await db.get<{ status: string }>(
      `SELECT status FROM scheduled_report_deliveries WHERE report_id = $1`,
      [reportId],
    );
    expect(delivery!.status).toBe('success');
  });

  it('should record failed status after exhausting all retry attempts', async () => {
    mockSendMail.mockRejectedValue(new Error('SMTP permanently down'));

    await sendReportEmail({
      id: reportId,
      report_type: 'budget_summary',
      recipients: ['alice@example.com'],
      event_id: eventId,
    });

    // 3 attempts total
    expect(mockSendMail).toHaveBeenCalledTimes(3);

    // Delivery row should reflect failure
    const db = getDatabase();
    const delivery = await db.get<{ status: string; error_message: string | null }>(
      `SELECT status, error_message FROM scheduled_report_deliveries WHERE report_id = $1`,
      [reportId],
    );
    expect(delivery!.status).toBe('failed');
    expect(delivery!.error_message).toContain('SMTP permanently down');
  });

  it('should skip report with no event_id', async () => {
    await sendReportEmail({
      id: reportId,
      report_type: 'budget_summary',
      recipients: ['alice@example.com'],
      event_id: null,
    });

    expect(mockSendMail).not.toHaveBeenCalled();
    expect(mockRenderPayload).not.toHaveBeenCalled();
  });

  it('should record failed status when payload rendering fails', async () => {
    mockRenderPayload.mockRejectedValue(new Error('Query failed'));
    mockSendMail.mockResolvedValue(undefined);

    await sendReportEmail({
      id: reportId,
      report_type: 'budget_summary',
      recipients: ['alice@example.com'],
      event_id: eventId,
    });

    // Email still sent (with the error message as its body). sendMail
    // succeeds on the first attempt, so the retry path is not exercised.
    // Production code only retries the mail send itself, not the payload
    // render (see services/reports/send-email.ts — renderPayload errors are
    // caught and converted into an email body, then sent once).
    expect(mockSendMail).toHaveBeenCalledTimes(1);
    const db = getDatabase();
    const delivery = await db.get<{ status: string; error_message: string | null }>(
      `SELECT status, error_message FROM scheduled_report_deliveries WHERE report_id = $1`,
      [reportId],
    );
    expect(delivery!.status).toBe('failed');
    expect(delivery!.error_message).toContain('Query failed');
  });
});
