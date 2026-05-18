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

// ─── listAlbums (#459) ───────────────────────────────────────────────────────

import {
  listAlbums,
  createAlbum,
  updateAlbum,
  deleteAlbum,
  assignItemToAlbum,
  listModerationQueue,
  moderateItem,
  submitGuestPhoto,
  listSlideshows,
  createSlideshow,
  getSlideshowItems,
  updateSlideshow,
  deleteSlideshow,
} from '../src/controllers/gallery-controller.js';

const MOCK_ALBUM = {
  id: 10,
  event_id: 42,
  name: 'Stage Photos',
  description: 'Photos from the stage',
  created_by: 1,
  created_at: '2026-05-01T10:00:00Z',
  updated_at: '2026-05-01T10:00:00Z',
};

describe('listAlbums (#459)', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('returns 200 with albums', async () => {
    mockRequireEventAccess.mockResolvedValue(MOCK_EVENT);
    mockDb.all.mockResolvedValue([MOCK_ALBUM]);

    const req = makeReq({ eventId: '42' });
    const res = makeRes();

    await listAlbums(req, res);

    expect((res as unknown as { statusCode: number }).statusCode).toBe(200);
    const body = (res as unknown as { body: { albums: unknown[] } }).body;
    expect(body.albums).toHaveLength(1);
    expect(body.albums[0]).toMatchObject({ name: 'Stage Photos' });
  });

  it('returns nothing when access is denied', async () => {
    mockRequireEventAccess.mockResolvedValue(null);
    const req = makeReq({ eventId: '42' });
    const res = makeRes();
    await listAlbums(req, res);
    expect(mockDb.all).not.toHaveBeenCalled();
  });
});

describe('createAlbum (#459)', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('returns 201 with created album', async () => {
    mockRequireEventAccess.mockResolvedValue(MOCK_EVENT);
    mockDb.run.mockResolvedValue({});
    mockDb.get.mockResolvedValue(MOCK_ALBUM);

    const req = makeReq({ eventId: '42' }, { name: 'Stage Photos', description: 'Photos from the stage' });
    const res = makeRes();

    await createAlbum(req, res);

    expect((res as unknown as { statusCode: number }).statusCode).toBe(201);
    const body = (res as unknown as { body: { name: string } }).body;
    expect(body.name).toBe('Stage Photos');
  });

  it('returns 400 when name is missing', async () => {
    mockRequireEventAccess.mockResolvedValue(MOCK_EVENT);

    const req = makeReq({ eventId: '42' }, { name: '' });
    const res = makeRes();

    await createAlbum(req, res);

    expect((res as unknown as { statusCode: number }).statusCode).toBe(400);
  });

  it('returns nothing when access is denied', async () => {
    mockRequireEventAccess.mockResolvedValue(null);
    const req = makeReq({ eventId: '42' }, { name: 'Test' });
    const res = makeRes();
    await createAlbum(req, res);
    expect(mockDb.run).not.toHaveBeenCalled();
  });
});

describe('updateAlbum (#459)', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('returns 200 with updated album', async () => {
    mockRequireEventAccess.mockResolvedValue(MOCK_EVENT);
    mockDb.get
      .mockResolvedValueOnce({ id: 10 })
      .mockResolvedValueOnce({ ...MOCK_ALBUM, name: 'Main Stage' });
    mockDb.run.mockResolvedValue({});

    const req = makeReq({ eventId: '42', albumId: '10' }, { name: 'Main Stage' });
    const res = makeRes();

    await updateAlbum(req, res);

    expect((res as unknown as { statusCode: number }).statusCode).toBe(200);
  });

  it('returns 404 when album not found', async () => {
    mockRequireEventAccess.mockResolvedValue(MOCK_EVENT);
    mockDb.get.mockResolvedValue(undefined);

    const req = makeReq({ eventId: '42', albumId: '99' }, { name: 'New Name' });
    const res = makeRes();

    await updateAlbum(req, res);

    expect((res as unknown as { statusCode: number }).statusCode).toBe(404);
  });
});

describe('deleteAlbum (#459)', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('returns 200 and deletes album', async () => {
    mockRequireEventAccess.mockResolvedValue(MOCK_EVENT);
    mockDb.get.mockResolvedValue({ id: 10 });
    mockDb.run.mockResolvedValue({});

    const req = makeReq({ eventId: '42', albumId: '10' });
    const res = makeRes();

    await deleteAlbum(req, res);

    expect((res as unknown as { statusCode: number }).statusCode).toBe(200);
    const body = (res as unknown as { body: { message: string } }).body;
    expect(body.message).toContain('deleted');
  });

  it('returns 404 when album not found', async () => {
    mockRequireEventAccess.mockResolvedValue(MOCK_EVENT);
    mockDb.get.mockResolvedValue(undefined);

    const req = makeReq({ eventId: '42', albumId: '99' });
    const res = makeRes();

    await deleteAlbum(req, res);

    expect((res as unknown as { statusCode: number }).statusCode).toBe(404);
  });
});

describe('assignItemToAlbum (#459)', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('assigns item to album', async () => {
    mockRequireEventAccess.mockResolvedValue(MOCK_EVENT);
    mockDb.get
      .mockResolvedValueOnce({ id: 1, mime_type: 'image/jpeg' })
      .mockResolvedValueOnce({ id: 10 });
    mockDb.run.mockResolvedValue({});

    const req = makeReq({ eventId: '42', id: '1' }, { albumId: 10 });
    const res = makeRes();

    await assignItemToAlbum(req, res);

    expect((res as unknown as { statusCode: number }).statusCode).toBe(200);
    const body = (res as unknown as { body: { id: number; albumId: number } }).body;
    expect(body.albumId).toBe(10);
  });

  it('unassigns item when albumId is null', async () => {
    mockRequireEventAccess.mockResolvedValue(MOCK_EVENT);
    mockDb.get.mockResolvedValue({ id: 1, mime_type: 'image/jpeg' });
    mockDb.run.mockResolvedValue({});

    const req = makeReq({ eventId: '42', id: '1' }, { albumId: null });
    const res = makeRes();

    await assignItemToAlbum(req, res);

    expect((res as unknown as { statusCode: number }).statusCode).toBe(200);
    const body = (res as unknown as { body: { albumId: null } }).body;
    expect(body.albumId).toBeNull();
  });

  it('returns 404 when item not found', async () => {
    mockRequireEventAccess.mockResolvedValue(MOCK_EVENT);
    mockDb.get.mockResolvedValue(undefined);

    const req = makeReq({ eventId: '42', id: '99' }, { albumId: 10 });
    const res = makeRes();

    await assignItemToAlbum(req, res);

    expect((res as unknown as { statusCode: number }).statusCode).toBe(404);
  });
});

// ─── Moderation (#459) ────────────────────────────────────────────────────────

describe('listModerationQueue (#459)', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('returns 200 with pending items', async () => {
    mockRequireEventAccess.mockResolvedValue(MOCK_EVENT);
    mockDb.all.mockResolvedValue([
      {
        id: 5,
        file_name: 'sub.jpg',
        original_name: 'submitted.jpg',
        mime_type: 'image/jpeg',
        file_size: 50000,
        caption: null,
        created_at: '2026-05-01T10:00:00Z',
        moderation_status: 'pending',
        submitted_by: 3,
        album_id: null,
      },
    ]);

    const req = makeReq({ eventId: '42' });
    const res = makeRes();

    await listModerationQueue(req, res);

    expect((res as unknown as { statusCode: number }).statusCode).toBe(200);
    const body = (res as unknown as { body: { queue: unknown[] } }).body;
    expect(body.queue).toHaveLength(1);
    expect((body.queue[0] as { moderationStatus: string }).moderationStatus).toBe('pending');
  });

  it('returns nothing when access denied', async () => {
    mockRequireEventAccess.mockResolvedValue(null);
    const req = makeReq({ eventId: '42' });
    const res = makeRes();
    await listModerationQueue(req, res);
    expect(mockDb.all).not.toHaveBeenCalled();
  });
});

describe('moderateItem (#459)', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('approves item successfully', async () => {
    mockRequireEventAccess.mockResolvedValue(MOCK_EVENT);
    mockDb.get.mockResolvedValue({ id: 5, mime_type: 'image/jpeg' });
    mockDb.run.mockResolvedValue({});

    const req = makeReq({ eventId: '42', id: '5' }, { status: 'approved' });
    const res = makeRes();

    await moderateItem(req, res);

    expect((res as unknown as { statusCode: number }).statusCode).toBe(200);
    const body = (res as unknown as { body: { id: number; moderationStatus: string } }).body;
    expect(body.moderationStatus).toBe('approved');
  });

  it('rejects item successfully', async () => {
    mockRequireEventAccess.mockResolvedValue(MOCK_EVENT);
    mockDb.get.mockResolvedValue({ id: 5, mime_type: 'image/jpeg' });
    mockDb.run.mockResolvedValue({});

    const req = makeReq({ eventId: '42', id: '5' }, { status: 'rejected' });
    const res = makeRes();

    await moderateItem(req, res);

    expect((res as unknown as { statusCode: number }).statusCode).toBe(200);
    const body = (res as unknown as { body: { moderationStatus: string } }).body;
    expect(body.moderationStatus).toBe('rejected');
  });

  it('returns 400 for invalid status', async () => {
    mockRequireEventAccess.mockResolvedValue(MOCK_EVENT);

    const req = makeReq({ eventId: '42', id: '5' }, { status: 'whatever' });
    const res = makeRes();

    await moderateItem(req, res);

    expect((res as unknown as { statusCode: number }).statusCode).toBe(400);
  });

  it('returns 404 when item not found', async () => {
    mockRequireEventAccess.mockResolvedValue(MOCK_EVENT);
    mockDb.get.mockResolvedValue(undefined);

    const req = makeReq({ eventId: '42', id: '99' }, { status: 'approved' });
    const res = makeRes();

    await moderateItem(req, res);

    expect((res as unknown as { statusCode: number }).statusCode).toBe(404);
  });

  it('returns nothing when access denied', async () => {
    mockRequireEventAccess.mockResolvedValue(null);
    const req = makeReq({ eventId: '42', id: '5' }, { status: 'approved' });
    const res = makeRes();
    await moderateItem(req, res);
    expect(mockDb.get).not.toHaveBeenCalled();
  });
});

describe('submitGuestPhoto (#459)', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('marks item as pending moderation', async () => {
    mockRequireEventAccess.mockResolvedValue(MOCK_EVENT);
    mockDb.get.mockResolvedValue({ id: 1, mime_type: 'image/jpeg' });
    mockDb.run.mockResolvedValue({});

    const req = makeReq({ eventId: '42', id: '1' });
    const res = makeRes();

    await submitGuestPhoto(req, res);

    expect((res as unknown as { statusCode: number }).statusCode).toBe(200);
    const body = (res as unknown as { body: { moderationStatus: string } }).body;
    expect(body.moderationStatus).toBe('pending');
  });

  it('returns 404 when item not found', async () => {
    mockRequireEventAccess.mockResolvedValue(MOCK_EVENT);
    mockDb.get.mockResolvedValue(undefined);

    const req = makeReq({ eventId: '42', id: '99' });
    const res = makeRes();

    await submitGuestPhoto(req, res);

    expect((res as unknown as { statusCode: number }).statusCode).toBe(404);
  });
});

// ─── Slideshows (#459) ────────────────────────────────────────────────────────

const MOCK_SLIDESHOW = {
  id: 20,
  event_id: 42,
  name: 'Highlights 2026',
  created_by: 1,
  created_at: '2026-05-01T10:00:00Z',
  updated_at: '2026-05-01T10:00:00Z',
};

describe('listSlideshows (#459)', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('returns 200 with slideshows', async () => {
    mockRequireEventAccess.mockResolvedValue(MOCK_EVENT);
    mockDb.all.mockResolvedValue([MOCK_SLIDESHOW]);

    const req = makeReq({ eventId: '42' });
    const res = makeRes();

    await listSlideshows(req, res);

    expect((res as unknown as { statusCode: number }).statusCode).toBe(200);
    const body = (res as unknown as { body: { slideshows: unknown[] } }).body;
    expect(body.slideshows).toHaveLength(1);
  });

  it('returns nothing when access denied', async () => {
    mockRequireEventAccess.mockResolvedValue(null);
    const req = makeReq({ eventId: '42' });
    const res = makeRes();
    await listSlideshows(req, res);
    expect(mockDb.all).not.toHaveBeenCalled();
  });
});

describe('createSlideshow (#459)', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('returns 201 with created slideshow', async () => {
    mockRequireEventAccess.mockResolvedValue(MOCK_EVENT);
    mockDb.run.mockResolvedValue({});
    mockDb.get.mockResolvedValue(MOCK_SLIDESHOW);

    const req = makeReq({ eventId: '42' }, { name: 'Highlights 2026', itemIds: [1, 2] });
    const res = makeRes();

    await createSlideshow(req, res);

    expect((res as unknown as { statusCode: number }).statusCode).toBe(201);
    const body = (res as unknown as { body: { name: string } }).body;
    expect(body.name).toBe('Highlights 2026');
  });

  it('returns 400 when name is missing', async () => {
    mockRequireEventAccess.mockResolvedValue(MOCK_EVENT);

    const req = makeReq({ eventId: '42' }, { name: '' });
    const res = makeRes();

    await createSlideshow(req, res);

    expect((res as unknown as { statusCode: number }).statusCode).toBe(400);
  });
});

describe('getSlideshowItems (#459)', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('returns items for valid slideshow', async () => {
    mockRequireEventAccess.mockResolvedValue(MOCK_EVENT);
    mockDb.get.mockResolvedValue({ id: 20 });
    mockDb.all.mockResolvedValue([
      {
        id: 1, slideshow_id: 20, document_id: 1, sort_order: 0,
        file_name: 'photo.jpg', original_name: 'concert.jpg',
        mime_type: 'image/jpeg', caption: null,
      },
    ]);

    const req = makeReq({ eventId: '42', slideshowId: '20' });
    const res = makeRes();

    await getSlideshowItems(req, res);

    expect((res as unknown as { statusCode: number }).statusCode).toBe(200);
    const body = (res as unknown as { body: { items: unknown[] } }).body;
    expect(body.items).toHaveLength(1);
  });

  it('returns 404 when slideshow not found', async () => {
    mockRequireEventAccess.mockResolvedValue(MOCK_EVENT);
    mockDb.get.mockResolvedValue(undefined);

    const req = makeReq({ eventId: '42', slideshowId: '99' });
    const res = makeRes();

    await getSlideshowItems(req, res);

    expect((res as unknown as { statusCode: number }).statusCode).toBe(404);
  });
});

describe('updateSlideshow (#459)', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('returns 200 with updated slideshow', async () => {
    mockRequireEventAccess.mockResolvedValue(MOCK_EVENT);
    mockDb.get
      .mockResolvedValueOnce({ id: 20 })
      .mockResolvedValueOnce({ ...MOCK_SLIDESHOW, name: 'Updated Name' });
    mockDb.run.mockResolvedValue({});

    const req = makeReq({ eventId: '42', slideshowId: '20' }, { name: 'Updated Name', itemIds: [1] });
    const res = makeRes();

    await updateSlideshow(req, res);

    expect((res as unknown as { statusCode: number }).statusCode).toBe(200);
  });

  it('returns 404 when slideshow not found', async () => {
    mockRequireEventAccess.mockResolvedValue(MOCK_EVENT);
    mockDb.get.mockResolvedValue(undefined);

    const req = makeReq({ eventId: '42', slideshowId: '99' }, { name: 'New Name' });
    const res = makeRes();

    await updateSlideshow(req, res);

    expect((res as unknown as { statusCode: number }).statusCode).toBe(404);
  });
});

describe('deleteSlideshow (#459)', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('returns 200 and deletes slideshow', async () => {
    mockRequireEventAccess.mockResolvedValue(MOCK_EVENT);
    mockDb.get.mockResolvedValue({ id: 20 });
    mockDb.run.mockResolvedValue({});

    const req = makeReq({ eventId: '42', slideshowId: '20' });
    const res = makeRes();

    await deleteSlideshow(req, res);

    expect((res as unknown as { statusCode: number }).statusCode).toBe(200);
    const body = (res as unknown as { body: { message: string } }).body;
    expect(body.message).toContain('deleted');
  });

  it('returns 404 when slideshow not found', async () => {
    mockRequireEventAccess.mockResolvedValue(MOCK_EVENT);
    mockDb.get.mockResolvedValue(undefined);

    const req = makeReq({ eventId: '42', slideshowId: '99' });
    const res = makeRes();

    await deleteSlideshow(req, res);

    expect((res as unknown as { statusCode: number }).statusCode).toBe(404);
  });

  it('returns nothing when access denied', async () => {
    mockRequireEventAccess.mockResolvedValue(null);
    const req = makeReq({ eventId: '42', slideshowId: '20' });
    const res = makeRes();
    await deleteSlideshow(req, res);
    expect(mockDb.get).not.toHaveBeenCalled();
  });
});
