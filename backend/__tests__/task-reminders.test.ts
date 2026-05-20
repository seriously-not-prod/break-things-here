/**
 * Task reminder + escalation background job — integration tests (#793).
 *
 * Verifies:
 *   - Reminders sent at configurable offsets before due date
 *   - De-duplication: same reminder not sent twice
 *   - Escalation fires for tasks overdue >24 h
 *   - Escalation respects task_escalation_rules custom targets
 *   - User notification preferences are respected
 *   - Multi-assignee support via task_assignees
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
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
CREATE TABLE IF NOT EXISTS events (
  id          SERIAL PRIMARY KEY,
  title       TEXT NOT NULL,
  date        TEXT,
  location    TEXT,
  status      TEXT DEFAULT 'Active',
  created_by  INTEGER REFERENCES users(id) ON DELETE SET NULL,
  deleted_at  TIMESTAMP,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS tasks (
  id               SERIAL PRIMARY KEY,
  event_id         INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  title            TEXT NOT NULL,
  notes            TEXT,
  assignee_name    TEXT,
  assigned_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  due_date         TEXT,
  status           TEXT CHECK(status IN ('Pending','In Progress','Blocked','Complete')) DEFAULT 'Pending',
  priority         TEXT CHECK(priority IN ('Low','Medium','High')) DEFAULT 'Medium',
  created_by       INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS task_assignees (
  task_id     INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  is_primary  BOOLEAN NOT NULL DEFAULT FALSE,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (task_id, user_id)
);
CREATE TABLE IF NOT EXISTS task_escalation_rules (
  id                   SERIAL PRIMARY KEY,
  event_id             INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  status               TEXT NOT NULL,
  threshold_hours      INTEGER NOT NULL CHECK (threshold_hours > 0),
  escalate_to_user_id  INTEGER REFERENCES users(id) ON DELETE SET NULL,
  active               BOOLEAN NOT NULL DEFAULT TRUE,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
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

// ── Test database wiring ─────────────────────────────────────────────────────

let testDb: TestDatabase;

vi.mock('../src/db/database.js', () => ({
  getDatabase: () => testDb,
  initializeDatabase: async () => testDb,
}));

// Mock mailer — no real SMTP in tests
const mockSendMail = vi.fn();
vi.mock('../src/utils/mailer.js', () => ({
  sendMail: (...args: unknown[]) => mockSendMail(...args),
}));

// Import after mocks
const { sendTaskReminders, escalateOverdueTasks, runTaskReminderJob } =
  await import('../src/jobs/task-reminders.js');

// ── Seed data IDs ────────────────────────────────────────────────────────────

let organizerId: number;
let assigneeId: number;
let assignee2Id: number;
let escalateUserId: number;
let eventId: number;

// ── Lifecycle ────────────────────────────────────────────────────────────────

beforeAll(async () => {
  testDb = await createPostgresTestDatabase(SCHEMA_SQL);

  const org = await testDb.run(
    'INSERT INTO users (email, display_name) VALUES ($1, $2) RETURNING id',
    ['organizer@example.com', 'Organizer'],
  );
  organizerId = Number(org.lastID);

  const a1 = await testDb.run(
    'INSERT INTO users (email, display_name) VALUES ($1, $2) RETURNING id',
    ['assignee1@example.com', 'Assignee One'],
  );
  assigneeId = Number(a1.lastID);

  const a2 = await testDb.run(
    'INSERT INTO users (email, display_name) VALUES ($1, $2) RETURNING id',
    ['assignee2@example.com', 'Assignee Two'],
  );
  assignee2Id = Number(a2.lastID);

  const esc = await testDb.run(
    'INSERT INTO users (email, display_name) VALUES ($1, $2) RETURNING id',
    ['escalate-to@example.com', 'Escalation Target'],
  );
  escalateUserId = Number(esc.lastID);

  const ev = await testDb.run(
    'INSERT INTO events (title, date, location, status, created_by) VALUES ($1, $2, $3, $4, $5) RETURNING id',
    ['Reminder Test Event', '2030-06-01', 'Test Venue', 'Active', organizerId],
  );
  eventId = Number(ev.lastID);
});

beforeEach(() => {
  mockSendMail.mockReset();
  mockSendMail.mockResolvedValue(undefined);
});

afterEach(async () => {
  await testDb.exec('DELETE FROM task_reminder_log');
  await testDb.exec('DELETE FROM task_assignees');
  await testDb.exec('DELETE FROM task_escalation_rules');
  await testDb.exec('DELETE FROM notification_preferences');
  await testDb.exec('DELETE FROM notifications');
  await testDb.exec('DELETE FROM tasks');
});

afterAll(async () => {
  await testDb.exec('DELETE FROM events');
  await testDb.exec('DELETE FROM users');
  await testDb.close();
});

// ── Helpers ──────────────────────────────────────────────────────────────────

function hoursFromNow(hours: number): string {
  return new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
}

function hoursAgo(hours: number): string {
  return new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
}

async function createTask(
  title: string,
  dueDate: string,
  assignedUserId: number | null = null,
  status: string = 'Pending',
): Promise<number> {
  const result = await testDb.run(
    'INSERT INTO tasks (event_id, title, due_date, assigned_user_id, status, created_by) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id',
    [eventId, title, dueDate, assignedUserId, status, organizerId],
  );
  return Number(result.lastID);
}

async function getNotifications(
  userId: number,
): Promise<Array<{ title: string; notification_type: string }>> {
  return testDb.all(
    'SELECT title, notification_type FROM notifications WHERE user_id = $1 ORDER BY created_at',
    [userId],
  );
}

// ── Tests: Reminders ─────────────────────────────────────────────────────────

describe('sendTaskReminders', () => {
  it('should send a 24h reminder for a task due within 24 hours', async () => {
    await createTask('Setup stage', hoursFromNow(12), assigneeId);
    await sendTaskReminders();
    const notifs = await getNotifications(assigneeId);
    expect(notifs).toHaveLength(1);
    expect(notifs[0].notification_type).toBe('task_due');
    expect(notifs[0].title).toContain('Setup stage');
    expect(mockSendMail).toHaveBeenCalledTimes(1);
  });

  it('should send a 2h reminder for a task due within 2 hours', async () => {
    await createTask('Sound check', hoursFromNow(1), assigneeId);
    await sendTaskReminders();
    const notifs = await getNotifications(assigneeId);
    expect(notifs.length).toBeGreaterThanOrEqual(1);
    expect(notifs.some((n) => n.title.includes('2h'))).toBe(true);
  });

  it('should not send reminders for completed tasks', async () => {
    await createTask('Done task', hoursFromNow(12), assigneeId, 'Complete');
    await sendTaskReminders();
    const notifs = await getNotifications(assigneeId);
    expect(notifs).toHaveLength(0);
    expect(mockSendMail).not.toHaveBeenCalled();
  });

  it('should de-duplicate — same reminder not sent twice', async () => {
    await createTask('Duplicate test', hoursFromNow(12), assigneeId);
    await sendTaskReminders();
    await sendTaskReminders();
    const notifs = await getNotifications(assigneeId);
    expect(notifs).toHaveLength(1);
    expect(mockSendMail).toHaveBeenCalledTimes(1);
  });

  it('should notify all assignees via task_assignees table', async () => {
    const taskId = await createTask('Multi-assignee task', hoursFromNow(12));
    await testDb.run(
      'INSERT INTO task_assignees (task_id, user_id, is_primary) VALUES ($1, $2, $3)',
      [taskId, assigneeId, true],
    );
    await testDb.run(
      'INSERT INTO task_assignees (task_id, user_id, is_primary) VALUES ($1, $2, $3)',
      [taskId, assignee2Id, false],
    );
    await sendTaskReminders();
    const notifs1 = await getNotifications(assigneeId);
    const notifs2 = await getNotifications(assignee2Id);
    expect(notifs1).toHaveLength(1);
    expect(notifs2).toHaveLength(1);
    expect(mockSendMail).toHaveBeenCalledTimes(2);
  });

  it('should respect user notification preferences — skip email when disabled', async () => {
    await createTask('Preference test', hoursFromNow(12), assigneeId);
    await testDb.run(
      'INSERT INTO notification_preferences (user_id, channel, category, enabled) VALUES ($1, $2, $3, $4)',
      [assigneeId, 'email', 'task_due', false],
    );
    await sendTaskReminders();
    const notifs = await getNotifications(assigneeId);
    expect(notifs).toHaveLength(1);
    expect(mockSendMail).not.toHaveBeenCalled();
  });

  it('should not send reminders for tasks without due dates', async () => {
    await testDb.run(
      'INSERT INTO tasks (event_id, title, assigned_user_id, status, created_by) VALUES ($1, $2, $3, $4, $5)',
      [eventId, 'No due date', assigneeId, 'Pending', organizerId],
    );
    await sendTaskReminders();
    const notifs = await getNotifications(assigneeId);
    expect(notifs).toHaveLength(0);
  });
});

// ── Tests: Escalation ────────────────────────────────────────────────────────

describe('escalateOverdueTasks', () => {
  it('should escalate a task overdue by >24h to the event organizer', async () => {
    await createTask('Overdue task', hoursAgo(30), assigneeId);
    await escalateOverdueTasks();
    const notifs = await getNotifications(organizerId);
    expect(notifs).toHaveLength(1);
    expect(notifs[0].notification_type).toBe('task_overdue');
    expect(notifs[0].title).toContain('Overdue task');
    expect(mockSendMail).toHaveBeenCalledTimes(1);
    expect(mockSendMail).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'organizer@example.com' }),
    );
  });

  it('should not escalate tasks overdue by less than threshold', async () => {
    await createTask('Recently overdue', hoursAgo(12), assigneeId);
    await escalateOverdueTasks();
    const notifs = await getNotifications(organizerId);
    expect(notifs).toHaveLength(0);
    expect(mockSendMail).not.toHaveBeenCalled();
  });

  it('should not escalate completed tasks', async () => {
    await createTask('Completed overdue', hoursAgo(48), assigneeId, 'Complete');
    await escalateOverdueTasks();
    const notifs = await getNotifications(organizerId);
    expect(notifs).toHaveLength(0);
  });

  it('should de-duplicate escalation — not sent twice', async () => {
    await createTask('Escalation dedup', hoursAgo(30), assigneeId);
    await escalateOverdueTasks();
    await escalateOverdueTasks();
    const notifs = await getNotifications(organizerId);
    expect(notifs).toHaveLength(1);
    expect(mockSendMail).toHaveBeenCalledTimes(1);
  });

  it('should escalate to custom user from task_escalation_rules', async () => {
    await createTask('Custom escalation', hoursAgo(30), assigneeId);
    await testDb.run(
      'INSERT INTO task_escalation_rules (event_id, status, threshold_hours, escalate_to_user_id, active) VALUES ($1, $2, $3, $4, $5)',
      [eventId, 'Pending', 24, escalateUserId, true],
    );
    await escalateOverdueTasks();
    const escalateNotifs = await getNotifications(escalateUserId);
    expect(escalateNotifs).toHaveLength(1);
    expect(escalateNotifs[0].notification_type).toBe('task_overdue');
    expect(mockSendMail).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'escalate-to@example.com' }),
    );
  });

  it('should respect escalation rule threshold_hours', async () => {
    await createTask('Not yet escalatable', hoursAgo(10), assigneeId);
    await testDb.run(
      'INSERT INTO task_escalation_rules (event_id, status, threshold_hours, escalate_to_user_id, active) VALUES ($1, $2, $3, $4, $5)',
      [eventId, 'Pending', 12, escalateUserId, true],
    );
    await escalateOverdueTasks();
    const notifs = await getNotifications(escalateUserId);
    expect(notifs).toHaveLength(0);
  });
});

// ── Tests: Combined job ──────────────────────────────────────────────────────

describe('runTaskReminderJob', () => {
  it('should run both reminders and escalation in a single pass', async () => {
    await createTask('Upcoming task', hoursFromNow(12), assigneeId);
    await createTask('Old overdue task', hoursAgo(48), assigneeId);
    await runTaskReminderJob();
    const assigneeNotifs = await getNotifications(assigneeId);
    expect(assigneeNotifs.length).toBeGreaterThanOrEqual(1);
    const orgNotifs = await getNotifications(organizerId);
    expect(orgNotifs.length).toBeGreaterThanOrEqual(1);
  });
});
