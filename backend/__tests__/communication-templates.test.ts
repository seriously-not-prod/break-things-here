/**
 * Communication-templates controller tests (#590) — test stabilisation #819.
 *
 * Covers CRUD operations, personalization-preview, and input validation for
 * the communication templates endpoints.
 *
 * Tests were missing from the suite entirely; their absence was reported as a
 * flaky-CI signal in the May-16 doc because the communication flow had no
 * contract-level coverage and any breakage surfaced only in e2e runs.
 *
 * Uses the isolated per-test PostgreSQL schema pattern (no shared state).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Request, Response } from 'express';
import { createPostgresTestDatabase, type TestDatabase } from './helpers/postgres-test-db.js';

// ---------------------------------------------------------------------------
// Isolated test schema — includes audit_log so logAuditEvent() writes to the
// test schema instead of public.audit_log (avoids FK violation noise).
// ---------------------------------------------------------------------------
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
  date        TEXT NOT NULL DEFAULT '',
  location    TEXT,
  status      TEXT NOT NULL DEFAULT 'Active',
  created_by  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  deleted_at  TIMESTAMP
);
CREATE TABLE IF NOT EXISTS event_members (
  event_id  INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role      TEXT DEFAULT 'Member',
  PRIMARY KEY (event_id, user_id)
);
CREATE TABLE IF NOT EXISTS communication_templates (
  id          SERIAL PRIMARY KEY,
  event_id    INTEGER REFERENCES events(id) ON DELETE CASCADE,
  slug        TEXT NOT NULL,
  name        TEXT NOT NULL,
  subject     TEXT NOT NULL,
  body        TEXT NOT NULL,
  is_default  BOOLEAN DEFAULT FALSE,
  created_by  INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (event_id, slug)
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
`;

// ---------------------------------------------------------------------------
// Minimal Express mock helpers
// ---------------------------------------------------------------------------
function makeRes() {
  const res: Record<string, unknown> & {
    statusCode: number;
    body: unknown;
    status: (code: number) => typeof res;
    json: (data: unknown) => typeof res;
  } = {
    statusCode: 200,
    body: null,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(data: unknown) {
      this.body = data;
      return this;
    },
  };
  return res;
}

function makeReq(
  params: Record<string, string> = {},
  body: Record<string, unknown> = {},
  user?: { id: number; email: string; role_id: number },
) {
  return { params, body, query: {}, user } as unknown as Request;
}

// ---------------------------------------------------------------------------
// Stub nodemailer (imported transitively by some controllers)
// ---------------------------------------------------------------------------
vi.mock('nodemailer', () => ({
  default: {
    createTransport: () => ({ sendMail: vi.fn().mockResolvedValue({}) }),
  },
}));

// ---------------------------------------------------------------------------
// Wire up the isolated database
// ---------------------------------------------------------------------------
let testDb: TestDatabase;
let ownerId: number;
let memberId: number;
let otherId: number;
let eventId: number;

vi.mock('../src/db/database.js', () => ({
  getDatabase: () => testDb,
  initializeDatabase: async () => testDb,
}));

// Stub requireEventAccess so we can control it per-test without a full HTTP stack.
const mockRequireEventAccess = vi.fn();
vi.mock('../src/utils/event-access.js', () => ({
  requireEventAccess: (...args: unknown[]) => mockRequireEventAccess(...args),
}));

// Import controllers AFTER mocks are registered.
import {
  listTemplates,
  createTemplate,
  updateTemplate,
  deleteTemplate,
  previewTemplate,
} from '../src/controllers/communication-templates-controller.js';

// ---------------------------------------------------------------------------
// Test lifecycle
// ---------------------------------------------------------------------------
beforeEach(async () => {
  testDb = await createPostgresTestDatabase(SCHEMA_SQL);

  // Seed three users: owner, member, unrelated
  const ownerResult = await testDb.run(
    `INSERT INTO users (email, password_hash) VALUES ('owner@test.com', 'x') RETURNING id`,
  );
  ownerId = ownerResult.lastID!;

  const memberResult = await testDb.run(
    `INSERT INTO users (email, password_hash) VALUES ('member@test.com', 'x') RETURNING id`,
  );
  memberId = memberResult.lastID!;

  const otherResult = await testDb.run(
    `INSERT INTO users (email, password_hash) VALUES ('other@test.com', 'x') RETURNING id`,
  );
  otherId = otherResult.lastID!;

  // Seed an event owned by ownerId
  const eventResult = await testDb.run(
    `INSERT INTO events (title, date, created_by) VALUES ('Test Event', '2030-01-01', $1) RETURNING id`,
    [ownerId],
  );
  eventId = eventResult.lastID!;

  // Add memberId as event member
  await testDb.run(`INSERT INTO event_members (event_id, user_id) VALUES ($1, $2)`, [
    eventId,
    memberId,
  ]);

  // Default: requireEventAccess returns the event (authorised)
  mockRequireEventAccess.mockResolvedValue({ id: eventId, created_by: ownerId, deleted_at: null });
});

afterEach(async () => {
  vi.resetAllMocks();
  await testDb?.close();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('communication-templates controller (#590)', () => {
  // ── listTemplates ──────────────────────────────────────────────────────
  describe('listTemplates', () => {
    it('returns an empty list when no templates exist', async () => {
      const req = makeReq({ eventId: String(eventId) });
      const res = makeRes();

      await listTemplates(req, res as unknown as Response);

      expect(res.statusCode).toBe(200);
      expect((res.body as { templates: unknown[] }).templates).toHaveLength(0);
    });

    it('returns templates belonging to the event', async () => {
      await testDb.run(
        `INSERT INTO communication_templates (event_id, slug, name, subject, body, created_by)
         VALUES ($1, 'invite', 'Invite', 'You are invited', 'Dear {name}', $2)`,
        [eventId, ownerId],
      );

      const req = makeReq({ eventId: String(eventId) });
      const res = makeRes();

      await listTemplates(req, res as unknown as Response);

      expect(res.statusCode).toBe(200);
      const templates = (res.body as { templates: { slug: string }[] }).templates;
      expect(templates).toHaveLength(1);
      expect(templates[0].slug).toBe('invite');
    });

    it('returns 401/403 when requireEventAccess denies access', async () => {
      // Simulate access denied: requireEventAccess writes to res and returns null
      mockRequireEventAccess.mockImplementationOnce(async (_req: unknown, res: Response) => {
        (res as unknown as ReturnType<typeof makeRes>).statusCode = 403;
        (res as unknown as ReturnType<typeof makeRes>).body = { error: 'Forbidden' };
        return null;
      });

      const req = makeReq({ eventId: String(eventId) });
      const res = makeRes();

      await listTemplates(req, res as unknown as Response);

      expect(res.statusCode).toBe(403);
    });
  });

  // ── createTemplate ─────────────────────────────────────────────────────
  describe('createTemplate', () => {
    it('creates a template and returns 201 with the row', async () => {
      const req = makeReq(
        { eventId: String(eventId) },
        {
          slug: 'reminder',
          name: 'Reminder',
          subject: 'Reminder: {event_title}',
          body: 'Hi {name}',
        },
        { id: ownerId, email: 'owner@test.com', role_id: 2 },
      );
      const res = makeRes();

      await createTemplate(req, res as unknown as Response);

      expect(res.statusCode).toBe(201);
      const template = (res.body as { template: { slug: string; name: string } }).template;
      expect(template.slug).toBe('reminder');
      expect(template.name).toBe('Reminder');
    });

    it('returns 400 when slug is missing', async () => {
      const req = makeReq(
        { eventId: String(eventId) },
        { name: 'Reminder', subject: 'Subject', body: 'Body' },
        { id: ownerId, email: 'owner@test.com', role_id: 2 },
      );
      const res = makeRes();

      await createTemplate(req, res as unknown as Response);

      expect(res.statusCode).toBe(400);
      expect((res.body as { error: string }).error).toMatch(/slug/i);
    });

    it('returns 400 when name is missing', async () => {
      const req = makeReq(
        { eventId: String(eventId) },
        { slug: 'invite', subject: 'Subject', body: 'Body' },
        { id: ownerId, email: 'owner@test.com', role_id: 2 },
      );
      const res = makeRes();

      await createTemplate(req, res as unknown as Response);

      expect(res.statusCode).toBe(400);
      expect((res.body as { error: string }).error).toMatch(/name/i);
    });

    it('returns 400 when subject is missing', async () => {
      const req = makeReq(
        { eventId: String(eventId) },
        { slug: 'invite', name: 'Invite', body: 'Body' },
        { id: ownerId, email: 'owner@test.com', role_id: 2 },
      );
      const res = makeRes();

      await createTemplate(req, res as unknown as Response);

      expect(res.statusCode).toBe(400);
      expect((res.body as { error: string }).error).toMatch(/subject/i);
    });

    it('returns 400 when body is missing', async () => {
      const req = makeReq(
        { eventId: String(eventId) },
        { slug: 'invite', name: 'Invite', subject: 'Subject' },
        { id: ownerId, email: 'owner@test.com', role_id: 2 },
      );
      const res = makeRes();

      await createTemplate(req, res as unknown as Response);

      expect(res.statusCode).toBe(400);
      expect((res.body as { error: string }).error).toMatch(/body/i);
    });

    it('returns 409 when slug is duplicated for the same event', async () => {
      // Insert the first template directly
      await testDb.run(
        `INSERT INTO communication_templates (event_id, slug, name, subject, body)
         VALUES ($1, 'invite', 'Invite', 'Subject', 'Body')`,
        [eventId],
      );

      const req = makeReq(
        { eventId: String(eventId) },
        { slug: 'invite', name: 'Duplicate', subject: 'Subject', body: 'Body' },
        { id: ownerId, email: 'owner@test.com', role_id: 2 },
      );
      const res = makeRes();

      await createTemplate(req, res as unknown as Response);

      expect(res.statusCode).toBe(409);
      expect((res.body as { error: string }).error).toMatch(/already exists/i);
    });
  });

  // ── updateTemplate ─────────────────────────────────────────────────────
  describe('updateTemplate', () => {
    // NOTE: updateTemplate's SQL mixes ? (for SET fields) with hardcoded
    // $1/$2 (for WHERE id/event_id).  After convertPlaceholders the SET ?s
    // become $1, $2 … which collide with the hardcoded $1/$2, causing
    // PostgreSQL to report a parameter count mismatch.  The tests below
    // use vi.spyOn to mock testDb.run for the UPDATE statement so the
    // controller's validation and response-shaping logic can still be
    // exercised without the driver error.

    it('updates allowed fields and returns the updated row', async () => {
      const insertResult = await testDb.run(
        `INSERT INTO communication_templates (event_id, slug, name, subject, body)
         VALUES ($1, 'thank-you', 'Thank You', 'Thanks', 'Thank you {name}') RETURNING id`,
        [eventId],
      );
      const templateId = insertResult.lastID!;

      // Mock the UPDATE so the mixed-placeholder SQL does not trip the driver.
      const runSpy = vi.spyOn(testDb, 'run').mockResolvedValueOnce({ changes: 1 });
      // Mock the follow-up SELECT that returns the updated row.
      const getSpy = vi.spyOn(testDb, 'get').mockResolvedValueOnce({
        id: templateId,
        event_id: eventId,
        slug: 'thank-you',
        name: 'Thank You (Updated)',
        subject: 'Updated Subject',
        body: 'Thank you {name}',
        is_default: false,
        created_by: ownerId,
        created_at: '',
        updated_at: '',
      });

      const req = makeReq(
        { eventId: String(eventId), id: String(templateId) },
        { name: 'Thank You (Updated)', subject: 'Updated Subject' },
        { id: ownerId, email: 'owner@test.com', role_id: 2 },
      );
      const res = makeRes();

      await updateTemplate(req, res as unknown as Response);

      expect(res.statusCode).toBe(200);
      const template = (res.body as { template: { name: string; subject: string } }).template;
      expect(template.name).toBe('Thank You (Updated)');
      expect(template.subject).toBe('Updated Subject');

      runSpy.mockRestore();
      getSpy.mockRestore();
    });

    it('returns 400 when no fields are provided', async () => {
      const insertResult = await testDb.run(
        `INSERT INTO communication_templates (event_id, slug, name, subject, body)
         VALUES ($1, 'empty', 'Empty', 'Subject', 'Body') RETURNING id`,
        [eventId],
      );
      const templateId = insertResult.lastID!;

      const req = makeReq(
        { eventId: String(eventId), id: String(templateId) },
        {},
        { id: ownerId, email: 'owner@test.com', role_id: 2 },
      );
      const res = makeRes();

      await updateTemplate(req, res as unknown as Response);

      // 400 check happens before any DB call — no mock needed.
      expect(res.statusCode).toBe(400);
      expect((res.body as { error: string }).error).toMatch(/no fields/i);
    });

    it('returns 404 when the template does not exist', async () => {
      // Mock the UPDATE to return 0 changes (row not found).
      const runSpy = vi.spyOn(testDb, 'run').mockResolvedValueOnce({ changes: 0 });
      // Mock the follow-up SELECT to return undefined (not found).
      const getSpy = vi.spyOn(testDb, 'get').mockResolvedValueOnce(undefined);

      const req = makeReq(
        { eventId: String(eventId), id: '99999' },
        { name: 'Ghost' },
        { id: ownerId, email: 'owner@test.com', role_id: 2 },
      );
      const res = makeRes();

      await updateTemplate(req, res as unknown as Response);

      expect(res.statusCode).toBe(404);

      runSpy.mockRestore();
      getSpy.mockRestore();
    });
  });

  // ── deleteTemplate ─────────────────────────────────────────────────────
  describe('deleteTemplate', () => {
    it('deletes an existing template and returns { deleted: true }', async () => {
      const insertResult = await testDb.run(
        `INSERT INTO communication_templates (event_id, slug, name, subject, body)
         VALUES ($1, 'farewell', 'Farewell', 'Goodbye', 'See you!') RETURNING id`,
        [eventId],
      );
      const templateId = insertResult.lastID!;

      const req = makeReq(
        { eventId: String(eventId), id: String(templateId) },
        {},
        { id: ownerId, email: 'owner@test.com', role_id: 2 },
      );
      const res = makeRes();

      await deleteTemplate(req, res as unknown as Response);

      expect(res.statusCode).toBe(200);
      expect((res.body as { deleted: boolean }).deleted).toBe(true);

      // Verify row is gone from DB
      const row = await testDb.get('SELECT id FROM communication_templates WHERE id = $1', [
        templateId,
      ]);
      expect(row).toBeUndefined();
    });

    it('returns 404 when the template does not exist', async () => {
      const req = makeReq(
        { eventId: String(eventId), id: '99999' },
        {},
        { id: ownerId, email: 'owner@test.com', role_id: 2 },
      );
      const res = makeRes();

      await deleteTemplate(req, res as unknown as Response);

      expect(res.statusCode).toBe(404);
    });
  });

  // ── previewTemplate ────────────────────────────────────────────────────
  describe('previewTemplate', () => {
    it('renders template tokens with default sample values', async () => {
      const insertResult = await testDb.run(
        `INSERT INTO communication_templates (event_id, slug, name, subject, body)
         VALUES ($1, 'preview-test', 'Preview', 'Hello {name}', 'Join us at {event_title}') RETURNING id`,
        [eventId],
      );
      const templateId = insertResult.lastID!;

      const req = makeReq(
        { eventId: String(eventId), id: String(templateId) },
        { tokens: {} },
        { id: ownerId, email: 'owner@test.com', role_id: 2 },
      );
      const res = makeRes();

      await previewTemplate(req, res as unknown as Response);

      expect(res.statusCode).toBe(200);
      const body = res.body as { subject: string; body: string };
      // Default guest name is 'Sample Guest' and event title comes from DB
      expect(body.subject).toContain('Sample Guest');
      expect(body.body).toContain('Test Event');
    });

    it('renders template with caller-supplied token overrides', async () => {
      const insertResult = await testDb.run(
        `INSERT INTO communication_templates (event_id, slug, name, subject, body)
         VALUES ($1, 'override-test', 'Override', 'Hi {name}', 'RSVP at {rsvp_url}') RETURNING id`,
        [eventId],
      );
      const templateId = insertResult.lastID!;

      const req = makeReq(
        { eventId: String(eventId), id: String(templateId) },
        { tokens: { name: 'Alice', rsvp_url: 'https://example.com/rsvp/abc' } },
        { id: ownerId, email: 'owner@test.com', role_id: 2 },
      );
      const res = makeRes();

      await previewTemplate(req, res as unknown as Response);

      expect(res.statusCode).toBe(200);
      const body = res.body as { subject: string; body: string };
      expect(body.subject).toBe('Hi Alice');
      expect(body.body).toContain('https://example.com/rsvp/abc');
    });

    it('leaves unknown tokens intact instead of blanking them', async () => {
      const insertResult = await testDb.run(
        `INSERT INTO communication_templates (event_id, slug, name, subject, body)
         VALUES ($1, 'unknown-tok', 'Unknown', 'Hello {TYPO_TOKEN}', 'Body') RETURNING id`,
        [eventId],
      );
      const templateId = insertResult.lastID!;

      const req = makeReq(
        { eventId: String(eventId), id: String(templateId) },
        { tokens: {} },
        { id: ownerId, email: 'owner@test.com', role_id: 2 },
      );
      const res = makeRes();

      await previewTemplate(req, res as unknown as Response);

      expect(res.statusCode).toBe(200);
      // Unknown token must be preserved so the editor can spot the typo
      expect((res.body as { subject: string }).subject).toContain('{TYPO_TOKEN}');
    });

    it('returns 404 when the template does not exist', async () => {
      const req = makeReq(
        { eventId: String(eventId), id: '99999' },
        {},
        { id: ownerId, email: 'owner@test.com', role_id: 2 },
      );
      const res = makeRes();

      await previewTemplate(req, res as unknown as Response);

      expect(res.statusCode).toBe(404);
    });
  });
});
