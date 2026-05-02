import { Request, Response } from 'express';
import path from 'path';
import fs from 'fs/promises';
import crypto from 'crypto';
import { getDatabase } from '../db/database.js';

const PHOTOS_DIR = path.resolve('uploads/event-photos');
const PHOTOS_DIR_PREFIX = PHOTOS_DIR + path.sep;

function assertSafePath(filePath: string): string {
  const resolved = path.resolve(filePath);
  if (resolved !== PHOTOS_DIR && !resolved.startsWith(PHOTOS_DIR_PREFIX)) {
    throw new Error('Path traversal attempt blocked');
  }
  return resolved;
}

async function cleanupUploadedFiles(files?: Express.Multer.File[] | Express.Multer.File) {
  if (!files) return;
  const list = Array.isArray(files) ? files : [files];
  for (const f of list) {
    try {
      await fs.unlink(assertSafePath(path.join(PHOTOS_DIR, f.filename)));
    } catch (err) {
      console.error('Failed to cleanup uploaded photo', err);
    }
  }
}

async function getAuthorizedEvent(req: Request, res: Response, eventId: string) {
  const user = (req as any).user;
  if (!user) {
    res.status(401).json({ error: 'Authentication required' });
    return null;
  }
  const db = getDatabase();
  const event = await db.get('SELECT id, created_by FROM events WHERE id = ? AND deleted_at IS NULL', [eventId]);
  if (!event) {
    res.status(404).json({ error: 'Event not found.' });
    return null;
  }
  if (user.role_id < 3 && event.created_by !== user.id) {
    res.status(403).json({ error: 'Not authorised to manage photos for this event.' });
    return null;
  }
  return event;
}

export async function listEventPhotos(req: Request, res: Response): Promise<Response> {
  const event = await getAuthorizedEvent(req, res, req.params.eventId);
  if (!event) return res as Response;

  const db = getDatabase();
  const photos = await db.all(
    `SELECT id, original_name, file_name, mime_type, file_size, caption, status, is_cover, created_at, created_by
     FROM event_photos WHERE event_id = ? ORDER BY created_at DESC`,
    [req.params.eventId],
  );
  return res.json({ photos });
}

export async function uploadEventPhotos(req: Request, res: Response): Promise<Response> {
  const event = await getAuthorizedEvent(req, res, req.params.eventId);
  if (!event) {
    await cleanupUploadedFiles((req as any).files);
    return res as Response;
  }

  const files = (req as any).files as Express.Multer.File[] | undefined;
  if (!files || files.length === 0) return res.status(400).json({ error: 'No files uploaded.' });

  // Enforce per-file and per-event limits
  const MAX_FILE = 10 * 1024 * 1024;
  const MAX_EVENT = 100 * 1024 * 1024;
  const db = getDatabase();
  const usedRow = await db.get<{ total: number }>(
    `SELECT COALESCE((SELECT SUM(file_size) FROM event_documents WHERE event_id = ?),0) + COALESCE((SELECT SUM(file_size) FROM event_photos WHERE event_id = ?),0) as total`,
    [req.params.eventId, req.params.eventId],
  );
  const used = usedRow?.total ?? 0;

  let totalNew = 0;
  for (const f of files) {
    if (f.size > MAX_FILE) {
      await cleanupUploadedFiles(files);
      return res.status(413).json({ error: `File ${f.originalname} exceeds 10 MB limit` });
    }
    totalNew += f.size;
  }

  if (used + totalNew > MAX_EVENT) {
    await cleanupUploadedFiles(files);
    return res.status(413).json({ error: 'Uploading these files would exceed event storage limit (100 MB).' });
  }

  const inserted: any[] = [];
  try {
    for (const f of files) {
      const r = await db.run(
        `INSERT INTO event_photos (event_id, original_name, file_name, mime_type, file_size, created_by) VALUES (?, ?, ?, ?, ?, ?) RETURNING id`,
        [req.params.eventId, f.originalname, f.filename, f.mimetype, f.size, (req as any).user.id],
      );
      const photo = await db.get(`SELECT id, original_name, file_name, mime_type, file_size, created_at FROM event_photos WHERE id = ?`, [r.lastID]);
      inserted.push({ photo, downloadUrl: `/api/events/${req.params.eventId}/photos/${r.lastID}/download` });
    }
    return res.status(201).json({ photos: inserted });
  } catch (err) {
    console.error('Failed to save photo records', err);
    await cleanupUploadedFiles(files);
    return res.status(500).json({ error: 'Failed to save photos' });
  }
}

export async function downloadEventPhoto(req: Request, res: Response): Promise<Response> {
  const event = await getAuthorizedEvent(req, res, req.params.eventId);
  if (!event) return res as Response;

  const db = getDatabase();
  const photo = await db.get<{ id: number; original_name: string; file_name: string }>(
    `SELECT id, original_name, file_name FROM event_photos WHERE id = ? AND event_id = ?`,
    [req.params.photoId, req.params.eventId],
  );
  if (!photo) return res.status(404).json({ error: 'Photo not found.' });

  const filePath = assertSafePath(path.join(PHOTOS_DIR, photo.file_name));
  res.download(filePath, photo.original_name);
  return res;
}

export async function updateEventPhoto(req: Request, res: Response): Promise<Response> {
  const event = await getAuthorizedEvent(req, res, req.params.eventId);
  if (!event) return res as Response;

  const { caption, status, setAsCover } = req.body ?? {};
  const db = getDatabase();

  if (setAsCover) {
    // unset others
    await db.run(`UPDATE event_photos SET is_cover = 0 WHERE event_id = ?`, [req.params.eventId]);
    await db.run(`UPDATE event_photos SET is_cover = 1 WHERE id = ? AND event_id = ?`, [req.params.photoId, req.params.eventId]);
  }

  await db.run(`UPDATE event_photos SET caption = COALESCE(?, caption), status = COALESCE(?, status) WHERE id = ? AND event_id = ?`, [caption, status, req.params.photoId, req.params.eventId]);
  const photo = await db.get(`SELECT id, original_name, file_name, caption, status, is_cover FROM event_photos WHERE id = ?`, [req.params.photoId]);
  return res.json({ photo });
}

export async function deleteEventPhoto(req: Request, res: Response): Promise<Response> {
  const event = await getAuthorizedEvent(req, res, req.params.eventId);
  if (!event) return res as Response;

  const db = getDatabase();
  const photo = await db.get<{ id: number; file_name: string }>(`SELECT id, file_name FROM event_photos WHERE id = ? AND event_id = ?`, [req.params.photoId, req.params.eventId]);
  if (!photo) return res.status(404).json({ error: 'Photo not found.' });
  try {
    await fs.unlink(assertSafePath(path.join(PHOTOS_DIR, photo.file_name)));
  } catch (err) {
    console.error('Failed to delete photo file', err);
  }
  await db.run(`DELETE FROM event_photos WHERE id = ? AND event_id = ?`, [req.params.photoId, req.params.eventId]);
  return res.json({ message: 'Photo deleted.' });
}

export async function sharePhoto(req: Request, res: Response): Promise<Response> {
  const event = await getAuthorizedEvent(req, res, req.params.eventId);
  if (!event) return res as Response;

  const db = getDatabase();
  const photo = await db.get(`SELECT id FROM event_photos WHERE id = ? AND event_id = ?`, [req.params.photoId, req.params.eventId]);
  if (!photo) return res.status(404).json({ error: 'Photo not found.' });

  const token = crypto.randomBytes(24).toString('hex');
  await db.run(`INSERT INTO photo_shares (token, photo_id) VALUES (?, ?)`, [token, req.params.photoId]);
  return res.json({ shareUrl: `/share/photo/${token}` });
}
