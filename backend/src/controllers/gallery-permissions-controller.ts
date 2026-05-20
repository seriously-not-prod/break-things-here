/**
 * Gallery permission management (#618)
 *
 * Per-photo controls for visibility (private/event/public), allow_download,
 * allow_comments. Owner/admin/event-member can update. Surfaces both the
 * effective values and the audit metadata.
 */

import { Request, Response } from 'express';
import { getDatabase } from '../db/database.js';
import { requireEventAccess } from '../utils/event-access.js';

interface AuthRequest extends Request {
  user?: { id: number; email: string; role_id: number };
}

const VISIBILITY = ['private', 'event', 'public'] as const;

export async function updatePhotoPermissions(req: Request, res: Response): Promise<Response> {
  const authReq = req as AuthRequest;
  const { eventId, documentId } = req.params;

  const event = await requireEventAccess(authReq, res, eventId, { allowMembers: true });
  if (!event) return res as Response;

  const { visibility, allowDownload, allowComments } = (req.body ?? {}) as {
    visibility?: unknown;
    allowDownload?: unknown;
    allowComments?: unknown;
  };

  const db = getDatabase();
  const photo = await db.get<{
    id: number;
    mime_type: string;
    visibility: string;
    allow_download: boolean;
    allow_comments: boolean;
  }>(
    `SELECT id, mime_type, visibility, allow_download, allow_comments
       FROM event_documents WHERE id = $1 AND event_id = $2`,
    [documentId, eventId],
  );
  if (!photo) return res.status(404).json({ error: 'Photo not found.' });
  if (!photo.mime_type.startsWith('image/')) {
    return res.status(400).json({ error: 'Permissions only apply to gallery images.' });
  }

  let nextVisibility = photo.visibility;
  if (visibility !== undefined) {
    if (typeof visibility !== 'string' || !(VISIBILITY as readonly string[]).includes(visibility)) {
      return res.status(400).json({ error: `visibility must be one of: ${VISIBILITY.join(', ')}` });
    }
    nextVisibility = visibility;
  }

  const nextDownload = allowDownload === undefined ? photo.allow_download : Boolean(allowDownload);
  const nextComments = allowComments === undefined ? photo.allow_comments : Boolean(allowComments);

  await db.run(
    `UPDATE event_documents
        SET visibility = $1, allow_download = $2, allow_comments = $3,
            updated_by = $4, updated_at = CURRENT_TIMESTAMP
      WHERE id = $5 AND event_id = $6`,
    [nextVisibility, nextDownload, nextComments, authReq.user?.id ?? null, documentId, eventId],
  );

  return res.json({
    id: Number(documentId),
    visibility: nextVisibility,
    allowDownload: nextDownload,
    allowComments: nextComments,
  });
}

/**
 * GET /api/events/:eventId/gallery/storage
 * Returns quota usage so the frontend can render a progress indicator (#622).
 */
export async function getStorageUsage(req: Request, res: Response): Promise<Response> {
  const authReq = req as AuthRequest;
  const { eventId } = req.params;
  const event = await requireEventAccess(authReq, res, eventId, { allowMembers: true });
  if (!event) return res as Response;

  const db = getDatabase();
  const row = await db.get<{
    quota: number;
    used: number;
    image_count: number;
    image_bytes: number;
    pending_conversions: number;
  }>(
    `SELECT e.storage_quota_bytes AS quota,
            e.storage_used_bytes  AS used,
            (SELECT COUNT(*) FROM event_documents WHERE event_id = e.id AND mime_type LIKE 'image/%')::int  AS image_count,
            (SELECT COALESCE(SUM(file_size), 0) FROM event_documents WHERE event_id = e.id AND mime_type LIKE 'image/%')::bigint AS image_bytes,
            (SELECT COUNT(*) FROM event_documents WHERE event_id = e.id AND conversion_status = 'pending')::int AS pending_conversions
       FROM events e
      WHERE e.id = $1`,
    [eventId],
  );

  if (!row) return res.status(404).json({ error: 'Event not found.' });

  const quota = Number(row.quota ?? 0);
  const used = Number(row.used ?? 0);
  return res.json({
    quotaBytes: quota,
    usedBytes: used,
    remainingBytes: Math.max(quota - used, 0),
    percentUsed: quota > 0 ? Math.round((used / quota) * 10000) / 100 : 0,
    imageCount: Number(row.image_count ?? 0),
    imageBytes: Number(row.image_bytes ?? 0),
    pendingConversions: Number(row.pending_conversions ?? 0),
  });
}

/**
 * POST /api/events/:eventId/gallery/items/:documentId/recompute-conversion
 * Admin-only utility to flip a stuck conversion record (#617). The actual
 * conversion is performed by an external worker; this endpoint just resets
 * status so it gets re-picked.
 */
export async function recomputeConversion(req: Request, res: Response): Promise<Response> {
  const authReq = req as AuthRequest;
  const { eventId, documentId } = req.params;

  if (authReq.user?.role_id !== 3) {
    return res.status(403).json({ error: 'Admin role required.' });
  }

  const db = getDatabase();
  const existing = await db.get<{ id: number; original_format: string | null }>(
    'SELECT id, original_format FROM event_documents WHERE id = $1 AND event_id = $2',
    [documentId, eventId],
  );
  if (!existing) return res.status(404).json({ error: 'Photo not found.' });
  if (!existing.original_format) {
    return res.status(400).json({ error: 'Photo has no original_format recorded.' });
  }

  await db.run(
    `UPDATE event_documents
        SET conversion_status = 'pending', updated_at = CURRENT_TIMESTAMP,
            updated_by = $1
      WHERE id = $2`,
    [authReq.user?.id ?? null, documentId],
  );
  return res.json({ id: Number(documentId), conversionStatus: 'pending' });
}
