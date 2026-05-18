/**
 * BRD v2 — event archive workflow tests (#540, #578).
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

import { archiveEvent, restoreEvent, unarchiveEvent, updateEvent } from '../src/controllers/event-controller.js';

function makeRes() {
  const res: {
    statusCode: number;
    body: unknown;
    status: (code: number) => typeof res;
    json: (data: unknown) => typeof res;
  } = {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(data) {
      this.body = data;
      return this;
    },
  };
  return res;
}

function makeReq(
  params: Record<string, string>,
  body: Record<string, unknown> = {},
  user: { id: number; email: string; role_id: number } = {
    id: 7,
    email: 'owner@test.com',
    role_id: 2,
  },
) {
  return { params, query: {}, body, user, ip: '127.0.0.1' } as unknown as import('express').Request;
}

describe('archiveEvent', () => {
  beforeEach(() => {
    mockDb = { get: vi.fn(), all: vi.fn(), run: vi.fn() };
  });

  it('archives an owner-owned event and records audit', async () => {
    const eventRow: Row = { id: 12, title: 'Festival', created_by: 7, archived_at: null };
    const archived: Row = { ...eventRow, archived_at: '2026-05-12T12:00:00Z' };
    mockDb.get.mockResolvedValueOnce(eventRow).mockResolvedValueOnce(archived);

    const req = makeReq({ id: '12' }, { reason: 'historical cleanup' });
    const res = makeRes();
    await archiveEvent(req, res as unknown as import('express').Response);

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual(archived);
    expect(mockDb.run).toHaveBeenCalledTimes(2); // archive + audit
    expect(mockDb.run.mock.calls[0][0]).toMatch(/UPDATE events/);
    expect(mockDb.run.mock.calls[0][1]).toEqual([7, 'historical cleanup', 7, '12']);
    expect(mockDb.run.mock.calls[1][0]).toMatch(/INSERT INTO audit_log/);
  });

  it('rejects non-owners who are not admin', async () => {
    mockDb.get.mockResolvedValueOnce({ id: 12, title: 'Festival', created_by: 999, archived_at: null });
    const req = makeReq({ id: '12' }, {});
    const res = makeRes();
    await archiveEvent(req, res as unknown as import('express').Response);
    expect(res.statusCode).toBe(403);
  });

  it('returns 409 when the event is already archived', async () => {
    mockDb.get.mockResolvedValueOnce({
      id: 12,
      title: 'Festival',
      created_by: 7,
      archived_at: '2026-05-12T12:00:00Z',
    });
    const req = makeReq({ id: '12' }, {});
    const res = makeRes();
    await archiveEvent(req, res as unknown as import('express').Response);
    expect(res.statusCode).toBe(409);
  });

  it('returns 404 when event not found', async () => {
    mockDb.get.mockResolvedValueOnce(undefined);
    const req = makeReq({ id: '12' }, {});
    const res = makeRes();
    await archiveEvent(req, res as unknown as import('express').Response);
    expect(res.statusCode).toBe(404);
  });
});

describe('unarchiveEvent', () => {
  beforeEach(() => {
    mockDb = { get: vi.fn(), all: vi.fn(), run: vi.fn() };
  });

  it('clears archive metadata on an archived event', async () => {
    const archived: Row = {
      id: 12,
      title: 'Festival',
      created_by: 7,
      archived_at: '2026-05-12T12:00:00Z',
    };
    const restored: Row = { ...archived, archived_at: null };
    mockDb.get.mockResolvedValueOnce(archived).mockResolvedValueOnce(restored);

    const req = makeReq({ id: '12' });
    const res = makeRes();
    await unarchiveEvent(req, res as unknown as import('express').Response);

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual(restored);
    expect(mockDb.run.mock.calls[0][0]).toMatch(/SET archived_at = NULL/);
  });

  it('returns 409 if the event is not archived', async () => {
    mockDb.get.mockResolvedValueOnce({
      id: 12,
      title: 'Festival',
      created_by: 7,
      archived_at: null,
    });
    const req = makeReq({ id: '12' });
    const res = makeRes();
    await unarchiveEvent(req, res as unknown as import('express').Response);
    expect(res.statusCode).toBe(409);
  });
});

describe('updateEvent guards', () => {
  beforeEach(() => {
    mockDb = { get: vi.fn(), all: vi.fn(), run: vi.fn() };
  });

  it('refuses to edit an archived event', async () => {
    mockDb.get.mockResolvedValueOnce({
      id: 12,
      title: 'Festival',
      created_by: 7,
      status: 'Draft',
      archived_at: '2026-05-12T12:00:00Z',
      date: '2026-08-10',
    });
    const req = makeReq({ id: '12' }, { title: 'New title' });
    const res = makeRes();
    await updateEvent(req, res as unknown as import('express').Response);
    expect(res.statusCode).toBe(409);
  });

  it('rejects an illegal status transition', async () => {
    mockDb.get.mockResolvedValueOnce({
      id: 12,
      title: 'Festival',
      created_by: 7,
      status: 'Completed',
      archived_at: null,
      date: '2024-06-01',
    });
    const req = makeReq({ id: '12' }, { status: 'Draft' });
    const res = makeRes();
    await updateEvent(req, res as unknown as import('express').Response);
    expect(res.statusCode).toBe(400);
    expect(res.body).toMatchObject({ error: expect.stringMatching(/Cannot transition/) });
  });
});

describe('restoreEvent 30-day rule', () => {
  beforeEach(() => {
    mockDb = { get: vi.fn(), all: vi.fn(), run: vi.fn() };
  });

  it('restores when deleted_at is within 30 days', async () => {
    const deletedAt = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString();
    mockDb.get.mockResolvedValueOnce({
      id: 12,
      title: 'Festival',
      deleted_at: deletedAt,
    });

    const req = makeReq(
      { id: '12' },
      {},
      { id: 3, email: 'admin@test.com', role_id: 3 },
    );
    const res = makeRes();
    await restoreEvent(req, res as unknown as import('express').Response);

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ message: 'Event restored successfully' });
    expect(mockDb.run).toHaveBeenCalledTimes(2);
    expect(mockDb.run.mock.calls[0][0]).toContain('UPDATE events SET deleted_at = NULL');
    expect(mockDb.run.mock.calls[1][0]).toContain('INSERT INTO audit_log');
  });

  it('returns 410 when deleted_at is older than 30 days', async () => {
    const deletedAt = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000).toISOString();
    mockDb.get.mockResolvedValueOnce({
      id: 12,
      title: 'Festival',
      deleted_at: deletedAt,
    });

    const req = makeReq(
      { id: '12' },
      {},
      { id: 3, email: 'admin@test.com', role_id: 3 },
    );
    const res = makeRes();
    await restoreEvent(req, res as unknown as import('express').Response);

    expect(res.statusCode).toBe(410);
    expect(res.body).toMatchObject({
      error: expect.stringMatching(/Restore window expired/i),
      deleted_at: deletedAt,
    });
    expect(mockDb.run).not.toHaveBeenCalled();
  });

  it('returns 403 for non-admin users', async () => {
    const req = makeReq(
      { id: '12' },
      {},
      { id: 7, email: 'owner@test.com', role_id: 2 },
    );
    const res = makeRes();
    await restoreEvent(req, res as unknown as import('express').Response);

    expect(res.statusCode).toBe(403);
    expect(mockDb.get).not.toHaveBeenCalled();
  });
});
