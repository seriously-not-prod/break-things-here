/**
 * Event filter presets controller tests — story #416, task #454
 *
 * Covers:
 * - Listing returns only the caller's presets
 * - Create requires name + parses filters JSON
 * - Update enforces ownership
 * - Delete enforces ownership
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
  createPreset,
  deletePreset,
  listPresets,
  updatePreset,
} from '../src/controllers/event-filter-presets-controller.js';

const ORGANIZER = { id: 5, email: 'a@test.com', role_id: 2 };
const OTHER = { id: 6, email: 'b@test.com', role_id: 2 };

const PRESET = {
  id: 10,
  name: 'High capacity',
  filters: JSON.stringify({ capacity_min: 100 }),
  user_id: ORGANIZER.id,
  created_at: '2026-05-01',
  updated_at: '2026-05-01',
};

function makeRes() {
  const res = {
    statusCode: 200,
    body: null as unknown,
    status(code: number) { this.statusCode = code; return this; },
    json(data: unknown) { this.body = data; return this; },
  };
  return res;
}

function makeReq(opts: {
  user?: typeof ORGANIZER;
  params?: Record<string, string>;
  body?: Record<string, unknown>;
}) {
  return {
    user: opts.user,
    params: opts.params ?? {},
    body: opts.body ?? {},
    query: {},
    ip: '127.0.0.1',
  } as unknown as import('express').Request;
}

beforeEach(() => {
  mockDb = { get: vi.fn(), all: vi.fn(), run: vi.fn() };
});

describe('listPresets', () => {
  it('returns parsed filters scoped to caller', async () => {
    mockDb.all.mockResolvedValueOnce([PRESET]);
    const res = makeRes();
    await listPresets(makeReq({ user: ORGANIZER }), res as unknown as import('express').Response);
    expect(res.statusCode).toBe(200);
    const body = res.body as { presets: { id: number; name: string; filters: Record<string, unknown> }[] };
    expect(body.presets[0].filters).toEqual({ capacity_min: 100 });
    const sql = mockDb.all.mock.calls[0][0] as string;
    expect(sql).toContain('user_id = ?');
    expect(mockDb.all.mock.calls[0][1]).toEqual([ORGANIZER.id]);
  });

  it('rejects unauthenticated', async () => {
    const res = makeRes();
    await listPresets(makeReq({ user: undefined }), res as unknown as import('express').Response);
    expect(res.statusCode).toBe(401);
  });
});

describe('createPreset', () => {
  it('requires name', async () => {
    const res = makeRes();
    await createPreset(
      makeReq({ user: ORGANIZER, body: { filters: {} } }),
      res as unknown as import('express').Response,
    );
    expect(res.statusCode).toBe(400);
  });

  it('rejects invalid JSON filter strings', async () => {
    const res = makeRes();
    await createPreset(
      makeReq({ user: ORGANIZER, body: { name: 'X', filters: '{not json' } }),
      res as unknown as import('express').Response,
    );
    expect(res.statusCode).toBe(400);
  });

  it('409 on duplicate name', async () => {
    mockDb.get.mockResolvedValueOnce({ id: 7 });
    const res = makeRes();
    await createPreset(
      makeReq({ user: ORGANIZER, body: { name: 'High capacity', filters: { capacity_min: 100 } } }),
      res as unknown as import('express').Response,
    );
    expect(res.statusCode).toBe(409);
  });

  it('inserts and returns the parsed view', async () => {
    mockDb.get
      .mockResolvedValueOnce(undefined)            // duplicate check
      .mockResolvedValueOnce(PRESET);              // re-fetch after insert
    mockDb.run.mockResolvedValueOnce({ lastID: 10, changes: 1 });
    const res = makeRes();
    await createPreset(
      makeReq({ user: ORGANIZER, body: { name: 'High capacity', filters: { capacity_min: 100 } } }),
      res as unknown as import('express').Response,
    );
    expect(res.statusCode).toBe(201);
    const body = res.body as { name: string; filters: Record<string, unknown> };
    expect(body.filters).toEqual({ capacity_min: 100 });
  });
});

describe('updatePreset', () => {
  it('forbids updating someone else’s preset', async () => {
    mockDb.get.mockResolvedValueOnce(PRESET);
    const res = makeRes();
    await updatePreset(
      makeReq({ user: OTHER, params: { id: '10' }, body: { name: 'Other' } }),
      res as unknown as import('express').Response,
    );
    expect(res.statusCode).toBe(403);
  });
});

describe('deletePreset', () => {
  it('forbids deleting someone else’s preset', async () => {
    mockDb.get.mockResolvedValueOnce(PRESET);
    const res = makeRes();
    await deletePreset(
      makeReq({ user: OTHER, params: { id: '10' } }),
      res as unknown as import('express').Response,
    );
    expect(res.statusCode).toBe(403);
  });

  it('deletes for owner', async () => {
    mockDb.get.mockResolvedValueOnce(PRESET);
    mockDb.run.mockResolvedValueOnce({ changes: 1 });
    const res = makeRes();
    await deletePreset(
      makeReq({ user: ORGANIZER, params: { id: '10' } }),
      res as unknown as import('express').Response,
    );
    expect(res.statusCode).toBe(200);
    const sql = mockDb.run.mock.calls[0][0] as string;
    expect(sql).toContain('DELETE FROM event_filter_presets');
  });
});
