/**
 * Advanced search tests — story #416, task #455
 *
 * Covers the new query parameters supported by getAllEvents:
 *   title_q, location_q, date_from, date_to, capacity_min, capacity_max,
 *   event_type, has_waitlist
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

import { getAllEvents } from '../src/controllers/event-controller.js';

function makeRes() {
  const res = {
    statusCode: 200,
    body: null as unknown,
    status(code: number) { this.statusCode = code; return this; },
    json(data: unknown) { this.body = data; return this; },
  };
  return res;
}

function makeReq(query: Record<string, string> = {}) {
  return {
    user: { id: 1, email: 'u@test.com', role_id: 2 },
    query,
    params: {},
    body: {},
    ip: '127.0.0.1',
  } as unknown as import('express').Request;
}

beforeEach(() => {
  mockDb = { get: vi.fn(), all: vi.fn(), run: vi.fn() };
});

describe('getAllEvents advanced search', () => {
  it('title_q produces an ILIKE constraint with surrounding wildcards', async () => {
    mockDb.all.mockResolvedValueOnce([]);
    await getAllEvents(makeReq({ title_q: 'jazz' }), makeRes() as unknown as import('express').Response);
    const sql = mockDb.all.mock.calls[0][0] as string;
    const params = mockDb.all.mock.calls[0][1] as unknown[];
    expect(sql.toLowerCase()).toContain('e.title ilike');
    expect(params).toContain('%jazz%');
  });

  it('location_q filter is appended with wildcards', async () => {
    mockDb.all.mockResolvedValueOnce([]);
    await getAllEvents(makeReq({ location_q: 'park' }), makeRes() as unknown as import('express').Response);
    const sql = mockDb.all.mock.calls[0][0] as string;
    const params = mockDb.all.mock.calls[0][1] as unknown[];
    expect(sql.toLowerCase()).toContain('e.location ilike');
    expect(params).toContain('%park%');
  });

  it('date_from / date_to bracket the date column', async () => {
    mockDb.all.mockResolvedValueOnce([]);
    await getAllEvents(
      makeReq({ date_from: '2026-01-01', date_to: '2026-12-31' }),
      makeRes() as unknown as import('express').Response,
    );
    const sql = mockDb.all.mock.calls[0][0] as string;
    const params = mockDb.all.mock.calls[0][1] as unknown[];
    expect(sql).toContain('e.date >= ?');
    expect(sql).toContain('e.date <= ?');
    expect(params).toEqual(expect.arrayContaining(['2026-01-01', '2026-12-31']));
  });

  it('capacity_min only adds bound when value is numeric', async () => {
    mockDb.all.mockResolvedValueOnce([]);
    await getAllEvents(makeReq({ capacity_min: '50' }), makeRes() as unknown as import('express').Response);
    let sql = mockDb.all.mock.calls[0][0] as string;
    let params = mockDb.all.mock.calls[0][1] as unknown[];
    expect(sql).toContain('e.capacity >= ?');
    expect(params).toContain(50);

    mockDb.all.mockResolvedValueOnce([]);
    await getAllEvents(makeReq({ capacity_min: 'not-a-number' }), makeRes() as unknown as import('express').Response);
    sql = mockDb.all.mock.calls[1][0] as string;
    params = mockDb.all.mock.calls[1][1] as unknown[];
    expect(sql).not.toContain('e.capacity >= ?');
  });

  it('event_type filters exactly', async () => {
    mockDb.all.mockResolvedValueOnce([]);
    await getAllEvents(makeReq({ event_type: 'Concert' }), makeRes() as unknown as import('express').Response);
    const sql = mockDb.all.mock.calls[0][0] as string;
    const params = mockDb.all.mock.calls[0][1] as unknown[];
    expect(sql).toContain('e.event_type = ?');
    expect(params).toContain('Concert');
  });

  it('has_waitlist=true narrows to waitlist_enabled events', async () => {
    mockDb.all.mockResolvedValueOnce([]);
    await getAllEvents(makeReq({ has_waitlist: 'true' }), makeRes() as unknown as import('express').Response);
    const sql = mockDb.all.mock.calls[0][0] as string;
    expect(sql).toContain('e.waitlist_enabled = TRUE');
  });

  it('has_waitlist=false narrows to non-waitlist events', async () => {
    mockDb.all.mockResolvedValueOnce([]);
    await getAllEvents(makeReq({ has_waitlist: 'false' }), makeRes() as unknown as import('express').Response);
    const sql = mockDb.all.mock.calls[0][0] as string;
    expect(sql).toContain('COALESCE(e.waitlist_enabled, FALSE) = FALSE');
  });

  it('does not apply advanced filters when none are present', async () => {
    mockDb.all.mockResolvedValueOnce([]);
    await getAllEvents(makeReq({}), makeRes() as unknown as import('express').Response);
    const sql = mockDb.all.mock.calls[0][0] as string;
    expect(sql).not.toContain('e.title ILIKE');
    expect(sql).not.toContain('e.location ILIKE');
    expect(sql).not.toContain('e.date >=');
    expect(sql).not.toContain('e.capacity >=');
    expect(sql).not.toContain('e.event_type =');
    expect(sql).not.toContain('e.waitlist_enabled');
  });
});
