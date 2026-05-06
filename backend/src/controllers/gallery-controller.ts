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
     WHERE event_id = ? AND mime_type LIKE 'image/%'
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
    `SELECT id, file_name, mime_type FROM event_documents WHERE id = ? AND event_id = ?`,
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

  await db.run('DELETE FROM event_documents WHERE id = ? AND event_id = ?', [id, eventId]);
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
export async function updateCaption(req: Request, res: Response): Promise<Response> {
  const authReq = req as AuthRequest;
  const { eventId, id } = req.params;

  const event = await requireEventAccess(authReq, res, eventId, { allowMembers: true });
  if (!event) return res as Response;

  const { caption } = req.body as { caption?: unknown };

  if (caption !== undefined && typeof caption !== 'string') {
    return res.status(400).json({ error: 'caption must be a string.' });
  }

  const sanitizedCaption = typeof caption === 'string' ? caption.trim() || null : null;

  if (sanitizedCaption !== null && sanitizedCaption.length > MAX_CAPTION_LENGTH) {
    return res.status(400).json({ error: `Caption cannot exceed ${MAX_CAPTION_LENGTH} characters.` });
  }

  const db = getDatabase();

  const existing = await db.get<{ id: number }>(
    `SELECT id FROM event_documents WHERE id = ? AND event_id = ? AND mime_type LIKE 'image/%'`,
    [id, eventId],
  );
  if (!existing) return res.status(404).json({ error: 'Gallery item not found.' });

  await db.run(
    `UPDATE event_documents SET caption = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
    [sanitizedCaption, id],
  );

  const row = await db.get<GalleryRow>(
    `SELECT id, original_name, file_name, mime_type, file_size, created_at, caption
     FROM event_documents WHERE id = ?`,
    [id],
  );

  if (!row) return res.status(404).json({ error: 'Gallery item not found.' });

  return res.json({
    item: {
      id: row.id,
      fileName: row.file_name,
      originalName: row.original_name,
      mimeType: row.mime_type,
      fileSize: row.file_size,
      createdAt: row.created_at,
      url: safeDocumentUrl(row.file_name),
      caption: row.caption ?? null,
    },
  });
}
