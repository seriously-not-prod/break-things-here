/**
 * Events list filter tests — issues #425 #426 (story #408)
 *
 * Covers:
 * - owner=me returns only events created by the authenticated user
 * - tags=X returns only events whose tags include X
 * - owner=me and tags can be combined
 * - No filters returns all non-deleted events
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

type Row = Record<string, unknown>;

interface MockDb {
  get: ReturnType<typeof vi.fn>;
  all: ReturnType<typeof vi.fn>;
  run: ReturnType<typeof vi.fn>;
}

let mockDb: MockDb;

vi.mock('../src/db/database', () => ({
  getDatabase: () => mockDb,
}));

import { getAllEvents } from '../src/controllers/event-controller.js';

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

function makeReq(
  query: Record<string, string> = {},
  user = { id: 5, email: 'user@test.com', role_id: 2 },
) {
  return { params: {}, query, body: {}, user, ip: '127.0.0.1' } as unknown as import('express').Request;
}

const EVENT_A: Row = {
  id: 1, title: 'Concert Night', date: '2026-07-10', location: 'Arena', status: 'Active',
  tags: 'music,outdoor', created_by: 5,
};
const EVENT_B: Row = {
  id: 2, title: 'Food Fair', date: '2026-08-15', location: 'Park', status: 'Draft',
  tags: 'food,outdoor', created_by: 9,
};
const EVENT_C: Row = {
  id: 3, title: 'Art Show', date: '2026-09-01', location: 'Gallery', status: 'Active',
  tags: 'art', created_by: 5,
};

describe('getAllEvents', () => {
  beforeEach(() => {
    mockDb = {
      get: vi.fn(),
      all: vi.fn(),
      run: vi.fn(),
    };
  });

  it('returns all events when no filters are applied', async () => {
    const allEvents = [EVENT_A, EVENT_B, EVENT_C];
    mockDb.all.mockResolvedValueOnce(allEvents);

    const req = makeReq();
    const res = makeRes();

    await getAllEvents(req, res as unknown as import('express').Response);

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual(allEvents);

    const calledQuery: string = mockDb.all.mock.calls[0][0] as string;
    expect(calledQuery).not.toContain('AND e.created_by = ?');
    expect(calledQuery).toContain('deleted_at IS NULL');
  });

  it('owner=me appends a created_by filter with the authenticated user id', async () => {
    const myEvents = [EVENT_A, EVENT_C];
    mockDb.all.mockResolvedValueOnce(myEvents);

    const req = makeReq({ owner: 'me' });
    const res = makeRes();

    await getAllEvents(req, res as unknown as import('express').Response);

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual(myEvents);

    const calledQuery: string = mockDb.all.mock.calls[0][0] as string;
    const calledParams: unknown[] = mockDb.all.mock.calls[0][1] as unknown[];

    expect(calledQuery).toContain('e.created_by = ?');
    expect(calledParams).toContain(5);
  });

  it('owner=me without an authenticated user does not add the filter', async () => {
    mockDb.all.mockResolvedValueOnce([EVENT_A, EVENT_B, EVENT_C]);

    const req = { params: {}, query: { owner: 'me' }, body: {}, user: undefined, ip: '127.0.0.1' } as unknown as import('express').Request;
    const res = makeRes();

    await getAllEvents(req, res as unknown as import('express').Response);

    const calledQuery: string = mockDb.all.mock.calls[0][0] as string;
    expect(calledQuery).not.toContain('AND e.created_by = ?');
  });

  it('tags filter appends a ILIKE condition for each tag', async () => {
    const musicEvents = [EVENT_A];
    mockDb.all.mockResolvedValueOnce(musicEvents);

    const req = makeReq({ tags: 'music' });
    const res = makeRes();

    await getAllEvents(req, res as unknown as import('express').Response);

    expect(res.statusCode).toBe(200);
    const calledQuery: string = mockDb.all.mock.calls[0][0] as string;
    const calledParams: unknown[] = mockDb.all.mock.calls[0][1] as unknown[];

    expect(calledQuery.toLowerCase()).toContain('ilike');
    expect(calledParams).toContain('%,music,%');
  });

  it('multiple tags produce multiple ILIKE conditions joined with OR', async () => {
    mockDb.all.mockResolvedValueOnce([EVENT_A, EVENT_B, EVENT_C]);

    const req = makeReq({ tags: 'music,art' });
    const res = makeRes();

    await getAllEvents(req, res as unknown as import('express').Response);

    const calledQuery: string = mockDb.all.mock.calls[0][0] as string;
    const calledParams: unknown[] = mockDb.all.mock.calls[0][1] as unknown[];

    expect(calledQuery.toLowerCase()).toContain('or');
    expect(calledParams).toContain('%,music,%');
    expect(calledParams).toContain('%,art,%');
  });

  it('owner=me and tags can be combined', async () => {
    const myMusicEvents = [EVENT_A];
    mockDb.all.mockResolvedValueOnce(myMusicEvents);

    const req = makeReq({ owner: 'me', tags: 'music' });
    const res = makeRes();

    await getAllEvents(req, res as unknown as import('express').Response);

    expect(res.statusCode).toBe(200);
    const calledQuery: string = mockDb.all.mock.calls[0][0] as string;
    const calledParams: unknown[] = mockDb.all.mock.calls[0][1] as unknown[];

    expect(calledQuery).toContain('e.created_by = ?');
    expect(calledQuery.toLowerCase()).toContain('ilike');
    expect(calledParams).toContain(5);
    expect(calledParams).toContain('%,music,%');
  });

  it('returns 500 when the database throws', async () => {
    mockDb.all.mockRejectedValueOnce(new Error('DB error'));

    const req = makeReq();
    const res = makeRes();

    await getAllEvents(req, res as unknown as import('express').Response);

    expect(res.statusCode).toBe(500);
    expect(res.body).toEqual({ error: 'Failed to fetch events' });
  });
});
