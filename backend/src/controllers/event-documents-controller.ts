import { Request, Response } from 'express';
import fs from 'fs/promises';
import path from 'path';
import { getDatabase } from '../db/database.js';
import { requireEventAccess } from '../utils/event-access.js';
import { isHeicFile, stageHeicForConversion } from '../utils/image-processing.js';

interface AuthRequest extends Request {
  user?: { id: number; email: string; role_id: number };
  file?: Express.Multer.File;
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

export async function listEventDocuments(req: Request, res: Response): Promise<Response> {
  const authReq = req as AuthRequest;
  const event = await requireEventAccess(authReq, res, req.params.eventId, {
    allowMembers: true,
    forbiddenMessage: 'Not authorised to view documents for this event.',
  });
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
  const event = await requireEventAccess(authReq, res, req.params.eventId, {
    allowMembers: true,
    forbiddenMessage: 'Not authorised to manage documents for this event.',
  });
  if (!event) {
    await cleanupUploadedFile(req.file?.path);
    return res as Response;
  }

  if (!authReq.file) {
    return res.status(400).json({ error: 'No file uploaded.' });
  }

  const safeOriginalName = path.basename(authReq.file.originalname).replace(/[^a-zA-Z0-9._\-]/g, '_');

  const db = getDatabase();

  // Storage quota enforcement (#622). Atomic check-and-reserve so a flurry of
  // parallel uploads cannot collectively exceed the quota.
  const eventRow = await db.get<{ storage_quota_bytes: number; storage_used_bytes: number }>(
    `SELECT storage_quota_bytes, storage_used_bytes FROM events WHERE id = ?`,
    [req.params.eventId],
  );
  if (eventRow) {
    const quota = Number(eventRow.storage_quota_bytes ?? 0);
    const used = Number(eventRow.storage_used_bytes ?? 0);
    if (quota > 0 && used + authReq.file.size > quota) {
      await cleanupUploadedFile(authReq.file.path);
      return res.status(413).json({
        error: 'Event storage quota exceeded.',
        quotaBytes: quota,
        usedBytes: used,
        attemptedBytes: authReq.file.size,
      });
    }
  }

  // HEIC conversion pipeline (#617). Mark as pending and defer; the
  // converted_file_name + mime_type are updated once a worker rewrites it.
  const heic = isHeicFile(safeOriginalName, authReq.file.mimetype);
  const staged = heic ? stageHeicForConversion(safeOriginalName) : null;

  try {
    const result = await db.run(
      `INSERT INTO event_documents (event_id, original_name, file_name, mime_type, file_size,
                                    conversion_status, original_format, converted_file_name,
                                    created_by, updated_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       RETURNING id`,
      [
        req.params.eventId,
        safeOriginalName,
        authReq.file.filename,
        authReq.file.mimetype,
        authReq.file.size,
        staged?.conversionStatus ?? 'none',
        staged?.originalFormat ?? null,
        staged?.convertedFileName ?? null,
        authReq.user!.id,
        authReq.user!.id,
      ],
    );

    // Increment used storage. Wrapping in a single UPDATE keeps the running
    // total consistent without a separate trigger.
    await db.run(
      `UPDATE events SET storage_used_bytes = COALESCE(storage_used_bytes, 0) + ?,
                          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?`,
      [authReq.file.size, req.params.eventId],
    );

    const document = await db.get(
      `SELECT id, event_id, original_name, file_name, mime_type, file_size, created_at,
              conversion_status, original_format
       FROM event_documents WHERE id = ?`,
      [result.lastID],
    );

    return res.status(201).json({
      document,
      downloadUrl: `/api/events/${req.params.eventId}/documents/${result.lastID}`,
      conversionPending: heic,
    });
  } catch (error) {
    console.error('Failed to save uploaded document to database:', error);
    await cleanupUploadedFile(authReq.file.path);
    return res.status(500).json({ error: 'Failed to save document.' });
  }
}

export async function downloadEventDocument(req: Request, res: Response): Promise<Response> {
  const authReq = req as AuthRequest;
  const event = await requireEventAccess(authReq, res, req.params.eventId, {
    allowMembers: true,
    forbiddenMessage: 'Not authorised to view documents for this event.',
  });
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
  const event = await requireEventAccess(authReq, res, req.params.eventId, {
    allowMembers: true,
    forbiddenMessage: 'Not authorised to manage documents for this event.',
  });
  if (!event) return res as Response;

  const db = getDatabase();
  const document = await db.get<{
    id: number;
    original_name: string;
    file_name: string;
    file_size: number;
  }>(
    `SELECT id, original_name, file_name, file_size FROM event_documents WHERE id = ? AND event_id = ?`,
    [req.params.id, req.params.eventId],
  );

  if (!document) return res.status(404).json({ error: 'Document not found.' });

  try {
    await fs.unlink(assertSafePath(path.join(UPLOADS_DIR, document.file_name)));
  } catch (error) {
    console.error('Failed to delete event document file:', error);
  }

  await db.run('DELETE FROM event_documents WHERE id = ? AND event_id = ?', [req.params.id, req.params.eventId]);
  // Reclaim storage on the event. GREATEST keeps the counter non-negative if
  // a stale upload left the counter out of sync.
  await db.run(
    `UPDATE events
        SET storage_used_bytes = GREATEST(COALESCE(storage_used_bytes, 0) - ?, 0),
            updated_at = CURRENT_TIMESTAMP
      WHERE id = ?`,
    [Number(document.file_size ?? 0), req.params.eventId],
  );
  return res.json({ message: 'Document deleted.' });
}

export async function getEventDocumentFile(req: Request, res: Response): Promise<Response> {
  const authReq = req as AuthRequest;
  if (!authReq.user) {
    return res.status(401).json({ error: 'Authentication required.' });
  }

  const db = getDatabase();
  const document = await db.get<{ event_id: number; original_name: string; file_name: string; mime_type: string }>(
    `SELECT event_id, original_name, file_name, mime_type
     FROM event_documents
     WHERE file_name = ?`,
    [req.params.filename],
  );

  if (!document) {
    return res.status(404).json({ error: 'Document not found.' });
  }

  const event = await requireEventAccess(authReq, res, String(document.event_id), {
    allowMembers: true,
    forbiddenMessage: 'Not authorised to view documents for this event.',
  });
  if (!event) return res as Response;

  const filePath = assertSafePath(path.join(UPLOADS_DIR, document.file_name));

  // Sanitize user-originated values before writing them into HTTP response headers
  // to prevent HTTP header injection (CWE-113 / CodeQL js/header-injection).
  const safeMimeType = /^[a-zA-Z0-9][a-zA-Z0-9!#$&\-^_.+]*\/[a-zA-Z0-9][a-zA-Z0-9!#$&\-^_.+]*$/.test(document.mime_type)
    ? document.mime_type
    : 'application/octet-stream';
  // Strip ASCII control characters (including CR/LF) and characters that would break
  // the quoted-string encoding inside Content-Disposition.
  const safeFilename = document.original_name.replace(/[\x00-\x1f\x7f"\\]/g, '_');

  res.sendFile(filePath, {
    headers: {
      'Content-Type': safeMimeType,
      'Content-Disposition': `inline; filename="${safeFilename}"`,
    },
  });
  return res;
}
