import { Request, Response } from 'express';
import { getDatabase } from '../db/database.js';

interface AuthRequest extends Request {
  user?: { id: number; email: string; role_id: number };
}

/** GET /api/events/:eventId/venues */
export async function listVenues(req: Request, res: Response): Promise<Response> {
  const db = getDatabase();
  const { eventId } = req.params;
  const rows = await db.all(
    'SELECT * FROM venues WHERE event_id = ? ORDER BY created_at ASC',
    [eventId],
  );
  return res.json({ venues: rows });
}

/** POST /api/events/:eventId/venues */
export async function createVenue(req: AuthRequest, res: Response): Promise<Response> {
  const { eventId } = req.params;
  const {
    name,
    address,
    city,
    capacity,
    contact_name,
    contact_email,
    contact_phone,
    status,
    notes,
  } = req.body as {
    name?: string;
    address?: string;
    city?: string;
    capacity?: number;
    contact_name?: string;
    contact_email?: string;
    contact_phone?: string;
    status?: string;
    notes?: string;
  };

  if (!name?.trim()) return res.status(400).json({ error: 'Venue name is required.' });

  const db = getDatabase();
  const event = await db.get('SELECT id FROM events WHERE id = ? AND deleted_at IS NULL', [eventId]);
  if (!event) return res.status(404).json({ error: 'Event not found.' });

  const result = await db.run(
    `INSERT INTO venues
       (event_id, name, address, city, capacity, contact_name, contact_email, contact_phone, status, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     RETURNING id`,
    [
      eventId,
      name.trim(),
      address?.trim() || null,
      city?.trim() || null,
      capacity ?? null,
      contact_name?.trim() || null,
      contact_email?.trim().toLowerCase() || null,
      contact_phone?.trim() || null,
      status || 'Tentative',
      notes?.trim() || null,
    ],
  );

  const venue = await db.get('SELECT * FROM venues WHERE id = ?', [result.lastID]);
  return res.status(201).json({ venue });
}

/** PATCH /api/events/:eventId/venues/:id */
export async function updateVenue(req: Request, res: Response): Promise<Response> {
  const db = getDatabase();
  const { id } = req.params;

  const venue = await db.get('SELECT * FROM venues WHERE id = ?', [id]);
  if (!venue) return res.status(404).json({ error: 'Venue not found.' });

  const {
    name,
    address,
    city,
    capacity,
    contact_name,
    contact_email,
    contact_phone,
    status,
    notes,
  } = req.body as Record<string, string | number>;

  const fields: string[] = [];
  const params: (string | number | null)[] = [];

  if (name !== undefined) { fields.push('name = ?'); params.push(String(name).trim()); }
  if (address !== undefined) { fields.push('address = ?'); params.push(String(address).trim() || null); }
  if (city !== undefined) { fields.push('city = ?'); params.push(String(city).trim() || null); }
  if (capacity !== undefined) { fields.push('capacity = ?'); params.push(capacity ?? null); }
  if (contact_name !== undefined) { fields.push('contact_name = ?'); params.push(String(contact_name).trim() || null); }
  if (contact_email !== undefined) { fields.push('contact_email = ?'); params.push(String(contact_email).trim().toLowerCase() || null); }
  if (contact_phone !== undefined) { fields.push('contact_phone = ?'); params.push(String(contact_phone).trim() || null); }
  if (status !== undefined) { fields.push('status = ?'); params.push(String(status)); }
  if (notes !== undefined) { fields.push('notes = ?'); params.push(String(notes).trim() || null); }

  if (fields.length === 0) return res.status(400).json({ error: 'No fields to update.' });

  fields.push('updated_at = CURRENT_TIMESTAMP');
  params.push(id);

  await db.run(`UPDATE venues SET ${fields.join(', ')} WHERE id = ?`, params);
  const updated = await db.get('SELECT * FROM venues WHERE id = ?', [id]);
  return res.json({ venue: updated });
}

/** DELETE /api/events/:eventId/venues/:id */
export async function deleteVenue(req: Request, res: Response): Promise<Response> {
  const db = getDatabase();
  const { id } = req.params;

  const venue = await db.get('SELECT id FROM venues WHERE id = ?', [id]);
  if (!venue) return res.status(404).json({ error: 'Venue not found.' });

  await db.run('DELETE FROM venues WHERE id = ?', [id]);
  return res.json({ message: 'Venue deleted.' });
}
