/**
 * Bulk events controller tests — story #410, task #433
 *
 * Covers:
 * - Successful archive on a mix of events the caller owns
 * - Per-event 403 when caller is not the owner and not admin
 * - Soft-delete-many path
 * - CSV export shape
 * - Validation: invalid action / empty event_ids
 * - Partial-success summary
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

import { bulkEventAction } from '../src/controllers/event-bulk-controller.js';

const ORGANIZER = { id: 5, email: 'o@test.com', role_id: 2 };
const ADMIN = { id: 1, email: 'a@test.com', role_id: 3 };

function makeRes() {
  const headers: Record<string, string> = {};
  let bodySent: unknown = null;
  const res: {
    statusCode: number;
    body: unknown;
    headers: Record<string, string>;
    sentBody: unknown;
    setHeader: (k: string, v: string) => void;
    status: (code: number) => typeof res;
    json: (data: unknown) => typeof res;
    send: (data: unknown) => typeof res;
  } = {
    statusCode: 200,
    body: null,
    headers,
    get sentBody() {
      return bodySent;
    },
    setHeader(k, v) {
      headers[k] = v;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(data) {
      this.body = data;
      return this;
    },
    send(data) {
      bodySent = data;
      this.body = data;
      return this;
    },
  };
  return res;
}

function makeReq(opts: {
  user?: typeof ORGANIZER | typeof ADMIN | undefined;
  body?: Record<string, unknown>;
}) {
  return {
    user: opts.user,
    body: opts.body ?? {},
    params: {},
    query: {},
    ip: '127.0.0.1',
  } as unknown as import('express').Request;
}

const EVENT_OWNED = {
  id: 1,
  title: 'Mine',
  date: '2026-06-01',
  location: 'A',
  capacity: 10,
  status: 'Active',
  event_type: 'Other',
  tags: null,
  created_by: ORGANIZER.id,
  deleted_at: null,
};
const EVENT_OTHERS = {
  id: 2,
  title: 'Theirs',
  date: '2026-06-02',
  location: 'B',
  capacity: 20,
  status: 'Active',
  event_type: 'Concert',
  tags: 'music',
  created_by: 99,
  deleted_at: null,
};

beforeEach(() => {
  mockDb = { get: vi.fn(), all: vi.fn(), run: vi.fn() };
});

describe('bulkEventAction validation', () => {
  it('rejects unauthenticated callers', async () => {
    const res = makeRes();
    await bulkEventAction(
      makeReq({ user: undefined }),
      res as unknown as import('express').Response,
    );
    expect(res.statusCode).toBe(401);
  });

  it('rejects unknown action', async () => {
    const res = makeRes();
    await bulkEventAction(
      makeReq({ user: ORGANIZER, body: { action: 'nope', event_ids: [1] } }),
      res as unknown as import('express').Response,
    );
    expect(res.statusCode).toBe(400);
  });

  it('rejects empty event_ids', async () => {
    const res = makeRes();
    await bulkEventAction(
      makeReq({ user: ORGANIZER, body: { action: 'archive', event_ids: [] } }),
      res as unknown as import('express').Response,
    );
    expect(res.statusCode).toBe(400);
  });

  it('rejects more than 200 ids', async () => {
    const res = makeRes();
    const ids = Array.from({ length: 201 }, (_, i) => i + 1);
    await bulkEventAction(
      makeReq({ user: ORGANIZER, body: { action: 'archive', event_ids: ids } }),
      res as unknown as import('express').Response,
    );
    expect(res.statusCode).toBe(400);
  });
});

describe('bulkEventAction archive', () => {
  it('archives events the organizer owns and 403s the rest', async () => {
    mockDb.all.mockResolvedValueOnce([EVENT_OWNED, EVENT_OTHERS]);
    mockDb.run.mockResolvedValue({ lastID: undefined, changes: 1 });

    const res = makeRes();
    await bulkEventAction(
      makeReq({ user: ORGANIZER, body: { action: 'archive', event_ids: [1, 2] } }),
      res as unknown as import('express').Response,
    );

    expect(res.statusCode).toBe(200);
    const body = res.body as {
      success: number;
      total: number;
      results: { event_id: number; status: string }[];
    };
    expect(body.success).toBe(1);
    expect(body.total).toBe(2);
    const ownedResult = body.results.find((r) => r.event_id === 1);
    const othersResult = body.results.find((r) => r.event_id === 2);
    expect(ownedResult?.status).toBe('ok');
    expect(othersResult?.status).toBe('forbidden');

    // Confirm at least one UPDATE … status='Cancelled' was issued
    const archiveCall = mockDb.run.mock.calls.find(
      (c) => typeof c[0] === 'string' && (c[0] as string).includes("status = 'Cancelled'"),
    );
    expect(archiveCall).toBeTruthy();
  });

  it('admin can archive any event', async () => {
    mockDb.all.mockResolvedValueOnce([EVENT_OWNED, EVENT_OTHERS]);
    mockDb.run.mockResolvedValue({ changes: 1 });
    const res = makeRes();
    await bulkEventAction(
      makeReq({ user: ADMIN, body: { action: 'archive', event_ids: [1, 2] } }),
      res as unknown as import('express').Response,
    );
    const body = res.body as { success: number; total: number };
    expect(body.success).toBe(2);
    expect(body.total).toBe(2);
  });
});

describe('bulkEventAction delete', () => {
  it('soft-deletes owned events', async () => {
    mockDb.all.mockResolvedValueOnce([EVENT_OWNED]);
    mockDb.run.mockResolvedValue({ changes: 1 });
    const res = makeRes();
    await bulkEventAction(
      makeReq({ user: ORGANIZER, body: { action: 'delete', event_ids: [1] } }),
      res as unknown as import('express').Response,
    );
    expect(res.statusCode).toBe(200);
    const deleteCall = mockDb.run.mock.calls.find(
      (c) =>
        typeof c[0] === 'string' && (c[0] as string).includes('deleted_at = CURRENT_TIMESTAMP'),
    );
    expect(deleteCall).toBeTruthy();
  });

  it('reports not_found for missing ids', async () => {
    mockDb.all.mockResolvedValueOnce([]);
    const res = makeRes();
    await bulkEventAction(
      makeReq({ user: ORGANIZER, body: { action: 'delete', event_ids: [123] } }),
      res as unknown as import('express').Response,
    );
    const body = res.body as { results: { status: string }[]; success: number };
    expect(body.success).toBe(0);
    expect(body.results[0].status).toBe('not_found');
  });
});

describe('bulkEventAction export', () => {
  it('returns CSV with header row plus owned events only', async () => {
    mockDb.all.mockResolvedValueOnce([EVENT_OWNED, EVENT_OTHERS]);
    const res = makeRes();
    await bulkEventAction(
      makeReq({ user: ORGANIZER, body: { action: 'export', event_ids: [1, 2] } }),
      res as unknown as import('express').Response,
    );
    expect(res.statusCode).toBe(200);
    expect(res.headers['Content-Type']).toContain('text/csv');
    const csv = res.sentBody as string;
    expect(csv.split('\n')[0]).toContain('id,title,date');
    // Only the owned event row should appear
    expect(csv).toContain(',Mine,');
    expect(csv).not.toContain(',Theirs,');
    // Skipped manifest header surfaces the forbidden entry
    expect(res.headers['X-Bulk-Skipped']).toContain('"forbidden"');
  });
});
