/**
 * Integration test for scheduled-report email delivery (#814).
 *
 * Validates:
 *   - sendReportEmail sends via nodemailer transport
 *   - Delivery row created in scheduled_report_deliveries with correct status
 *   - Exponential backoff retry on transient failures (3 attempts)
 *   - Unsubscribe link present in email body
 *
 * Root cause of previous flakiness (issue #819):
 *   1. Used initializeDatabase() which runs ALL pending migrations against the
 *      shared test database. A migration adding a CHECK constraint to the
 *      existing `expenses` table failed when seed data violated the new rule,
 *      crashing beforeAll and skipping all 6 tests on every developer machine
 *      that already had test data.  Fixed by switching to the isolated
 *      per-describe PostgreSQL schema pattern (createPostgresTestDatabase).
 *   2. sendWithRetry uses real setTimeout delays (1 s, 2 s) between attempts.
 *      The two retry tests now use vi.useFakeTimers() + vi.runAllTimersAsync()
 *      so backoff delays are instant and cannot trigger CI timeouts.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPostgresTestDatabase, type TestDatabase } from './helpers/postgres-test-db.js';

// ---------------------------------------------------------------------------
// Isolated test schema — avoids initializeDatabase() migration side-effects.
// audit_log included without FK so logAuditEvent() does not write to the
// shared public.audit_log and trip a FK violation.
// ---------------------------------------------------------------------------
const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS roles (
  id   SERIAL PRIMARY KEY,
  name TEXT UNIQUE NOT NULL
);
CREATE TABLE IF NOT EXISTS users (
  id             SERIAL PRIMARY KEY,
  email          TEXT UNIQUE NOT NULL,
  password_hash  TEXT NOT NULL DEFAULT 'x',
  display_name   TEXT NOT NULL DEFAULT '',
  email_verified INTEGER DEFAULT 1,
  role_id        INTEGER DEFAULT 2,
  created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  deleted_at     TIMESTAMP
);
CREATE TABLE IF NOT EXISTS events (
  id          SERIAL PRIMARY KEY,
  title       TEXT NOT NULL,
  date        TEXT NOT NULL DEFAULT '',
  location    TEXT,
  status      TEXT NOT NULL DEFAULT 'Active',
  created_by  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  deleted_at  TIMESTAMP
);
CREATE TABLE IF NOT EXISTS scheduled_reports (
  id           SERIAL PRIMARY KEY,
  event_id     INTEGER REFERENCES events(id) ON DELETE CASCADE,
  report_type  TEXT NOT NULL,
  frequency    TEXT NOT NULL,
  recipients   JSONB NOT NULL DEFAULT '[]',
  filters      JSONB,
  is_active    BOOLEAN DEFAULT TRUE,
  created_by   INTEGER REFERENCES users(id) ON DELETE SET NULL,
  next_run_at  TIMESTAMP,
  last_run_at  TIMESTAMP,
  created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS scheduled_report_deliveries (
  id            SERIAL PRIMARY KEY,
  report_id     INTEGER REFERENCES scheduled_reports(id) ON DELETE CASCADE,
  recipients    JSONB,
  status        TEXT NOT NULL DEFAULT 'success',
  error_message TEXT,
  delivered_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS audit_log (
  id          SERIAL PRIMARY KEY,
  user_id     INTEGER,
  email       TEXT,
  action      TEXT NOT NULL,
  description TEXT,
  ip_address  TEXT,
  actor_id    INTEGER,
  target_type TEXT,
  target_id   TEXT,
  context     JSONB,
  severity    TEXT DEFAULT 'INFO',
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO roles (id, name) VALUES (1, 'Attendee'), (2, 'Organizer'), (3, 'Admin')
ON CONFLICT (id) DO NOTHING;
`;

// ---------------------------------------------------------------------------
// Mocks (registered before any import that pulls in production modules)
// ---------------------------------------------------------------------------

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

// Wire isolated DB — must be declared before the db/database mock so the
// factory closure captures the mutable binding.
let testDb: TestDatabase;

vi.mock('../src/db/database.js', () => ({
  getDatabase: () => testDb,
  initializeDatabase: async () => testDb,
  closeDatabase: async () => {
    /* no-op — testDb.close() handles cleanup */
  },
}));

// Import service AFTER all mocks are registered
const { sendReportEmail } = await import('../src/services/reports/send-email.js');

// ---------------------------------------------------------------------------
// Test state
// ---------------------------------------------------------------------------
let ownerId = 0;
let eventId = 0;
let reportId = 0;

beforeAll(async (): Promise<void> => {
  testDb = await createPostgresTestDatabase(SCHEMA_SQL);

  const userResult = await testDb.run(
    `INSERT INTO users (email, password_hash, display_name, role_id)
     VALUES ($1, $2, $3, $4) RETURNING id`,
    ['report-owner@example.com', 'hashed-password', 'Report Owner', 2],
  );
  ownerId = Number(userResult.lastID);

  const eventResult = await testDb.run(
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

  const result = await testDb.run(
    `INSERT INTO scheduled_reports (event_id, report_type, frequency, recipients, is_active, created_by, next_run_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
    [
      eventId,
      'budget_summary',
      'daily',
      JSON.stringify(['alice@example.com', 'bob@example.com']),
      true,
      ownerId,
      new Date().toISOString(),
    ],
  );
  reportId = Number(result.lastID);
});

afterEach(async (): Promise<void> => {
  await testDb.run(`DELETE FROM scheduled_report_deliveries WHERE report_id = $1`, [reportId]);
  await testDb.run(`DELETE FROM scheduled_reports WHERE id = $1`, [reportId]);
});

afterAll(async (): Promise<void> => {
  await testDb?.close();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
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
    const delivery = await testDb.get<{
      report_id: number;
      status: string;
      error_message: string | null;
    }>(
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
    // Root cause of flakiness: sendWithRetry sleeps 1 s then 2 s between
    // attempts using real setTimeout. Use fake timers so the delays are
    // instant and the test does not add ~3 s to every CI run.
    vi.useFakeTimers();
    try {
      mockSendMail
        .mockRejectedValueOnce(new Error('Connection timeout'))
        .mockRejectedValueOnce(new Error('Connection timeout'))
        .mockResolvedValueOnce(undefined);

      const sendPromise = sendReportEmail({
        id: reportId,
        report_type: 'budget_summary',
        recipients: ['alice@example.com'],
        event_id: eventId,
      });

      // Advance all pending timers (backoff delays) so the retries fire
      // immediately, then await the completed promise.
      await vi.runAllTimersAsync();
      await sendPromise;
    } finally {
      vi.useRealTimers();
    }

    // 3 attempts total: 2 failures + 1 success
    expect(mockSendMail).toHaveBeenCalledTimes(3);

    // Delivery should still be recorded as success
    const delivery = await testDb.get<{ status: string }>(
      `SELECT status FROM scheduled_report_deliveries WHERE report_id = $1`,
      [reportId],
    );
    expect(delivery!.status).toBe('success');
  });

  it('should record failed status after exhausting all retry attempts', async () => {
    // Root cause of flakiness: sendWithRetry exhausts 3 attempts with real
    // setTimeout delays (1 s + 2 s). Fake timers make the test instant.
    vi.useFakeTimers();
    try {
      mockSendMail.mockRejectedValue(new Error('SMTP permanently down'));

      const sendPromise = sendReportEmail({
        id: reportId,
        report_type: 'budget_summary',
        recipients: ['alice@example.com'],
        event_id: eventId,
      });

      await vi.runAllTimersAsync();
      await sendPromise;
    } finally {
      vi.useRealTimers();
    }

    // 3 attempts total
    expect(mockSendMail).toHaveBeenCalledTimes(3);

    // Delivery row should reflect failure
    const delivery = await testDb.get<{ status: string; error_message: string | null }>(
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
    const delivery = await testDb.get<{ status: string; error_message: string | null }>(
      `SELECT status, error_message FROM scheduled_report_deliveries WHERE report_id = $1`,
      [reportId],
    );
    expect(delivery!.status).toBe('failed');
    expect(delivery!.error_message).toContain('Query failed');
  });
});
