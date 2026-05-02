import { Request, Response } from 'express';
import { getDatabase } from '../db/database.js';

export async function listAlbums(req: Request, res: Response): Promise<Response> {
  const eventId = req.params.eventId;
  const db = getDatabase();
  const albums = await db.all(`SELECT id, name, cover_photo_id, created_at, updated_at, (SELECT COUNT(*) FROM album_photos ap WHERE ap.album_id = albums.id) as photo_count FROM albums WHERE event_id = ? ORDER BY updated_at DESC`, [eventId]);
  return res.json({ albums });
}

export async function createAlbum(req: Request, res: Response): Promise<Response> {
  const eventId = req.params.eventId;
  const { name } = req.body ?? {};
  if (!name) return res.status(400).json({ error: 'Album name required' });
  const db = getDatabase();
  const r = await db.run(`INSERT INTO albums (event_id, name) VALUES (?, ?) RETURNING id`, [eventId, name]);
  const album = await db.get(`SELECT id, name, cover_photo_id, created_at FROM albums WHERE id = ?`, [r.lastID]);
  return res.status(201).json({ album });
}

export async function renameAlbum(req: Request, res: Response): Promise<Response> {
  const { albumId } = req.params as any;
  const { name } = req.body ?? {};
  if (!name) return res.status(400).json({ error: 'Album name required' });
  const db = getDatabase();
  await db.run(`UPDATE albums SET name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [name, albumId]);
  const album = await db.get(`SELECT id, name, cover_photo_id, updated_at FROM albums WHERE id = ?`, [albumId]);
  return res.json({ album });
}

export async function deleteAlbum(req: Request, res: Response): Promise<Response> {
  const { albumId } = req.params as any;
  const db = getDatabase();
  await db.run(`DELETE FROM albums WHERE id = ?`, [albumId]);
  return res.json({ message: 'Album deleted' });
}
