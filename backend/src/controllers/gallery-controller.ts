import { Request, Response } from 'express';
import fs from 'fs/promises';
import path from 'path';
import { getDatabase } from '../db/database.js';
import { requireEventAccess } from '../utils/event-access.js';

interface AuthRequest extends Request {
  user?: { id: number; email: string; role_id: number };
}

interface GalleryRow {
  id: number;
  file_name: string;
  original_name: string;
  mime_type: string;
  file_size: number;
  caption: string | null;
  created_at: string;
}

/** Maximum allowed caption length (characters). */
const MAX_CAPTION_LENGTH = 500;

/**
 * Builds a safe relative URL for a stored document file.
 * Uses path.basename to strip any directory components that could
 * reach outside the intended uploads path.
 */
function safeDocumentUrl(fileName: string): string {
  return `/api/uploads/event-documents/${path.basename(fileName)}`;
}

const UPLOADS_DIR = path.resolve('uploads/event-documents');
const UPLOADS_DIR_PREFIX = UPLOADS_DIR + path.sep;

function assertSafePath(filePath: string): string {
  const resolved = path.resolve(filePath);
  if (resolved !== UPLOADS_DIR && !resolved.startsWith(UPLOADS_DIR_PREFIX)) {
    throw new Error('Path traversal attempt blocked');
  }
  return resolved;
}

export async function listGallery(req: Request, res: Response): Promise<Response> {
  const authReq = req as AuthRequest;
  const { eventId } = req.params;
  const event = await requireEventAccess(authReq, res, eventId, {
    allowMembers: true,
    forbiddenMessage: 'Not authorised to view this event gallery.',
  });
  if (!event) {
    return res as Response;
  }

  const db = getDatabase();

  const rows = await db.all<GalleryRow>(
    `SELECT id, original_name, file_name, mime_type, file_size, created_at, caption
     FROM event_documents
     WHERE event_id = $1 AND mime_type LIKE 'image/%'
     ORDER BY created_at DESC`,
    [eventId],
  );

  const gallery = rows.map((row) => ({
    id: row.id,
    fileName: row.file_name,
    originalName: row.original_name,
    mimeType: row.mime_type,
    fileSize: row.file_size,
    createdAt: row.created_at,
    url: safeDocumentUrl(row.file_name),
    caption: row.caption ?? null,
  }));

  return res.json({ gallery });
}

export async function deleteGalleryItem(req: Request, res: Response): Promise<Response> {
  const authReq = req as AuthRequest;
  const { eventId, id } = req.params;

  const event = await requireEventAccess(authReq, res, eventId, {
    allowMembers: true,
    forbiddenMessage: 'Not authorised to manage this event gallery.',
  });
  if (!event) return res as Response;

  const db = getDatabase();
  const row = await db.get<{ id: number; file_name: string; mime_type: string }>(
    `SELECT id, file_name, mime_type FROM event_documents WHERE id = $1 AND event_id = $2`,
    [id, eventId],
  );

  if (!row) return res.status(404).json({ error: 'Gallery item not found.' });

  if (!row.mime_type.startsWith('image/')) {
    return res.status(400).json({ error: 'Item is not a gallery image.' });
  }

  try {
    await fs.unlink(assertSafePath(path.join(UPLOADS_DIR, row.file_name)));
  } catch (err) {
    console.error('Failed to delete gallery file from disk:', err);
  }

  await db.run('DELETE FROM event_documents WHERE id = $1 AND event_id = $2', [id, eventId]);
  return res.json({ message: 'Gallery item deleted.' });
}

/**
 * PATCH /api/events/:eventId/gallery/:id
 * Updates the caption of a gallery image.
 * Body: { caption: string }
 * Any event member may update captions.
 * Uses a separate SELECT (rather than RETURNING) for compatibility with the
 * SQLite adapter used in this project, which does not expose RETURNING rows
 * via db.run.
 */
export async function updateGalleryCaption(req: Request, res: Response): Promise<Response> {
  const authReq = req as AuthRequest;
  const { eventId, id } = req.params;

  const event = await requireEventAccess(authReq, res, eventId, { allowMembers: true });
  if (!event) return res as Response;

  const { caption } = req.body as { caption?: unknown };

  if (typeof caption !== 'string') {
    return res.status(400).json({ error: 'caption must be a string.' });
  }

  // Trim whitespace and silently truncate to the maximum allowed length.
  const sanitizedCaption = caption.trim().substring(0, MAX_CAPTION_LENGTH) || null;

  const db = getDatabase();

  // Fetch without MIME filter so we can distinguish 404 from 400.
  const existing = await db.get<{ id: number; mime_type: string }>(
    `SELECT id, mime_type FROM event_documents WHERE id = $1 AND event_id = $2`,
    [id, eventId],
  );
  if (!existing) return res.status(404).json({ error: 'Gallery item not found.' });

  if (!existing.mime_type.startsWith('image/')) {
    return res.status(400).json({ error: 'Item is not an image.' });
  }

  await db.run(
    `UPDATE event_documents SET caption = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 AND event_id = $3`,
    [sanitizedCaption, id, eventId],
  );

  return res.json({ id: Number(id), caption: sanitizedCaption });
}

// ─── Gallery Albums (#417, #459) ─────────────────────────────────────────────

interface AlbumRow {
  id: number;
  event_id: number;
  name: string;
  description: string | null;
  created_by: number | null;
  created_at: string;
  updated_at: string;
}

const MAX_ALBUM_NAME_LENGTH = 200;
const MAX_ALBUM_DESC_LENGTH = 1000;

export async function listAlbums(req: Request, res: Response): Promise<Response> {
  const authReq = req as AuthRequest;
  const { eventId } = req.params;
  const event = await requireEventAccess(authReq, res, eventId, { allowMembers: true });
  if (!event) return res as Response;

  const db = getDatabase();
  const rows = await db.all<AlbumRow>(
    `SELECT id, event_id, name, description, created_by, created_at, updated_at
     FROM gallery_albums WHERE event_id = $1 ORDER BY created_at ASC`,
    [eventId],
  );
  return res.json({ albums: rows });
}

export async function createAlbum(req: Request, res: Response): Promise<Response> {
  const authReq = req as AuthRequest;
  const { eventId } = req.params;
  const event = await requireEventAccess(authReq, res, eventId, { allowMembers: true });
  if (!event) return res as Response;

  const { name, description } = req.body as { name?: unknown; description?: unknown };
  if (typeof name !== 'string' || !name.trim()) {
    return res.status(400).json({ error: 'name is required.' });
  }
  const safeName = name.trim().substring(0, MAX_ALBUM_NAME_LENGTH);
  const safeDesc =
    typeof description === 'string'
      ? description.trim().substring(0, MAX_ALBUM_DESC_LENGTH) || null
      : null;

  const db = getDatabase();
  const userId = authReq.user?.id ?? null;
  await db.run(
    `INSERT INTO gallery_albums (event_id, name, description, created_by) VALUES ($1, $2, $3, $4)`,
    [eventId, safeName, safeDesc, userId],
  );
  const created = await db.get<AlbumRow>(
    `SELECT id, event_id, name, description, created_by, created_at, updated_at
     FROM gallery_albums WHERE event_id = $1 AND name = $2 ORDER BY created_at DESC LIMIT 1`,
    [eventId, safeName],
  );
  return res.status(201).json(created);
}

export async function updateAlbum(req: Request, res: Response): Promise<Response> {
  const authReq = req as AuthRequest;
  const { eventId, albumId } = req.params;
  const event = await requireEventAccess(authReq, res, eventId, { allowMembers: true });
  if (!event) return res as Response;

  const db = getDatabase();
  const existing = await db.get<AlbumRow>(
    `SELECT id FROM gallery_albums WHERE id = $1 AND event_id = $2`,
    [albumId, eventId],
  );
  if (!existing) return res.status(404).json({ error: 'Album not found.' });

  const { name, description } = req.body as { name?: unknown; description?: unknown };
  const safeName =
    typeof name === 'string' && name.trim()
      ? name.trim().substring(0, MAX_ALBUM_NAME_LENGTH)
      : null;
  const safeDesc =
    typeof description === 'string'
      ? description.trim().substring(0, MAX_ALBUM_DESC_LENGTH) || null
      : undefined;

  if (safeName !== null) {
    await db.run(
      `UPDATE gallery_albums SET name = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 AND event_id = $3`,
      [safeName, albumId, eventId],
    );
  }
  if (safeDesc !== undefined) {
    await db.run(
      `UPDATE gallery_albums SET description = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 AND event_id = $3`,
      [safeDesc, albumId, eventId],
    );
  }

  const updated = await db.get<AlbumRow>(
    `SELECT id, event_id, name, description, created_by, created_at, updated_at
     FROM gallery_albums WHERE id = $1 AND event_id = $2`,
    [albumId, eventId],
  );
  return res.json(updated);
}

export async function deleteAlbum(req: Request, res: Response): Promise<Response> {
  const authReq = req as AuthRequest;
  const { eventId, albumId } = req.params;
  const event = await requireEventAccess(authReq, res, eventId, { allowMembers: true });
  if (!event) return res as Response;

  const db = getDatabase();
  const existing = await db.get<{ id: number }>(
    `SELECT id FROM gallery_albums WHERE id = $1 AND event_id = $2`,
    [albumId, eventId],
  );
  if (!existing) return res.status(404).json({ error: 'Album not found.' });

  // Null out album_id on items that belong to this album
  await db.run(`UPDATE event_documents SET album_id = NULL WHERE album_id = $1`, [albumId]);
  await db.run(`DELETE FROM gallery_albums WHERE id = $1 AND event_id = $2`, [albumId, eventId]);
  return res.json({ message: 'Album deleted.' });
}

export async function assignItemToAlbum(req: Request, res: Response): Promise<Response> {
  const authReq = req as AuthRequest;
  const { eventId, id } = req.params;
  const event = await requireEventAccess(authReq, res, eventId, { allowMembers: true });
  if (!event) return res as Response;

  const { albumId } = req.body as { albumId?: unknown };

  // albumId can be null to unassign
  const targetAlbumId = albumId === null || albumId === undefined ? null : Number(albumId);
  if (targetAlbumId !== null && isNaN(targetAlbumId)) {
    return res.status(400).json({ error: 'albumId must be a number or null.' });
  }

  const db = getDatabase();
  const item = await db.get<{ id: number; mime_type: string }>(
    `SELECT id, mime_type FROM event_documents WHERE id = $1 AND event_id = $2`,
    [id, eventId],
  );
  if (!item) return res.status(404).json({ error: 'Gallery item not found.' });
  if (!item.mime_type.startsWith('image/')) {
    return res.status(400).json({ error: 'Item is not a gallery image.' });
  }

  if (targetAlbumId !== null) {
    const album = await db.get<{ id: number }>(
      `SELECT id FROM gallery_albums WHERE id = $1 AND event_id = $2`,
      [targetAlbumId, eventId],
    );
    if (!album) return res.status(404).json({ error: 'Album not found.' });
  }

  await db.run(
    `UPDATE event_documents SET album_id = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 AND event_id = $3`,
    [targetAlbumId, id, eventId],
  );
  return res.json({ id: Number(id), albumId: targetAlbumId });
}

// ─── Moderation queue (#417, #459) ───────────────────────────────────────────

interface ModerationRow extends GalleryRow {
  moderation_status: string;
  submitted_by: number | null;
  album_id: number | null;
}

export async function listModerationQueue(req: Request, res: Response): Promise<Response> {
  const authReq = req as AuthRequest;
  const { eventId } = req.params;
  const event = await requireEventAccess(authReq, res, eventId, { allowMembers: true });
  if (!event) return res as Response;

  const db = getDatabase();
  const rows = await db.all<ModerationRow>(
    `SELECT id, original_name, file_name, mime_type, file_size, created_at, caption,
            moderation_status, submitted_by, album_id
     FROM event_documents
     WHERE event_id = $1 AND mime_type LIKE 'image/%' AND moderation_status = 'pending'
     ORDER BY created_at ASC`,
    [eventId],
  );

  const items = rows.map((row) => ({
    id: row.id,
    fileName: row.file_name,
    originalName: row.original_name,
    mimeType: row.mime_type,
    fileSize: row.file_size,
    createdAt: row.created_at,
    url: safeDocumentUrl(row.file_name),
    caption: row.caption ?? null,
    moderationStatus: row.moderation_status,
    submittedBy: row.submitted_by ?? null,
    albumId: row.album_id ?? null,
  }));

  return res.json({ queue: items });
}

export async function moderateItem(req: Request, res: Response): Promise<Response> {
  const authReq = req as AuthRequest;
  const { eventId, id } = req.params;
  const event = await requireEventAccess(authReq, res, eventId, { allowMembers: true });
  if (!event) return res as Response;

  const { status } = req.body as { status?: unknown };
  if (status !== 'approved' && status !== 'rejected') {
    return res.status(400).json({ error: 'status must be "approved" or "rejected".' });
  }

  const db = getDatabase();
  const item = await db.get<{ id: number; mime_type: string }>(
    `SELECT id, mime_type FROM event_documents WHERE id = $1 AND event_id = $2`,
    [id, eventId],
  );
  if (!item) return res.status(404).json({ error: 'Gallery item not found.' });
  if (!item.mime_type.startsWith('image/')) {
    return res.status(400).json({ error: 'Item is not a gallery image.' });
  }

  await db.run(
    `UPDATE event_documents SET moderation_status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 AND event_id = $3`,
    [status, id, eventId],
  );
  return res.json({ id: Number(id), moderationStatus: status });
}

export async function submitGuestPhoto(req: Request, res: Response): Promise<Response> {
  // Re-use the multipart upload path but mark the item as pending moderation.
  // The actual file has already been stored by the document upload middleware.
  // This endpoint patches the last uploaded image for this event to pending status.
  const authReq = req as AuthRequest;
  const { eventId, id } = req.params;
  const event = await requireEventAccess(authReq, res, eventId, { allowMembers: true });
  if (!event) return res as Response;

  const db = getDatabase();
  const item = await db.get<{ id: number; mime_type: string }>(
    `SELECT id, mime_type FROM event_documents WHERE id = $1 AND event_id = $2`,
    [id, eventId],
  );
  if (!item) return res.status(404).json({ error: 'Gallery item not found.' });
  if (!item.mime_type.startsWith('image/')) {
    return res.status(400).json({ error: 'Item is not a gallery image.' });
  }

  const userId = authReq.user?.id ?? null;
  await db.run(
    `UPDATE event_documents SET moderation_status = 'pending', submitted_by = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 AND event_id = $3`,
    [userId, id, eventId],
  );
  return res.json({ id: Number(id), moderationStatus: 'pending' });
}

// ─── Gallery Slideshows (#417, #459) ─────────────────────────────────────────

interface SlideshowRow {
  id: number;
  event_id: number;
  name: string;
  created_by: number | null;
  created_at: string;
  updated_at: string;
}

interface SlideshowItemRow {
  id: number;
  slideshow_id: number;
  document_id: number;
  sort_order: number;
  file_name: string;
  original_name: string;
  mime_type: string;
  caption: string | null;
}

const MAX_SLIDESHOW_NAME_LENGTH = 200;

export async function listSlideshows(req: Request, res: Response): Promise<Response> {
  const authReq = req as AuthRequest;
  const { eventId } = req.params;
  const event = await requireEventAccess(authReq, res, eventId, { allowMembers: true });
  if (!event) return res as Response;

  const db = getDatabase();
  const rows = await db.all<SlideshowRow>(
    `SELECT id, event_id, name, created_by, created_at, updated_at
     FROM gallery_slideshows WHERE event_id = $1 ORDER BY created_at DESC`,
    [eventId],
  );
  return res.json({ slideshows: rows });
}

export async function createSlideshow(req: Request, res: Response): Promise<Response> {
  const authReq = req as AuthRequest;
  const { eventId } = req.params;
  const event = await requireEventAccess(authReq, res, eventId, { allowMembers: true });
  if (!event) return res as Response;

  const { name, itemIds } = req.body as { name?: unknown; itemIds?: unknown };
  if (typeof name !== 'string' || !name.trim()) {
    return res.status(400).json({ error: 'name is required.' });
  }
  const safeName = name.trim().substring(0, MAX_SLIDESHOW_NAME_LENGTH);
  const ids: number[] = Array.isArray(itemIds) ? (itemIds as number[]).map(Number) : [];

  const db = getDatabase();
  const userId = authReq.user?.id ?? null;
  await db.run(
    `INSERT INTO gallery_slideshows (event_id, name, created_by) VALUES ($1, $2, $3)`,
    [eventId, safeName, userId],
  );
  const created = await db.get<SlideshowRow>(
    `SELECT id, event_id, name, created_by, created_at, updated_at
     FROM gallery_slideshows WHERE event_id = $1 AND name = $2 ORDER BY created_at DESC LIMIT 1`,
    [eventId, safeName],
  );
  if (!created) return res.status(500).json({ error: 'Failed to create slideshow.' });

  if (ids.length > 0) {
    for (let i = 0; i < ids.length; i++) {
      await db.run(
        `INSERT INTO slideshow_items (slideshow_id, document_id, sort_order) VALUES ($1, $2, $3)
         ON CONFLICT (slideshow_id, document_id) DO NOTHING`,
        [created.id, ids[i], i],
      );
    }
  }

  return res.status(201).json(created);
}

export async function getSlideshowItems(req: Request, res: Response): Promise<Response> {
  const authReq = req as AuthRequest;
  const { eventId, slideshowId } = req.params;
  const event = await requireEventAccess(authReq, res, eventId, { allowMembers: true });
  if (!event) return res as Response;

  const db = getDatabase();
  const slideshow = await db.get<{ id: number }>(
    `SELECT id FROM gallery_slideshows WHERE id = $1 AND event_id = $2`,
    [slideshowId, eventId],
  );
  if (!slideshow) return res.status(404).json({ error: 'Slideshow not found.' });

  const rows = await db.all<SlideshowItemRow>(
    `SELECT si.id, si.slideshow_id, si.document_id, si.sort_order,
            ed.file_name, ed.original_name, ed.mime_type, ed.caption
     FROM slideshow_items si
     JOIN event_documents ed ON ed.id = si.document_id
     WHERE si.slideshow_id = $1
     ORDER BY si.sort_order ASC`,
    [slideshowId],
  );

  const items = rows.map((row) => ({
    id: row.id,
    slideshowId: row.slideshow_id,
    documentId: row.document_id,
    sortOrder: row.sort_order,
    fileName: row.file_name,
    originalName: row.original_name,
    mimeType: row.mime_type,
    caption: row.caption ?? null,
    url: safeDocumentUrl(row.file_name),
  }));

  return res.json({ items });
}

export async function updateSlideshow(req: Request, res: Response): Promise<Response> {
  const authReq = req as AuthRequest;
  const { eventId, slideshowId } = req.params;
  const event = await requireEventAccess(authReq, res, eventId, { allowMembers: true });
  if (!event) return res as Response;

  const db = getDatabase();
  const existing = await db.get<SlideshowRow>(
    `SELECT id FROM gallery_slideshows WHERE id = $1 AND event_id = $2`,
    [slideshowId, eventId],
  );
  if (!existing) return res.status(404).json({ error: 'Slideshow not found.' });

  const { name, itemIds } = req.body as { name?: unknown; itemIds?: unknown };
  if (typeof name === 'string' && name.trim()) {
    const safeName = name.trim().substring(0, MAX_SLIDESHOW_NAME_LENGTH);
    await db.run(
      `UPDATE gallery_slideshows SET name = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 AND event_id = $3`,
      [safeName, slideshowId, eventId],
    );
  }

  if (Array.isArray(itemIds)) {
    await db.run(`DELETE FROM slideshow_items WHERE slideshow_id = $1`, [slideshowId]);
    const ids = (itemIds as number[]).map(Number);
    for (let i = 0; i < ids.length; i++) {
      await db.run(
        `INSERT INTO slideshow_items (slideshow_id, document_id, sort_order) VALUES ($1, $2, $3)
         ON CONFLICT (slideshow_id, document_id) DO NOTHING`,
        [slideshowId, ids[i], i],
      );
    }
  }

  const updated = await db.get<SlideshowRow>(
    `SELECT id, event_id, name, created_by, created_at, updated_at
     FROM gallery_slideshows WHERE id = $1 AND event_id = $2`,
    [slideshowId, eventId],
  );
  return res.json(updated);
}

export async function deleteSlideshow(req: Request, res: Response): Promise<Response> {
  const authReq = req as AuthRequest;
  const { eventId, slideshowId } = req.params;
  const event = await requireEventAccess(authReq, res, eventId, { allowMembers: true });
  if (!event) return res as Response;

  const db = getDatabase();
  const existing = await db.get<{ id: number }>(
    `SELECT id FROM gallery_slideshows WHERE id = $1 AND event_id = $2`,
    [slideshowId, eventId],
  );
  if (!existing) return res.status(404).json({ error: 'Slideshow not found.' });

  await db.run(`DELETE FROM gallery_slideshows WHERE id = $1 AND event_id = $2`, [slideshowId, eventId]);
  return res.json({ message: 'Slideshow deleted.' });
}
