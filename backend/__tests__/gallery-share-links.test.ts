/**
 * BRD v2 — gallery share-link controller tests (#619).
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
vi.mock('../src/db/database.js', () => ({
  getDatabase: () => mockDb,
}));

vi.mock('../src/utils/event-access.js', () => ({
  requireEventAccess: async () => ({ id: 1, created_by: 7, deleted_at: null }),
}));

import {
  createShareLink,
  resolveShareLink,
  revokeShareLink,
} from '../src/controllers/gallery-shares-controller.js';

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
  query: Record<string, string> = {},
) {
  return {
    params,
    query,
    body,
    user,
    ip: '127.0.0.1',
  } as unknown as import('express').Request;
}

describe('createShareLink', () => {
  beforeEach(() => {
    mockDb = { get: vi.fn(), all: vi.fn(), run: vi.fn() };
  });

  it('creates a share link without password', async () => {
    mockDb.run.mockResolvedValueOnce({ lastID: 1, changes: 1 });
    mockDb.get.mockResolvedValueOnce({
      id: 1,
      event_id: 1,
      album_id: null,
      token: 'abc',
      password_hash: null,
      allow_download: true,
      expires_at: null,
      view_count: 0,
      last_viewed_at: null,
      revoked_at: null,
      created_at: '',
      updated_at: '',
    });
    const req = makeReq({ eventId: '1' }, { allowDownload: true });
    const res = makeRes();
    await createShareLink(req, res as unknown as import('express').Response);
    expect(res.statusCode).toBe(201);
    expect(res.body).toMatchObject({ requiresPassword: false, allowDownload: true });
  });

  it('rejects short passwords', async () => {
    const req = makeReq({ eventId: '1' }, { password: '123' });
    const res = makeRes();
    await createShareLink(req, res as unknown as import('express').Response);
    expect(res.statusCode).toBe(400);
  });

  it('rejects past expiresAt', async () => {
    const req = makeReq({ eventId: '1' }, { expiresAt: '2000-01-01' });
    const res = makeRes();
    await createShareLink(req, res as unknown as import('express').Response);
    expect(res.statusCode).toBe(400);
  });
});

describe('resolveShareLink', () => {
  beforeEach(() => {
    mockDb = { get: vi.fn(), all: vi.fn(), run: vi.fn() };
  });

  it('returns 404 for unknown tokens', async () => {
    mockDb.get.mockResolvedValueOnce(undefined);
    const req = makeReq({ token: 'unknown' });
    const res = makeRes();
    await resolveShareLink(req, res as unknown as import('express').Response);
    expect(res.statusCode).toBe(404);
  });

  it('returns 410 for expired tokens', async () => {
    mockDb.get.mockResolvedValueOnce({
      id: 1,
      event_id: 1,
      album_id: null,
      token: 'abc',
      password_hash: null,
      allow_download: true,
      expires_at: '2000-01-01T00:00:00Z',
      view_count: 0,
      revoked_at: null,
    });
    const req = makeReq({ token: 'abc' });
    const res = makeRes();
    await resolveShareLink(req, res as unknown as import('express').Response);
    expect(res.statusCode).toBe(410);
  });

  it('requires password when password_hash is set', async () => {
    mockDb.get.mockResolvedValueOnce({
      id: 1,
      event_id: 1,
      album_id: null,
      token: 'abc',
      password_hash: '$2b$10$dummy',
      allow_download: true,
      expires_at: null,
      view_count: 0,
      revoked_at: null,
    });
    const req = makeReq({ token: 'abc' });
    const res = makeRes();
    await resolveShareLink(req, res as unknown as import('express').Response);
    expect(res.statusCode).toBe(401);
    expect(res.body).toMatchObject({ passwordRequired: true });
  });
});

describe('revokeShareLink', () => {
  beforeEach(() => {
    mockDb = { get: vi.fn(), all: vi.fn(), run: vi.fn() };
  });

  it('marks the link revoked', async () => {
    mockDb.get.mockResolvedValueOnce({ id: 5, revoked_at: null });
    const req = makeReq({ eventId: '1', id: '5' });
    const res = makeRes();
    await revokeShareLink(req, res as unknown as import('express').Response);
    expect(res.statusCode).toBe(200);
    expect(mockDb.run.mock.calls[0][0]).toMatch(/SET revoked_at = CURRENT_TIMESTAMP/);
  });

  it('returns 409 for already-revoked links', async () => {
    mockDb.get.mockResolvedValueOnce({ id: 5, revoked_at: '2024-01-01' });
    const req = makeReq({ eventId: '1', id: '5' });
    const res = makeRes();
    await revokeShareLink(req, res as unknown as import('express').Response);
    expect(res.statusCode).toBe(409);
  });
});
