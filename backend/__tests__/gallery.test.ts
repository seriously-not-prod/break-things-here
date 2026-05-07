/**
 * Gallery controller unit tests — issue #430
 *
 * Covers:
 * - listGallery: success, access denied
 * - deleteGalleryItem: success, 404, non-image, access denied
 * - updateGalleryCaption: success, 404, non-image, invalid input, access denied
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Request, Response } from 'express';

// ─── Mock dependencies ──────────────────────────────────────────────────────

const mockDb = {
  get: vi.fn(),
  all: vi.fn(),
  run: vi.fn(),
};
vi.mock('../src/db/database', () => ({ getDatabase: () => mockDb }));

const mockUnlink = vi.fn();
vi.mock('fs/promises', () => ({
  default: { unlink: (...args: unknown[]) => mockUnlink(...args) },
  unlink: (...args: unknown[]) => mockUnlink(...args),
}));

const mockRequireEventAccess = vi.fn();
vi.mock('../src/utils/event-access', () => ({
  requireEventAccess: (...args: unknown[]) => mockRequireEventAccess(...args),
}));

import {
  listGallery,
  deleteGalleryItem,
  updateGalleryCaption,
} from '../src/controllers/gallery-controller.js';

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeRes(): Response {
  const res: Partial<Response> & { statusCode: number; body: unknown } = {
    statusCode: 200,
    body: null,
    status(code: number) { this.statusCode = code; return this as Response; },
    json(data: unknown) { this.body = data; return this as Response; },
    sendFile: vi.fn(),
  };
  return res as Response;
}

function makeReq(
  params: Record<string, string> = {},
  body: unknown = {},
  user = { id: 1, email: 'user@test.com', role_id: 2 },
): Request {
  return { params, body, user, headers: {} } as unknown as Request;
}

const MOCK_EVENT = { id: 42, title: 'Test Event' };

// ─── listGallery ────────────────────────────────────────────────────────────

describe('listGallery (#430)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 200 with gallery items for authorised user', async () => {
    mockRequireEventAccess.mockResolvedValue(MOCK_EVENT);
    mockDb.all.mockResolvedValue([
      {
        id: 1,
        file_name: 'photo.jpg',
        original_name: 'concert.jpg',
        mime_type: 'image/jpeg',
        file_size: 100000,
        caption: 'Nice shot',
        created_at: '2026-05-01T10:00:00Z',
      },
    ]);

    const req = makeReq({ eventId: '42' });
    const res = makeRes();

    await listGallery(req, res);

    expect((res as unknown as { statusCode: number }).statusCode).toBe(200);
    const body = (res as unknown as { body: { gallery: unknown[] } }).body;
    expect(body.gallery).toHaveLength(1);
    expect(body.gallery[0]).toMatchObject({
      id: 1,
      fileName: 'photo.jpg',
      originalName: 'concert.jpg',
      caption: 'Nice shot',
    });
  });

  it('returns nothing when access is denied', async () => {
    mockRequireEventAccess.mockResolvedValue(null);

    const req = makeReq({ eventId: '42' });
    const res = makeRes();

    await listGallery(req, res);

    expect(mockDb.all).not.toHaveBeenCalled();
  });
});

// ─── deleteGalleryItem ───────────────────────────────────────────────────────

describe('deleteGalleryItem (#430)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUnlink.mockResolvedValue(undefined);
  });

  it('returns 200 and deletes the image file and DB row', async () => {
    mockRequireEventAccess.mockResolvedValue(MOCK_EVENT);
    mockDb.get.mockResolvedValue({ id: 1, file_name: 'photo.jpg', mime_type: 'image/jpeg' });
    mockDb.run.mockResolvedValue({});

    const req = makeReq({ eventId: '42', id: '1' });
    const res = makeRes();

    await deleteGalleryItem(req, res);

    expect(mockDb.run).toHaveBeenCalledWith(
      expect.stringContaining('DELETE FROM event_documents'),
      ['1', '42'],
    );
    expect((res as unknown as { statusCode: number }).statusCode).toBe(200);
    const body = (res as unknown as { body: { message: string } }).body;
    expect(body.message).toContain('deleted');
  });

  it('returns 404 when gallery item is not found', async () => {
    mockRequireEventAccess.mockResolvedValue(MOCK_EVENT);
    mockDb.get.mockResolvedValue(undefined);

    const req = makeReq({ eventId: '42', id: '99' });
    const res = makeRes();

    await deleteGalleryItem(req, res);

    expect((res as unknown as { statusCode: number }).statusCode).toBe(404);
    const body = (res as unknown as { body: { error: string } }).body;
    expect(body.error).toContain('not found');
  });

  it('returns 400 when item is not an image', async () => {
    mockRequireEventAccess.mockResolvedValue(MOCK_EVENT);
    mockDb.get.mockResolvedValue({ id: 1, file_name: 'doc.pdf', mime_type: 'application/pdf' });

    const req = makeReq({ eventId: '42', id: '1' });
    const res = makeRes();

    await deleteGalleryItem(req, res);

    expect((res as unknown as { statusCode: number }).statusCode).toBe(400);
    const body = (res as unknown as { body: { error: string } }).body;
    expect(body.error).toContain('not a gallery image');
  });

  it('returns nothing when access is denied', async () => {
    mockRequireEventAccess.mockResolvedValue(null);

    const req = makeReq({ eventId: '42', id: '1' });
    const res = makeRes();

    await deleteGalleryItem(req, res);

    expect(mockDb.get).not.toHaveBeenCalled();
  });
});

// ─── updateGalleryCaption ─────────────────────────────────────────────────────

describe('updateGalleryCaption (#430)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 200 and updates caption successfully', async () => {
    mockRequireEventAccess.mockResolvedValue(MOCK_EVENT);
    mockDb.get.mockResolvedValue({ id: 1, mime_type: 'image/jpeg' });
    mockDb.run.mockResolvedValue({});

    const req = makeReq({ eventId: '42', id: '1' }, { caption: 'Sunset stage' });
    const res = makeRes();

    await updateGalleryCaption(req, res);

    expect(mockDb.run).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE event_documents SET caption'),
      ['Sunset stage', '1', '42'],
    );
    expect((res as unknown as { statusCode: number }).statusCode).toBe(200);
    const body = (res as unknown as { body: { id: number; caption: string } }).body;
    expect(body.caption).toBe('Sunset stage');
  });

  it('returns 400 when caption is not a string', async () => {
    mockRequireEventAccess.mockResolvedValue(MOCK_EVENT);

    const req = makeReq({ eventId: '42', id: '1' }, { caption: 123 });
    const res = makeRes();

    await updateGalleryCaption(req, res);

    expect((res as unknown as { statusCode: number }).statusCode).toBe(400);
    const body = (res as unknown as { body: { error: string } }).body;
    expect(body.error).toContain('caption must be a string');
  });

  it('returns 404 when item is not found', async () => {
    mockRequireEventAccess.mockResolvedValue(MOCK_EVENT);
    mockDb.get.mockResolvedValue(undefined);

    const req = makeReq({ eventId: '42', id: '99' }, { caption: 'test' });
    const res = makeRes();

    await updateGalleryCaption(req, res);

    expect((res as unknown as { statusCode: number }).statusCode).toBe(404);
  });

  it('returns 400 when item is not an image', async () => {
    mockRequireEventAccess.mockResolvedValue(MOCK_EVENT);
    mockDb.get.mockResolvedValue({ id: 1, mime_type: 'application/pdf' });

    const req = makeReq({ eventId: '42', id: '1' }, { caption: 'test' });
    const res = makeRes();

    await updateGalleryCaption(req, res);

    expect((res as unknown as { statusCode: number }).statusCode).toBe(400);
  });

  it('trims caption and enforces 500-char max', async () => {
    mockRequireEventAccess.mockResolvedValue(MOCK_EVENT);
    mockDb.get.mockResolvedValue({ id: 1, mime_type: 'image/jpeg' });
    mockDb.run.mockResolvedValue({});

    const longCaption = 'x'.repeat(600);
    const req = makeReq({ eventId: '42', id: '1' }, { caption: longCaption });
    const res = makeRes();

    await updateGalleryCaption(req, res);

    const savedCaption: string = (mockDb.run.mock.calls[0][1] as unknown[])[0] as string;
    expect(savedCaption).toHaveLength(500);
  });

  it('returns nothing when access is denied', async () => {
    mockRequireEventAccess.mockResolvedValue(null);

    const req = makeReq({ eventId: '42', id: '1' }, { caption: 'test' });
    const res = makeRes();

    await updateGalleryCaption(req, res);

    expect(mockDb.get).not.toHaveBeenCalled();
  });
});
