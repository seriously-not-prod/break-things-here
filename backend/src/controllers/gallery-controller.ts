import { Request, Response } from 'express';
import { getDatabase } from '../db/database.js';

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
  if (!authReq.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const { eventId } = req.params;

  const db = getDatabase();

  const event = await db.get<{ id: number; deleted_at: string | null }>(
    'SELECT id, deleted_at FROM events WHERE id = ? AND deleted_at IS NULL',
    [eventId],
  );

  if (!event) {
    return res.status(404).json({ error: 'Event not found.' });
  }

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
