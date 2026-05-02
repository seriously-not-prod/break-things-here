import { Request, Response } from 'express';
import { getDatabase } from '../db/database.js';

export async function getMediaStats(req: Request, res: Response): Promise<Response> {
  const eventId = req.params.eventId;
  const db = getDatabase();

  const docTotal = await db.get<{ total: number }>(
    `SELECT COALESCE(SUM(file_size),0) as total FROM event_documents WHERE event_id = ?`,
    [eventId],
  );

  const photoTotal = await db.get<{ total: number }>(
    `SELECT COALESCE(SUM(file_size),0) as total FROM event_photos WHERE event_id = ?`,
    [eventId],
  );

  const docsCount = await db.get<{ count: number }>(
    `SELECT COUNT(*) as count FROM event_documents WHERE event_id = ?`,
    [eventId],
  );

  const photosCount = await db.get<{ count: number }>(
    `SELECT COUNT(*) as count FROM event_photos WHERE event_id = ?`,
    [eventId],
  );

  const albumsCount = await db.get<{ count: number }>(
    `SELECT COUNT(*) as count FROM albums WHERE event_id = ?`,
    [eventId],
  );

  const storageUsed = (docTotal?.total ?? 0) + (photoTotal?.total ?? 0);
  const storageLimit = 100 * 1024 * 1024; // 100 MB per event

  return res.json({
    totalDocuments: docsCount?.count ?? 0,
    totalPhotos: photosCount?.count ?? 0,
    albumsCreated: albumsCount?.count ?? 0,
    storageUsed,
    storageLimit,
  });
}

export async function recentDocuments(req: Request, res: Response): Promise<Response> {
  const eventId = req.params.eventId;
  const db = getDatabase();
  const documents = await db.all(
    `SELECT id, display_name, original_name, file_name, file_size, created_at FROM event_documents WHERE event_id = ? ORDER BY created_at DESC LIMIT 5`,
    [eventId],
  );
  return res.json({ documents });
}

export async function recentPhotos(req: Request, res: Response): Promise<Response> {
  const eventId = req.params.eventId;
  const db = getDatabase();
  const photos = await db.all(
    `SELECT id, original_name, file_name, file_size, caption, is_cover FROM event_photos WHERE event_id = ? ORDER BY created_at DESC LIMIT 8`,
    [eventId],
  );
  return res.json({ photos });
}
