import { Request, Response } from 'express';
import path from 'path';
import fs from 'fs/promises';
import { getDatabase } from '../db/database.js';

interface AuthRequest extends Request {
  user?: { id: number; email: string; role_id: number };
  file?: Express.Multer.File;
}

interface EventRow {
  id: number;
  created_by: number;
  deleted_at: string | null;
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

async function cleanupUploadedFile(filePath?: string): Promise<void> {
  if (!filePath) return;

  const fileName = path.basename(filePath);
  if (!/^[a-zA-Z0-9._-]+$/.test(fileName)) {
    console.error('Skipped cleanup for invalid uploaded filename');
    return;
  }

  try {
    await fs.unlink(assertSafePath(path.join(UPLOADS_DIR, fileName)));
  } catch (error) {
    console.error('Failed to cleanup uploaded document:', error);
  }
}

async function getAuthorizedEvent(req: AuthRequest, res: Response, eventId: string): Promise<EventRow | null> {
  if (!req.user) {
    res.status(401).json({ error: 'Authentication required' });
    return null;
  }

  const db = getDatabase();
  const event = await db.get<EventRow>(
    'SELECT id, created_by, deleted_at FROM events WHERE id = ? AND deleted_at IS NULL',
    [eventId],
  );

  if (!event) {
    res.status(404).json({ error: 'Event not found.' });
    return null;
  }

  if (req.user.role_id < 3 && event.created_by !== req.user.id) {
    res.status(403).json({ error: 'Not authorised to manage documents for this event.' });
    return null;
  }

  return event;
}

export async function listEventDocuments(req: Request, res: Response): Promise<Response> {
  const authReq = req as AuthRequest;
  const event = await getAuthorizedEvent(authReq, res, req.params.eventId);
  if (!event) return res as Response;

  const db = getDatabase();
  const documents = await db.all(
    `SELECT id, event_id, original_name, file_name, mime_type, file_size, created_at
     FROM event_documents
     WHERE event_id = ?
     ORDER BY created_at DESC`,
    [req.params.eventId],
  );

  return res.json({ documents });
}

export async function uploadEventDocument(req: Request, res: Response): Promise<Response> {
  const authReq = req as AuthRequest;
  const event = await getAuthorizedEvent(authReq, res, req.params.eventId);
  if (!event) {
    await cleanupUploadedFile(req.file?.path);
    return res as Response;
  }

  if (!authReq.file) {
    return res.status(400).json({ error: 'No file uploaded.' });
  }

  const db = getDatabase();
  const result = await db.run(
    `INSERT INTO event_documents (event_id, original_name, file_name, mime_type, file_size, created_by)
     VALUES (?, ?, ?, ?, ?, ?)
     RETURNING id`,
    [
      req.params.eventId,
      authReq.file.originalname,
      authReq.file.filename,
      authReq.file.mimetype,
      authReq.file.size,
      authReq.user!.id,
    ],
  );

  const document = await db.get(
    `SELECT id, event_id, original_name, file_name, mime_type, file_size, created_at
     FROM event_documents WHERE id = ?`,
    [result.lastID],
  );

  return res.status(201).json({
    document,
    downloadUrl: `/api/events/${req.params.eventId}/documents/${result.lastID}`,
  });
}

export async function downloadEventDocument(req: Request, res: Response): Promise<Response> {
  const authReq = req as AuthRequest;
  const event = await getAuthorizedEvent(authReq, res, req.params.eventId);
  if (!event) return res as Response;

  const db = getDatabase();
  const document = await db.get<{ id: number; original_name: string; file_name: string }>(
    `SELECT id, original_name, file_name FROM event_documents WHERE id = ? AND event_id = ?`,
    [req.params.id, req.params.eventId],
  );

  if (!document) return res.status(404).json({ error: 'Document not found.' });

  const filePath = assertSafePath(path.join(UPLOADS_DIR, document.file_name));
  res.download(filePath, document.original_name);
  return res;
}

export async function deleteEventDocument(req: Request, res: Response): Promise<Response> {
  const authReq = req as AuthRequest;
  const event = await getAuthorizedEvent(authReq, res, req.params.eventId);
  if (!event) return res as Response;

  const db = getDatabase();
  const document = await db.get<{ id: number; original_name: string; file_name: string }>(
    `SELECT id, original_name, file_name FROM event_documents WHERE id = ? AND event_id = ?`,
    [req.params.id, req.params.eventId],
  );

  if (!document) return res.status(404).json({ error: 'Document not found.' });

  try {
    await fs.unlink(assertSafePath(path.join(UPLOADS_DIR, document.file_name)));
  } catch (error) {
    console.error('Failed to delete event document file:', error);
  }

  await db.run('DELETE FROM event_documents WHERE id = ? AND event_id = ?', [req.params.id, req.params.eventId]);
  return res.json({ message: 'Document deleted.' });
}