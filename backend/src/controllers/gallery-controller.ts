import { Request, Response } from 'express';
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
  created_at: string;
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
    `SELECT id, original_name, file_name, mime_type, file_size, created_at
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
    url: `/api/uploads/event-documents/${row.file_name}`,
  }));

  return res.json({ gallery });
}
