import { Request, Response } from 'express';
import { getDatabase } from '../db/database.js';

interface AuthRequest extends Request {
  user?: { id: number; email: string; role_id: number };
}

/** GET /api/events/:eventId/vendors */
export async function listVendors(req: Request, res: Response): Promise<Response> {
  const db = getDatabase();
  const { eventId } = req.params;
  const rows = await db.all(
    'SELECT * FROM vendors WHERE event_id = ? ORDER BY created_at ASC',
    [eventId],
  );
  return res.json({ vendors: rows });
}

/** POST /api/events/:eventId/vendors */
export async function createVendor(req: AuthRequest, res: Response): Promise<Response> {
  const { eventId } = req.params;
  const {
    name,
    category,
    contact_name,
    contact_email,
    contact_phone,
    cost,
    status,
    notes,
  } = req.body as {
    name?: string;
    category?: string;
    contact_name?: string;
    contact_email?: string;
    contact_phone?: string;
    cost?: number;
    status?: string;
    notes?: string;
  };

  if (!name?.trim()) return res.status(400).json({ error: 'Vendor name is required.' });

  const db = getDatabase();
  const event = await db.get('SELECT id FROM events WHERE id = ? AND deleted_at IS NULL', [eventId]);
  if (!event) return res.status(404).json({ error: 'Event not found.' });

  const result = await db.run(
    `INSERT INTO vendors
       (event_id, name, category, contact_name, contact_email, contact_phone, cost, status, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     RETURNING id`,
    [
      eventId,
      name.trim(),
      category?.trim() || null,
      contact_name?.trim() || null,
      contact_email?.trim().toLowerCase() || null,
      contact_phone?.trim() || null,
      cost ?? null,
      status || 'Pending',
      notes?.trim() || null,
    ],
  );

  const vendor = await db.get('SELECT * FROM vendors WHERE id = ?', [result.lastID]);
  return res.status(201).json({ vendor });
}

/** PATCH /api/events/:eventId/vendors/:id */
export async function updateVendor(req: Request, res: Response): Promise<Response> {
  const db = getDatabase();
  const { id } = req.params;

  const vendor = await db.get('SELECT * FROM vendors WHERE id = ?', [id]);
  if (!vendor) return res.status(404).json({ error: 'Vendor not found.' });

  const {
    name,
    category,
    contact_name,
    contact_email,
    contact_phone,
    cost,
    status,
    notes,
  } = req.body as Record<string, string | number>;

  const fields: string[] = [];
  const params: (string | number | null)[] = [];

  if (name !== undefined) { fields.push('name = ?'); params.push(String(name).trim()); }
  if (category !== undefined) { fields.push('category = ?'); params.push(String(category).trim() || null); }
  if (contact_name !== undefined) { fields.push('contact_name = ?'); params.push(String(contact_name).trim() || null); }
  if (contact_email !== undefined) { fields.push('contact_email = ?'); params.push(String(contact_email).trim().toLowerCase() || null); }
  if (contact_phone !== undefined) { fields.push('contact_phone = ?'); params.push(String(contact_phone).trim() || null); }
  if (cost !== undefined) { fields.push('cost = ?'); params.push(cost ?? null); }
  if (status !== undefined) { fields.push('status = ?'); params.push(String(status)); }
  if (notes !== undefined) { fields.push('notes = ?'); params.push(String(notes).trim() || null); }

  if (fields.length === 0) return res.status(400).json({ error: 'No fields to update.' });

  params.push(id);

  await db.run(`UPDATE vendors SET ${fields.join(', ')} WHERE id = ?`, params);
  const updated = await db.get('SELECT * FROM vendors WHERE id = ?', [id]);
  return res.json({ vendor: updated });
}

/** DELETE /api/events/:eventId/vendors/:id */
export async function deleteVendor(req: Request, res: Response): Promise<Response> {
  const db = getDatabase();
  const { id } = req.params;

  const vendor = await db.get('SELECT id FROM vendors WHERE id = ?', [id]);
  if (!vendor) return res.status(404).json({ error: 'Vendor not found.' });

  await db.run('DELETE FROM vendors WHERE id = ?', [id]);
  return res.json({ message: 'Vendor deleted.' });
}
