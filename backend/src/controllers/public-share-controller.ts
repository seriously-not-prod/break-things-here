import { Request, Response } from 'express';
import path from 'path';
import { getDatabase } from '../db/database.js';

const PHOTOS_DIR = path.resolve('uploads/event-photos');

export async function publicPhotoView(req: Request, res: Response): Promise<Response> {
  const token = req.params.token;
  const db = getDatabase();
  const row = await db.get(`SELECT p.id, p.original_name, p.file_name, p.mime_type FROM photo_shares ps JOIN event_photos p ON p.id = ps.photo_id WHERE ps.token = ?`, [token]);
  if (!row) return res.status(404).send('Not found');
  const filePath = path.join(PHOTOS_DIR, row.file_name);
  // Stream the file inline
  res.setHeader('Content-Type', row.mime_type || 'application/octet-stream');
  res.sendFile(filePath, (err) => {
    if (err) {
      console.error('Failed to send shared photo', err);
      res.status(500).end();
    }
  });
  return res;
}
