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
    `SELECT id, original_name, file_name, mime_type, file_size, caption, created_at
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
    caption: row.caption ?? '',
    createdAt: row.created_at,
    url: `/api/uploads/event-documents/${row.file_name}`,
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

export async function updateGalleryCaption(req: Request, res: Response): Promise<Response> {
  const authReq = req as AuthRequest;
  const { eventId, id } = req.params;

  const event = await requireEventAccess(authReq, res, eventId, {
    allowMembers: true,
    forbiddenMessage: 'Not authorised to manage this event gallery.',
  });
  if (!event) return res as Response;

  const body = req.body as { caption?: unknown };
  if (typeof body.caption !== 'string') {
    return res.status(400).json({ error: 'caption must be a string.' });
  }

  const caption = body.caption.trim().slice(0, 500);

  const db = getDatabase();
  const row = await db.get<{ id: number; mime_type: string }>(
    `SELECT id, mime_type FROM event_documents WHERE id = ? AND event_id = ?`,
    [id, eventId],
  );

  if (!row) return res.status(404).json({ error: 'Gallery item not found.' });

  if (!row.mime_type.startsWith('image/')) {
    return res.status(400).json({ error: 'Item is not a gallery image.' });
  }

  await db.run(
    `UPDATE event_documents SET caption = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND event_id = ?`,
    [caption, id, eventId],
  );

  return res.json({ id: row.id, caption });
}
