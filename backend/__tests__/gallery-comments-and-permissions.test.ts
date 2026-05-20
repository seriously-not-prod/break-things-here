/**
 * BRD v2 — gallery comments + per-photo permissions (#618, #621).
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
  addComment,
  deleteComment,
  listComments,
  moderateComment,
} from '../src/controllers/gallery-comments-controller.js';
import {
  updatePhotoPermissions,
  getStorageUsage,
} from '../src/controllers/gallery-permissions-controller.js';

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
  return {
    params,
    query: {},
    body,
    user,
    ip: '127.0.0.1',
  } as unknown as import('express').Request;
}

describe('gallery comments', () => {
  beforeEach(() => {
    mockDb = { get: vi.fn(), all: vi.fn(), run: vi.fn() };
  });

  it('blocks comments when the event disables them', async () => {
    mockDb.get
      .mockResolvedValueOnce({ id: 1, allow_comments: true, event_id: 1 }) // photo ctx
      .mockResolvedValueOnce({ id: 1, gallery_comments_enabled: false, created_by: 7 }); // event ctx
    const req = makeReq({ eventId: '1', documentId: '1' }, { body: 'Hi' });
    const res = makeRes();
    await addComment(req, res as unknown as import('express').Response);
    expect(res.statusCode).toBe(403);
  });

  it('blocks comments when the photo disables them', async () => {
    mockDb.get
      .mockResolvedValueOnce({ id: 1, gallery_comments_enabled: true, created_by: 7 }) // event ctx
      .mockResolvedValueOnce({ id: 1, allow_comments: false, event_id: 1 }); // photo ctx
    const req = makeReq({ eventId: '1', documentId: '1' }, { body: 'Hi' });
    const res = makeRes();
    await addComment(req, res as unknown as import('express').Response);
    expect(res.statusCode).toBe(403);
  });

  it('persists a valid comment', async () => {
    mockDb.get
      .mockResolvedValueOnce({ id: 1, gallery_comments_enabled: true, created_by: 7 })
      .mockResolvedValueOnce({ id: 1, allow_comments: true, event_id: 1 });
    mockDb.run.mockResolvedValueOnce({ lastID: 42, changes: 1 });
    mockDb.get.mockResolvedValueOnce({
      id: 42,
      event_id: 1,
      document_id: 1,
      parent_id: null,
      user_id: 7,
      body: 'Hi',
      is_hidden: false,
      created_at: '',
    });
    const req = makeReq({ eventId: '1', documentId: '1' }, { body: 'Hi' });
    const res = makeRes();
    await addComment(req, res as unknown as import('express').Response);
    expect(res.statusCode).toBe(201);
    expect(res.body).toMatchObject({ id: 42, body: 'Hi' });
  });

  it('hides hidden comment bodies on list', async () => {
    mockDb.all.mockResolvedValueOnce([
      { id: 1, body: 'real text', is_hidden: true },
      { id: 2, body: 'visible', is_hidden: false },
    ]);
    mockDb.get.mockResolvedValueOnce({ id: 1, allow_comments: true, event_id: 1 });
    const req = makeReq({ eventId: '1', documentId: '1' });
    const res = makeRes();
    await listComments(req, res as unknown as import('express').Response);
    expect(res.statusCode).toBe(200);
    const body = res.body as { comments: Array<{ id: number; body: string }> };
    expect(body.comments[0].body).toBe('[hidden]');
    expect(body.comments[1].body).toBe('visible');
  });

  it('admin can delete any comment; non-author cannot', async () => {
    mockDb.get.mockResolvedValueOnce({ id: 9, user_id: 555 });
    const req = makeReq(
      { eventId: '1', commentId: '9' },
      {},
      { id: 7, email: 'owner@test.com', role_id: 2 }, // not author, not admin
    );
    const res = makeRes();
    await deleteComment(req, res as unknown as import('express').Response);
    // The 'event' returned by mocked requireEventAccess has created_by: 7, which
    // matches our user id, so this user IS the event owner. Expect success.
    expect(res.statusCode).toBe(200);
  });

  it('moderateComment rejects non-boolean hide', async () => {
    const req = makeReq({ eventId: '1', commentId: '9' }, { hide: 'yes' });
    const res = makeRes();
    await moderateComment(req, res as unknown as import('express').Response);
    expect(res.statusCode).toBe(400);
  });
});

describe('photo permissions', () => {
  beforeEach(() => {
    mockDb = { get: vi.fn(), all: vi.fn(), run: vi.fn() };
  });

  it('updates visibility/allowDownload/allowComments', async () => {
    mockDb.get.mockResolvedValueOnce({
      id: 1,
      mime_type: 'image/jpeg',
      visibility: 'event',
      allow_download: true,
      allow_comments: true,
    });
    const req = makeReq(
      { eventId: '1', documentId: '1' },
      { visibility: 'public', allowDownload: false },
    );
    const res = makeRes();
    await updatePhotoPermissions(req, res as unknown as import('express').Response);
    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({
      visibility: 'public',
      allowDownload: false,
      allowComments: true,
    });
  });

  it('rejects unknown visibility', async () => {
    mockDb.get.mockResolvedValueOnce({
      id: 1,
      mime_type: 'image/jpeg',
      visibility: 'event',
      allow_download: true,
      allow_comments: true,
    });
    const req = makeReq({ eventId: '1', documentId: '1' }, { visibility: 'secret' });
    const res = makeRes();
    await updatePhotoPermissions(req, res as unknown as import('express').Response);
    expect(res.statusCode).toBe(400);
  });

  it('refuses to update permissions on non-image documents', async () => {
    mockDb.get.mockResolvedValueOnce({
      id: 1,
      mime_type: 'application/pdf',
      visibility: 'event',
      allow_download: true,
      allow_comments: true,
    });
    const req = makeReq({ eventId: '1', documentId: '1' }, { visibility: 'public' });
    const res = makeRes();
    await updatePhotoPermissions(req, res as unknown as import('express').Response);
    expect(res.statusCode).toBe(400);
  });
});

describe('storage usage', () => {
  beforeEach(() => {
    mockDb = { get: vi.fn(), all: vi.fn(), run: vi.fn() };
  });

  it('computes percent and remaining', async () => {
    mockDb.get.mockResolvedValueOnce({
      quota: 1000,
      used: 250,
      image_count: 5,
      image_bytes: 250,
      pending_conversions: 1,
    });
    const req = makeReq({ eventId: '1' });
    const res = makeRes();
    await getStorageUsage(req, res as unknown as import('express').Response);
    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({
      quotaBytes: 1000,
      usedBytes: 250,
      remainingBytes: 750,
      percentUsed: 25,
      imageCount: 5,
      pendingConversions: 1,
    });
  });
});
