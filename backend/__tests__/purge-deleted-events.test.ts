/**
 * Purge deleted events background job — comprehensive tests (#778)
 *
 * Verifies:
 * - Events where archived_at < NOW() - INTERVAL 'retention' are deleted
 * - Retention window is configurable via PURGE_RETENTION_DAYS env var (default 30)
 * - Dry-run mode (PURGE_DRY_RUN=true) logs only without deleting
 * - audit_log records each purge with row count and event IDs
 * - Events cascade-deletes all related data (tasks, rsvps, galleries, etc.)
 * - No-op when no events match retention window
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createPostgresTestDatabase, type TestDatabase } from './helpers/postgres-test-db.js';
import { purgeDeletedEvents } from '../src/jobs/purge-deleted-events.js';

// ── Schema ───────────────────────────────────────────────────────────────────
const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS users (
  id             SERIAL PRIMARY KEY,
  email          TEXT UNIQUE NOT NULL DEFAULT 'test@test.com',
  password_hash  TEXT NOT NULL DEFAULT 'x',
  display_name   TEXT NOT NULL DEFAULT 'Test User',
  email_verified INTEGER DEFAULT 1,
  role_id        INTEGER DEFAULT 1,
  created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  deleted_at     TIMESTAMP
);

CREATE TABLE IF NOT EXISTS audit_log (
  id          SERIAL PRIMARY KEY,
  user_id     INTEGER REFERENCES users(id) ON DELETE SET NULL,
  email       TEXT,
  action      TEXT NOT NULL,
  description TEXT,
  context     JSONB,
  severity    TEXT DEFAULT 'INFO',
  ip_address  TEXT,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS events (
  id          SERIAL PRIMARY KEY,
  title       TEXT NOT NULL,
  date        TEXT NOT NULL DEFAULT '2024-01-01',
  location    TEXT NOT NULL DEFAULT 'Test Location',
  description TEXT,
  capacity    INTEGER,
  status      TEXT CHECK(status IN ('Draft', 'Active', 'Completed', 'Cancelled')) DEFAULT 'Draft',
  created_by  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  deleted_at  TIMESTAMP,
  archived_at TIMESTAMP
);

CREATE TABLE IF NOT EXISTS tasks (
  id               SERIAL PRIMARY KEY,
  event_id         INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  title            TEXT NOT NULL,
  notes            TEXT,
  assignee_name    TEXT,
  assigned_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  due_date         TEXT,
  status           TEXT CHECK(status IN ('Pending', 'In Progress', 'Blocked', 'Complete')) DEFAULT 'Pending',
  priority         TEXT CHECK(priority IN ('Low', 'Medium', 'High')) DEFAULT 'Medium',
  created_by       INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS rsvps (
  id              SERIAL PRIMARY KEY,
  event_id        INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  email           TEXT NOT NULL,
  guests          INTEGER DEFAULT 1,
  notes           TEXT,
  source          TEXT DEFAULT 'public',
  created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  checked_in      BOOLEAN DEFAULT FALSE,
  checked_in_at   TIMESTAMP,
  phone           TEXT,
  dietary_restriction TEXT DEFAULT 'None',
  accessibility_needs TEXT,
  plus_one        BOOLEAN DEFAULT FALSE,
  plus_one_name   TEXT,
  guest_group     TEXT,
  rsvp_deadline   TIMESTAMPTZ,
  status          TEXT DEFAULT 'Going',
  waitlist_position INTEGER,
  canonical_status TEXT,
  UNIQUE(event_id, email)
);

CREATE TABLE IF NOT EXISTS gallery (
  id          SERIAL PRIMARY KEY,
  event_id    INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  photo_url   TEXT NOT NULL,
  caption     TEXT,
  uploaded_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
`;

// ── Test database wiring ────────────────────────────────────────────────────
let testDb: TestDatabase;

vi.mock('../src/db/database.js', () => ({
  getDatabase: () => testDb,
}));

// ── Test suite ───────────────────────────────────────────────────────────────
describe('purgeDeletedEvents', () => {
  beforeEach(async () => {
    testDb = await createPostgresTestDatabase(SCHEMA_SQL);
  });

  afterEach(async () => {
    await testDb.close();
    vi.clearAllMocks();
    delete process.env.PURGE_RETENTION_DAYS;
    delete process.env.PURGE_DRY_RUN;
  });

  it('should delete events archived more than retention days ago', async () => {
    // Setup: Create a user
    const userRes = await testDb.run(
      'INSERT INTO users (email, password_hash, display_name) VALUES ($1, $2, $3) RETURNING id',
      ['test@test.com', 'hash', 'Test User'],
    );
    const userId = userRes.lastID!;

    // Create events: one old (beyond retention), one recent (within retention)
    const twoMonthsAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString();
    const fiveDaysAgo = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString();

    // Old archived event (should be purged)
    const oldEventRes = await testDb.run(
      `INSERT INTO events (title, date, location, created_by, archived_at)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      ['Old Event', '2024-01-01', 'Somewhere', userId, twoMonthsAgo],
    );
    const oldEventId = oldEventRes.lastID!;

    // Recent archived event (should NOT be purged)
    const recentEventRes = await testDb.run(
      `INSERT INTO events (title, date, location, created_by, archived_at)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      ['Recent Event', '2024-02-01', 'Somewhere', userId, fiveDaysAgo],
    );
    const recentEventId = recentEventRes.lastID!;

    // Active event without archive (should NOT be purged)
    const activeEventRes = await testDb.run(
      `INSERT INTO events (title, date, location, created_by, archived_at)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      ['Active Event', '2024-03-01', 'Somewhere', userId, null],
    );
    const activeEventId = activeEventRes.lastID!;

    // Execute purge with default 30-day retention
    await purgeDeletedEvents();

    // Verify: old event deleted, recent and active remain
    const oldEvent = await testDb.get('SELECT id FROM events WHERE id = $1', [oldEventId]);
    const recentEvent = await testDb.get('SELECT id FROM events WHERE id = $1', [recentEventId]);
    const activeEvent = await testDb.get('SELECT id FROM events WHERE id = $1', [activeEventId]);

    expect(oldEvent).toBeUndefined();
    expect(recentEvent).toBeDefined();
    expect(activeEvent).toBeDefined();

    // Verify audit log entry
    const auditEntry = await testDb.get(
      `SELECT * FROM audit_log WHERE action = 'PURGE_DELETED_EVENTS' ORDER BY created_at DESC LIMIT 1`,
    );
    expect(auditEntry).toBeDefined();
    expect((auditEntry as any)?.description).toContain('Permanently deleted 1');
  });

  it('should respect custom retention window from env var', async () => {
    process.env.PURGE_RETENTION_DAYS = '7'; // Only keep 7 days

    const userRes = await testDb.run(
      'INSERT INTO users (email, password_hash, display_name) VALUES ($1, $2, $3) RETURNING id',
      ['test@test.com', 'hash', 'Test User'],
    );
    const userId = userRes.lastID!;

    // Create events: 15 days old, 5 days old
    const fifteenDaysAgo = new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString();
    const fiveDaysAgo = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString();

    const oldEventRes = await testDb.run(
      `INSERT INTO events (title, date, location, created_by, archived_at)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      ['Old Event', '2024-01-01', 'Somewhere', userId, fifteenDaysAgo],
    );
    const oldEventId = oldEventRes.lastID!;

    const recentEventRes = await testDb.run(
      `INSERT INTO events (title, date, location, created_by, archived_at)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      ['Recent Event', '2024-02-01', 'Somewhere', userId, fiveDaysAgo],
    );
    const recentEventId = recentEventRes.lastID!;

    // Execute purge with 7-day retention
    await purgeDeletedEvents();

    // Both should be deleted since old > 7d and recent < 7d means only recent stays
    // Wait: 5 days ago is within 7 days, so recent should stay. 15 days old is beyond 7 days, so old should be deleted
    const oldEvent = await testDb.get('SELECT id FROM events WHERE id = $1', [oldEventId]);
    const recentEvent = await testDb.get('SELECT id FROM events WHERE id = $1', [recentEventId]);

    expect(oldEvent).toBeUndefined();
    expect(recentEvent).toBeDefined();
  });

  it('should support dry-run mode without deleting', async () => {
    process.env.PURGE_DRY_RUN = 'true';

    const userRes = await testDb.run(
      'INSERT INTO users (email, password_hash, display_name) VALUES ($1, $2, $3) RETURNING id',
      ['test@test.com', 'hash', 'Test User'],
    );
    const userId = userRes.lastID!;

    // Create old archived event
    const twoMonthsAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString();
    const eventRes = await testDb.run(
      `INSERT INTO events (title, date, location, created_by, archived_at)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      ['Dry-Run Event', '2024-01-01', 'Somewhere', userId, twoMonthsAgo],
    );
    const eventId = eventRes.lastID!;

    // Execute dry-run purge
    await purgeDeletedEvents();

    // Verify event still exists
    const event = await testDb.get('SELECT id FROM events WHERE id = $1', [eventId]);
    expect(event).toBeDefined();

    // Verify audit log entry for dry-run
    const auditEntry = await testDb.get(
      `SELECT * FROM audit_log WHERE action = 'PURGE_DELETED_EVENTS_DRY_RUN' ORDER BY created_at DESC LIMIT 1`,
    );
    expect(auditEntry).toBeDefined();
    expect((auditEntry as any)?.description).toContain('Would delete');
  });

  it('should cascade delete related data when purging events', async () => {
    const userRes = await testDb.run(
      'INSERT INTO users (email, password_hash, display_name) VALUES ($1, $2, $3) RETURNING id',
      ['test@test.com', 'hash', 'Test User'],
    );
    const userId = userRes.lastID!;

    // Create old archived event with related data
    const twoMonthsAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString();
    const eventRes = await testDb.run(
      `INSERT INTO events (title, date, location, created_by, archived_at)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      ['Event With Data', '2024-01-01', 'Somewhere', userId, twoMonthsAgo],
    );
    const eventId = eventRes.lastID!;

    // Add related data
    await testDb.run('INSERT INTO tasks (event_id, title, created_by) VALUES ($1, $2, $3)', [
      eventId,
      'Task for Event',
      userId,
    ]);
    await testDb.run('INSERT INTO rsvps (event_id, name, email) VALUES ($1, $2, $3)', [
      eventId,
      'Guest',
      'guest@test.com',
    ]);
    await testDb.run('INSERT INTO gallery (event_id, photo_url, uploaded_by) VALUES ($1, $2, $3)', [
      eventId,
      'http://example.com/photo.jpg',
      userId,
    ]);

    // Execute purge
    await purgeDeletedEvents();

    // Verify cascade deletes
    const taskCount = await testDb.get('SELECT COUNT(*) as count FROM tasks WHERE event_id = $1', [
      eventId,
    ]);
    const rsvpCount = await testDb.get('SELECT COUNT(*) as count FROM rsvps WHERE event_id = $1', [
      eventId,
    ]);
    const galleryCount = await testDb.get(
      'SELECT COUNT(*) as count FROM gallery WHERE event_id = $1',
      [eventId],
    );

    // Convert to number since count might come as string from postgres
    expect(parseInt((taskCount as any)?.count ?? 0)).toBe(0);
    expect(parseInt((rsvpCount as any)?.count ?? 0)).toBe(0);
    expect(parseInt((galleryCount as any)?.count ?? 0)).toBe(0);
  });

  it('should handle no events to purge gracefully', async () => {
    // Execute purge with no events
    await purgeDeletedEvents();

    // Should not create audit log entry or crash
    const auditEntry = await testDb.get(
      `SELECT * FROM audit_log WHERE action LIKE 'PURGE_DELETED_EVENTS%'`,
    );
    expect(auditEntry).toBeUndefined();
  });

  it('should record event IDs in audit log context', async () => {
    const userRes = await testDb.run(
      'INSERT INTO users (email, password_hash, display_name) VALUES ($1, $2, $3) RETURNING id',
      ['test@test.com', 'hash', 'Test User'],
    );
    const userId = userRes.lastID!;

    // Create multiple old archived events
    const twoMonthsAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString();

    const event1 = await testDb.run(
      `INSERT INTO events (title, date, location, created_by, archived_at)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      ['Event 1', '2024-01-01', 'Somewhere', userId, twoMonthsAgo],
    );
    const event2 = await testDb.run(
      `INSERT INTO events (title, date, location, created_by, archived_at)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      ['Event 2', '2024-01-02', 'Somewhere', userId, twoMonthsAgo],
    );

    const id1 = event1.lastID!;
    const id2 = event2.lastID!;

    // Execute purge
    await purgeDeletedEvents();

    // Verify audit log contains event IDs
    const auditEntry = await testDb.get(
      `SELECT context FROM audit_log WHERE action = 'PURGE_DELETED_EVENTS' ORDER BY created_at DESC LIMIT 1`,
    );

    expect(auditEntry).toBeDefined();
    const context = (auditEntry as any)?.context;
    if (typeof context === 'string') {
      const parsed = JSON.parse(context);
      expect(parsed.event_ids).toContain(id1);
      expect(parsed.event_ids).toContain(id2);
      expect(parsed.count).toBe(2);
    }
  });

  it('should handle boundary conditions (older than cutoff)', async () => {
    const userRes = await testDb.run(
      'INSERT INTO users (email, password_hash, display_name) VALUES ($1, $2, $3) RETURNING id',
      ['test@test.com', 'hash', 'Test User'],
    );
    const userId = userRes.lastID!;

    // Create event archived well before retention window (should be deleted)
    const fortyDaysAgo = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000).toISOString();

    const oldEventRes = await testDb.run(
      `INSERT INTO events (title, date, location, created_by, archived_at)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      ['Old Event', '2024-01-01', 'Somewhere', userId, fortyDaysAgo],
    );
    const oldEventId = oldEventRes.lastID!;

    // Create event archived recently (should remain with default 30-day retention)
    const fiveDaysAgo = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString();

    const recentEventRes = await testDb.run(
      `INSERT INTO events (title, date, location, created_by, archived_at)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      ['Recent Event', '2024-01-01', 'Somewhere', userId, fiveDaysAgo],
    );
    const recentEventId = recentEventRes.lastID!;

    // Execute purge
    await purgeDeletedEvents();

    // Old event should be deleted, recent should remain
    const oldEvent = await testDb.get('SELECT id FROM events WHERE id = $1', [oldEventId]);
    const recentEvent = await testDb.get('SELECT id FROM events WHERE id = $1', [recentEventId]);

    expect(oldEvent).toBeUndefined();
    expect(recentEvent).toBeDefined();
  });

  it('should include retention_days in audit log context', async () => {
    process.env.PURGE_RETENTION_DAYS = '14';

    const userRes = await testDb.run(
      'INSERT INTO users (email, password_hash, display_name) VALUES ($1, $2, $3) RETURNING id',
      ['test@test.com', 'hash', 'Test User'],
    );
    const userId = userRes.lastID!;

    // Create old event
    const threeWeeksAgo = new Date(Date.now() - 21 * 24 * 60 * 60 * 1000).toISOString();
    await testDb.run(
      `INSERT INTO events (title, date, location, created_by, archived_at)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      ['Old Event', '2024-01-01', 'Somewhere', userId, threeWeeksAgo],
    );

    // Execute purge
    await purgeDeletedEvents();

    // Verify audit log context includes retention_days
    const auditEntry = await testDb.get(
      `SELECT context FROM audit_log WHERE action = 'PURGE_DELETED_EVENTS' ORDER BY created_at DESC LIMIT 1`,
    );

    expect(auditEntry).toBeDefined();
    const context = (auditEntry as any)?.context;
    if (typeof context === 'string') {
      const parsed = JSON.parse(context);
      expect(parsed.retention_days).toBe(14);
    }
  });
});
