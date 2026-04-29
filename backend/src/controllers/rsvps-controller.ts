import { Request, Response } from 'express';
import { getDatabase } from '../db/database.js';

interface AuthRequest extends Request {
  user?: { id: number; email: string; role_id: number };
}

/** GET /api/events/:eventId/rsvps */
export async function listRsvps(req: Request, res: Response): Promise<Response> {
  const db = getDatabase();
  const { eventId } = req.params;
  const rows = await db.all('SELECT * FROM rsvps WHERE event_id = ? ORDER BY created_at DESC', [eventId]);
  return res.json({ rsvps: rows });
}

/** POST /api/events/:eventId/rsvps  (public — no auth) */
export async function createRsvp(req: Request, res: Response): Promise<Response> {
  const { eventId } = req.params;
  const { name, email, status, notes } = req.body as {
    name?: string;
    email?: string;
    status?: string;
    notes?: string;
  };

  if (!name?.trim()) return res.status(400).json({ error: 'Name is required.' });
  if (!email?.trim()) return res.status(400).json({ error: 'Email is required.' });

  const db = getDatabase();
  const event = await db.get('SELECT id FROM events WHERE id = ? AND deleted_at IS NULL', [eventId]);
  if (!event) return res.status(404).json({ error: 'Event not found.' });

  // Determine source based on whether request is authenticated
  const authReq = req as AuthRequest;
  const source = authReq.user ? 'internal' : 'public';

  const result = await db.run(
    `INSERT INTO rsvps (event_id, name, email, status, notes, source)
     VALUES (?, ?, ?, ?, ?, ?)
     RETURNING id`,
    [
      eventId,
      name.trim(),
      email.trim().toLowerCase(),
      status || 'Pending',
      notes?.trim() || null,
      source,
    ],
  );

  const rsvp = await db.get('SELECT * FROM rsvps WHERE id = ?', [result.lastID]);
  return res.status(201).json({ rsvp });
}

/** PATCH /api/events/:eventId/rsvps/:id */
export async function updateRsvp(req: Request, res: Response): Promise<Response> {
  const db = getDatabase();
  const { id } = req.params;

  const rsvp = await db.get('SELECT * FROM rsvps WHERE id = ?', [id]);
  if (!rsvp) return res.status(404).json({ error: 'RSVP not found.' });

  const { name, email, status, notes } = req.body as Record<string, string>;
  const fields: string[] = [];
  const params: (string | null)[] = [];

  if (name !== undefined) { fields.push('name = ?'); params.push(name.trim()); }
  if (email !== undefined) { fields.push('email = ?'); params.push(email.trim().toLowerCase()); }
  if (status !== undefined) { fields.push('status = ?'); params.push(status); }
  if (notes !== undefined) { fields.push('notes = ?'); params.push(notes.trim() || null); }

  if (fields.length === 0) return res.status(400).json({ error: 'No fields to update.' });

  fields.push('updated_at = CURRENT_TIMESTAMP');
  params.push(id);

  await db.run(`UPDATE rsvps SET ${fields.join(', ')} WHERE id = ?`, params);
  const updated = await db.get('SELECT * FROM rsvps WHERE id = ?', [id]);
  return res.json({ rsvp: updated });
}

/** DELETE /api/events/:eventId/rsvps/:id */
export async function deleteRsvp(req: Request, res: Response): Promise<Response> {
  const db = getDatabase();
  const { id } = req.params;

  const rsvp = await db.get('SELECT id FROM rsvps WHERE id = ?', [id]);
  if (!rsvp) return res.status(404).json({ error: 'RSVP not found.' });

  await db.run('DELETE FROM rsvps WHERE id = ?', [id]);
  return res.json({ message: 'RSVP deleted.' });
}
