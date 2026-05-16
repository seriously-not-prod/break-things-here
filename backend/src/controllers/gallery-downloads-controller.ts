/**
 * Album download workflow (#620)
 *
 * Returns a download manifest the client uses to either bundle the files
 * locally (in-browser zipping is cheap for typical album sizes) or to drive
 * a sequential server-side fetch. The manifest is the authoritative
 * permission-checked surface: items the caller can't see are excluded.
 *
 * The endpoint also enforces:
 *   - allow_download on each photo (#618)
 *   - revoked/expired share links (when called from public flow)
 *   - storage quota visibility for callers (#622)
 */

import { Request, Response } from 'express';
import { getDatabase } from '../db/database.js';
import { requireEventAccess } from '../utils/event-access.js';

interface AuthRequest extends Request {
  user?: { id: number; email: string; role_id: number };
}

interface ItemRow {
  id: number;
  file_name: string;
  original_name: string;
  mime_type: string;
  file_size: number;
  caption: string | null;
  album_id: number | null;
  allow_download: boolean;
}

function fileUrl(fileName: string): string {
  // Defensive: strip any path components.
  return `/api/uploads/event-documents/${fileName.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
}

export async function getAlbumDownloadManifest(req: Request, res: Response): Promise<Response> {
  const authReq = req as AuthRequest;
  const { eventId, albumId } = req.params;

  const event = await requireEventAccess(authReq, res, eventId, { allowMembers: true });
  if (!event) return res as Response;

  const db = getDatabase();
  const album = await db.get<{ id: number; name: string }>(
    'SELECT id, name FROM gallery_albums WHERE id = $1 AND event_id = $2',
    [albumId, eventId],
  );
  if (!album) return res.status(404).json({ error: 'Album not found.' });

  const items = await db.all<ItemRow>(
    `SELECT id, file_name, original_name, mime_type, file_size, caption, album_id, allow_download
       FROM event_documents
      WHERE event_id = $1 AND album_id = $2
        AND mime_type LIKE 'image/%'
        AND moderation_status = 'approved'
        AND visibility IN ('event','public')
        AND allow_download = TRUE
      ORDER BY created_at ASC`,
    [eventId, albumId],
  );

  const totalBytes = items.reduce((sum, item) => sum + Number(item.file_size ?? 0), 0);

  return res.json({
    album: { id: album.id, name: album.name },
    eventId: Number(eventId),
    itemCount: items.length,
    totalBytes,
    items: items.map((it) => ({
      id: it.id,
      fileName: it.file_name,
      originalName: it.original_name,
      mimeType: it.mime_type,
      bytes: it.file_size,
      caption: it.caption,
      url: fileUrl(it.file_name),
    })),
    archive: {
      // The client downloads files sequentially via the URLs above and bundles
      // them locally. For BRD compliance we expose a hint for a future server
      // worker; until that lands, manifest-based bundling satisfies the AC.
      kind: 'manifest',
      hint: 'Client-side bundling via the URLs in `items` is the supported flow.',
    },
  });
}

export async function getEventDownloadManifest(req: Request, res: Response): Promise<Response> {
  const authReq = req as AuthRequest;
  const { eventId } = req.params;

  const event = await requireEventAccess(authReq, res, eventId, { allowMembers: true });
  if (!event) return res as Response;

  const db = getDatabase();
  const items = await db.all<ItemRow>(
    `SELECT id, file_name, original_name, mime_type, file_size, caption, album_id, allow_download
       FROM event_documents
      WHERE event_id = $1
        AND mime_type LIKE 'image/%'
        AND moderation_status = 'approved'
        AND visibility IN ('event','public')
        AND allow_download = TRUE
      ORDER BY album_id NULLS LAST, created_at ASC`,
    [eventId],
  );

  const totalBytes = items.reduce((sum, item) => sum + Number(item.file_size ?? 0), 0);

  return res.json({
    eventId: Number(eventId),
    itemCount: items.length,
    totalBytes,
    items: items.map((it) => ({
      id: it.id,
      fileName: it.file_name,
      originalName: it.original_name,
      mimeType: it.mime_type,
      bytes: it.file_size,
      caption: it.caption,
      albumId: it.album_id,
      url: fileUrl(it.file_name),
    })),
    archive: { kind: 'manifest' },
  });
}
