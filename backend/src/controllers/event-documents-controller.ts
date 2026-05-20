import { Request, Response } from 'express';
import fs from 'fs/promises';
import path from 'path';
import { getDatabase } from '../db/database.js';
import { requireEventAccess } from '../utils/event-access.js';
import { isHeicFile, stageHeicForConversion } from '../utils/image-processing.js';
import { scanFile } from '../utils/virus-scan.js';
import { logAuditEvent, AUDIT_ACTIONS } from '../utils/audit-log.js';

interface AuthRequest extends Request {
  user?: { id: number; email: string; role_id: number };
  file?: Express.Multer.File;
  files?: Express.Multer.File[] | Record<string, Express.Multer.File[]>;
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
    `SELECT id, event_id, original_name, file_name, mime_type, file_size, caption, created_at
     FROM event_documents
     WHERE event_id = $1
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
    // Clean up any files multer already saved
    const uploaded = Array.isArray(authReq.files)
      ? (authReq.files as Express.Multer.File[])
      : authReq.file
        ? [authReq.file]
        : [];
    for (const f of uploaded) await cleanupUploadedFile(f.path);
    return res as Response;
  }

  // Normalise: multer.array() populates req.files; multer.single() populates req.file
  const uploadedFiles: Express.Multer.File[] = Array.isArray(authReq.files)
    ? (authReq.files as Express.Multer.File[])
    : authReq.file
      ? [authReq.file]
      : [];

  if (uploadedFiles.length === 0) {
    return res.status(400).json({ error: 'No file uploaded.' });
  }

  const caption =
    typeof req.body?.caption === 'string' && req.body.caption.trim()
      ? req.body.caption.trim().slice(0, 255)
      : null;

  const db = getDatabase();
  const results: Array<{
    document: unknown;
    downloadUrl: string;
    conversionPending: boolean;
  }> = [];
  const errors: Array<{ fileName: string; error: string }> = [];

  for (const file of uploadedFiles) {
    const safeOriginalName = path.basename(file.originalname).replace(/[^a-zA-Z0-9._\-]/g, '_');

    // Virus / malware scan first (#565, #634)
    const scanResult = await scanFile(file.path);
    if (!scanResult.clean) {
      await cleanupUploadedFile(file.path);
      await logAuditEvent({
        db,
        userId: authReq.user?.id ?? null,
        email: authReq.user?.email ?? null,
        action: AUDIT_ACTIONS.UPLOAD_SCAN_FAIL,
        description: `Malicious event document detected: ${scanResult.threat}`,
        ipAddress: req.ip,
        severity: 'CRITICAL',
        targetType: 'event-document',
        targetId: req.params.eventId,
        context: { threat: scanResult.threat, scanner: scanResult.scanner },
      });
      errors.push({
        fileName: safeOriginalName,
        error: 'File failed security scan and was rejected.',
      });
      continue;
    }
    await logAuditEvent({
      db,
      userId: authReq.user?.id ?? null,
      email: authReq.user?.email ?? null,
      action: AUDIT_ACTIONS.UPLOAD_SCAN_PASS,
      description: 'Event document passed security scan',
      ipAddress: req.ip,
      severity: 'INFO',
      targetType: 'event-document',
      targetId: req.params.eventId,
      context: { scanner: scanResult.scanner, scannedAt: scanResult.scannedAt },
    });

    // Storage quota enforcement (#622)
    const eventRow = await db.get<{
      storage_quota_bytes: number;
      storage_used_bytes: number;
    }>(`SELECT storage_quota_bytes, storage_used_bytes FROM events WHERE id = $1`, [
      req.params.eventId,
    ]);
    if (eventRow) {
      const quota = Number(eventRow.storage_quota_bytes ?? 0);
      const used = Number(eventRow.storage_used_bytes ?? 0);
      if (quota > 0 && used + file.size > quota) {
        await cleanupUploadedFile(file.path);
        errors.push({
          fileName: safeOriginalName,
          error: 'Event storage quota exceeded.',
        });
        continue;
      }
    }

    // HEIC conversion pipeline (#617). Also normalise MIME when the browser
    // sends 'application/octet-stream' for HEIC files so the DB stores a
    // consistent image/heic value.
    const lowerName = safeOriginalName.toLowerCase();
    const isHeicByExtension = lowerName.endsWith('.heic') || lowerName.endsWith('.heif');
    const effectiveMime =
      file.mimetype === 'application/octet-stream' && isHeicByExtension
        ? 'image/heic'
        : file.mimetype;
    const heic = isHeicFile(safeOriginalName, effectiveMime);
    const staged = heic ? stageHeicForConversion(safeOriginalName) : null;

    try {
      const result = await db.run(
        `INSERT INTO event_documents (event_id, original_name, file_name, mime_type, file_size,
                                      caption, conversion_status, original_format, converted_file_name,
                                      created_by, updated_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         RETURNING id`,
        [
          req.params.eventId,
          safeOriginalName,
          file.filename,
          effectiveMime,
          file.size,
          caption,
          staged?.conversionStatus ?? 'none',
          staged?.originalFormat ?? null,
          staged?.convertedFileName ?? null,
          authReq.user!.id,
          authReq.user!.id,
        ],
      );

      await db.run(
        `UPDATE events SET storage_used_bytes = COALESCE(storage_used_bytes, 0) + $1,
                            updated_at = CURRENT_TIMESTAMP
          WHERE id = $2`,
        [file.size, req.params.eventId],
      );

      const document = await db.get(
        `SELECT id, event_id, original_name, file_name, mime_type, file_size, caption, created_at,
                conversion_status, original_format
         FROM event_documents WHERE id = $1`,
        [result.lastID],
      );

      results.push({
        document,
        downloadUrl: `/api/events/${req.params.eventId}/documents/${result.lastID}`,
        conversionPending: heic,
      });
    } catch (error) {
      console.error('Failed to save uploaded document to database:', error);
      await cleanupUploadedFile(file.path);
      errors.push({ fileName: safeOriginalName, error: 'Failed to save document.' });
    }
  }

  // Single-file backward-compatible response shape
  if (uploadedFiles.length === 1 && results.length === 1 && errors.length === 0) {
    return res.status(201).json(results[0]);
  }

  const status = results.length === 0 ? 422 : errors.length > 0 ? 207 : 201;
  return res.status(status).json({ documents: results, errors });
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
    `SELECT id, original_name, file_name FROM event_documents WHERE id = $1 AND event_id = $2`,
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
    `SELECT id, original_name, file_name, file_size FROM event_documents WHERE id = $1 AND event_id = $2`,
    [req.params.id, req.params.eventId],
  );

  if (!document) return res.status(404).json({ error: 'Document not found.' });

  try {
    await fs.unlink(assertSafePath(path.join(UPLOADS_DIR, document.file_name)));
  } catch (error) {
    console.error('Failed to delete event document file:', error);
  }

  await db.run('DELETE FROM event_documents WHERE id = $1 AND event_id = $2', [
    req.params.id,
    req.params.eventId,
  ]);
  // Reclaim storage on the event. GREATEST keeps the counter non-negative if
  // a stale upload left the counter out of sync.
  await db.run(
    `UPDATE events
        SET storage_used_bytes = GREATEST(COALESCE(storage_used_bytes, 0) - $1, 0),
            updated_at = CURRENT_TIMESTAMP
      WHERE id = $2`,
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
  const document = await db.get<{
    event_id: number;
    original_name: string;
    file_name: string;
    mime_type: string;
  }>(
    `SELECT event_id, original_name, file_name, mime_type
     FROM event_documents
     WHERE file_name = $1`,
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
  const safeMimeType =
    /^[a-zA-Z0-9][a-zA-Z0-9!#$&\-^_.+]*\/[a-zA-Z0-9][a-zA-Z0-9!#$&\-^_.+]*$/.test(
      document.mime_type,
    )
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
