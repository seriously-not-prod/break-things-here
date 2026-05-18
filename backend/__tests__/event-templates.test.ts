/**
 * Event templates controller tests — story #410, task #432
 *
 * Covers:
 * - Listing templates filters by user_id for non-admins, returns all for admins.
 * - Creating a template requires role_id >= 2.
 * - Apply requires a date and falls back to template defaults when overrides absent.
 * - Permission failures are rejected (403/404 paths).
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

interface MockDb {
  get: ReturnType<typeof vi.fn>;
  all: ReturnType<typeof vi.fn>;
  run: ReturnType<typeof vi.fn>;
}

let mockDb: MockDb;

vi.mock('../src/db/database', () => ({
  getDatabase: () => mockDb,
}));

import {
  applyTemplate,
  createTemplate,
  deleteTemplate,
  getTemplate,
  listTemplates,
  updateTemplate,
} from '../src/controllers/event-templates-controller.js';

function makeRes() {
  const res: {
    statusCode: number;
    body: unknown;
    status: (code: number) => typeof res;
    json: (data: unknown) => typeof res;
  } = {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(data) { this.body = data; return this; },
  };
  return res;
}

const ORGANIZER = { id: 5, email: 'org@test.com', role_id: 2 };
const OTHER_ORGANIZER = { id: 9, email: 'other@test.com', role_id: 2 };
const ADMIN = { id: 1, email: 'admin@test.com', role_id: 3 };
const VIEWER = { id: 7, email: 'viewer@test.com', role_id: 1 };

function makeReq(opts: {
  user?: typeof ORGANIZER | undefined;
  params?: Record<string, string>;
  body?: Record<string, unknown>;
} = {}) {
  return {
    user: opts.user,
    params: opts.params ?? {},
    body: opts.body ?? {},
    query: {},
    ip: '127.0.0.1',
  } as unknown as import('express').Request;
}

const TEMPLATE_OWN = {
  id: 11,
  name: 'Wedding starter',
  description: null,
  default_title: 'Wedding',
  default_location: 'Hall',
  default_capacity: 100,
  default_event_type: 'Wedding',
  default_status: 'Draft',
  default_tags: 'wedding,private',
  default_is_public: false,
  default_waitlist_enabled: true,
  created_by: ORGANIZER.id,
  created_at: '2026-01-01',
  updated_at: '2026-01-01',
  deleted_at: null,
};

beforeEach(() => {
  mockDb = { get: vi.fn(), all: vi.fn(), run: vi.fn() };
});

describe('listTemplates', () => {
  it('filters by created_by for organizers', async () => {
    mockDb.all.mockResolvedValueOnce([TEMPLATE_OWN]);
    const req = makeReq({ user: ORGANIZER });
    const res = makeRes();
    await listTemplates(req, res as unknown as import('express').Response);
    expect(res.statusCode).toBe(200);
    const sql = mockDb.all.mock.calls[0][0] as string;
    expect(sql).toContain('created_by = ?');
    expect(mockDb.all.mock.calls[0][1]).toEqual([ORGANIZER.id]);
    expect(res.body).toEqual({ templates: [TEMPLATE_OWN] });
  });

  it('admin gets all templates without created_by filter', async () => {
    mockDb.all.mockResolvedValueOnce([TEMPLATE_OWN]);
    const req = makeReq({ user: ADMIN });
    const res = makeRes();
    await listTemplates(req, res as unknown as import('express').Response);
    const sql = mockDb.all.mock.calls[0][0] as string;
    expect(sql).not.toContain('created_by = ?');
  });

  it('rejects unauthenticated callers', async () => {
    const req = makeReq({ user: undefined });
    const res = makeRes();
    await listTemplates(req, res as unknown as import('express').Response);
    expect(res.statusCode).toBe(401);
  });
});

describe('getTemplate', () => {
  it('returns template to its owner', async () => {
    mockDb.get.mockResolvedValueOnce(TEMPLATE_OWN);
    const req = makeReq({ user: ORGANIZER, params: { id: '11' } });
    const res = makeRes();
    await getTemplate(req, res as unknown as import('express').Response);
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual(TEMPLATE_OWN);
  });

  it('forbids non-owner non-admin organizers', async () => {
    mockDb.get.mockResolvedValueOnce(TEMPLATE_OWN);
    const req = makeReq({ user: OTHER_ORGANIZER, params: { id: '11' } });
    const res = makeRes();
    await getTemplate(req, res as unknown as import('express').Response);
    expect(res.statusCode).toBe(403);
  });

  it('404 when template missing', async () => {
    mockDb.get.mockResolvedValueOnce(undefined);
    const req = makeReq({ user: ORGANIZER, params: { id: '99' } });
    const res = makeRes();
    await getTemplate(req, res as unknown as import('express').Response);
    expect(res.statusCode).toBe(404);
  });
});

describe('createTemplate', () => {
  it('rejects callers without role_id >= 2', async () => {
    const req = makeReq({ user: VIEWER, body: { name: 'X' } });
    const res = makeRes();
    await createTemplate(req, res as unknown as import('express').Response);
    expect(res.statusCode).toBe(403);
  });

  it('requires name', async () => {
    const req = makeReq({ user: ORGANIZER, body: {} });
    const res = makeRes();
    await createTemplate(req, res as unknown as import('express').Response);
    expect(res.statusCode).toBe(400);
  });

  it('inserts template and returns the new row', async () => {
    mockDb.run.mockResolvedValueOnce({ lastID: 22, changes: 1 });
    mockDb.get.mockResolvedValueOnce({ ...TEMPLATE_OWN, id: 22, name: 'New' });
    const req = makeReq({
      user: ORGANIZER,
      body: { name: 'New', default_title: 'T', default_location: 'Loc' },
    });
    const res = makeRes();
    await createTemplate(req, res as unknown as import('express').Response);
    expect(res.statusCode).toBe(201);
    expect(mockDb.run).toHaveBeenCalled();
    const params = mockDb.run.mock.calls[0][1] as unknown[];
    expect(params).toContain('New');
    expect(params).toContain(ORGANIZER.id);
  });
});

describe('updateTemplate / deleteTemplate', () => {
  it('updateTemplate forbids non-owner non-admin', async () => {
    mockDb.get.mockResolvedValueOnce(TEMPLATE_OWN);
    const req = makeReq({ user: OTHER_ORGANIZER, params: { id: '11' }, body: { name: 'New' } });
    const res = makeRes();
    await updateTemplate(req, res as unknown as import('express').Response);
    expect(res.statusCode).toBe(403);
  });

  it('deleteTemplate soft-deletes for owner', async () => {
    mockDb.get.mockResolvedValueOnce(TEMPLATE_OWN);
    const req = makeReq({ user: ORGANIZER, params: { id: '11' } });
    const res = makeRes();
    await deleteTemplate(req, res as unknown as import('express').Response);
    expect(res.statusCode).toBe(200);
    expect(mockDb.run).toHaveBeenCalled();
    const sql = mockDb.run.mock.calls[0][0] as string;
    expect(sql).toContain('deleted_at = CURRENT_TIMESTAMP');
  });
});

describe('applyTemplate', () => {
  it('requires a date', async () => {
    mockDb.get.mockResolvedValueOnce(TEMPLATE_OWN);
    const req = makeReq({ user: ORGANIZER, params: { id: '11' }, body: {} });
    const res = makeRes();
    await applyTemplate(req, res as unknown as import('express').Response);
    expect(res.statusCode).toBe(400);
  });

  it('creates a new event using template defaults when overrides are not provided', async () => {
    mockDb.get
      .mockResolvedValueOnce(TEMPLATE_OWN)
      .mockResolvedValueOnce({ id: 50, ...TEMPLATE_OWN });
    mockDb.run.mockResolvedValueOnce({ lastID: 50, changes: 1 });
    const req = makeReq({
      user: ORGANIZER,
      params: { id: '11' },
      body: { date: '2026-09-01' },
    });
    const res = makeRes();
    await applyTemplate(req, res as unknown as import('express').Response);
    expect(res.statusCode).toBe(201);
    const insertSql = mockDb.run.mock.calls[0][0] as string;
    expect(insertSql).toContain('INSERT INTO events');
    const params = mockDb.run.mock.calls[0][1] as unknown[];
    expect(params).toContain('Wedding');   // default_title
    expect(params).toContain('Hall');      // default_location
    expect(params).toContain('2026-09-01');
    expect(params).toContain(true);        // default_waitlist_enabled
  });

  it('forbids organizer that does not own the template', async () => {
    mockDb.get.mockResolvedValueOnce(TEMPLATE_OWN);
    const req = makeReq({
      user: OTHER_ORGANIZER,
      params: { id: '11' },
      body: { date: '2026-09-01' },
    });
    const res = makeRes();
    await applyTemplate(req, res as unknown as import('express').Response);
    expect(res.statusCode).toBe(403);
  });
});
