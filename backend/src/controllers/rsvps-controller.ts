import { Request, Response } from 'express';
import { getDatabase } from '../db/database.js';

interface AuthRequest extends Request {
  user?: { id: number; email: string; role_id: number };
}

function parseGuests(value: unknown): number {
  if (value === undefined || value === null || value === '') return 1;
  const guests = Number(value);
  if (!Number.isInteger(guests) || guests < 1) {
    throw new Error('Guest count must be a positive integer.');
  }
  return guests;
}

function isGoing(status?: string): boolean {
  return status === 'Going';
}

async function getEventCapacity(db: ReturnType<typeof getDatabase>, eventId: string): Promise<number | null> {
  const event = await db.get<{ capacity: number | null }>('SELECT capacity FROM events WHERE id = ? AND deleted_at IS NULL', [eventId]);
  return event?.capacity ?? null;
}

async function getGoingGuestsTotal(db: ReturnType<typeof getDatabase>, eventId: string, excludeRsvpId?: string): Promise<number> {
  const rows = await db.all<{ total_guests: number }>(
    `SELECT COALESCE(SUM(guests), 0) AS total_guests
     FROM rsvps
     WHERE event_id = ? AND status = 'Going'${excludeRsvpId ? ' AND id <> ?' : ''}`,
    excludeRsvpId ? [eventId, excludeRsvpId] : [eventId],
  );
  return rows[0]?.total_guests ?? 0;
}

function csvEscape(value: unknown): string {
  const text = String(value ?? '');
  return `"${text.replace(/"/g, '""')}"`;
}

/** GET /api/events/:eventId/rsvps */
export async function listRsvps(req: Request, res: Response): Promise<Response> {
  const db = getDatabase();
  const { eventId } = req.params;
  const rows = await db.all(
    'SELECT * FROM rsvps WHERE event_id = ? ORDER BY created_at DESC',
    [eventId],
  );
  return res.json({ rsvps: rows });
}

/** GET /api/public/events/:eventId */
export async function getPublicRsvpContext(req: Request, res: Response): Promise<Response> {
  const db = getDatabase();
  const { eventId } = req.params;
  const event = await db.get<{ id: number; title: string; description: string | null; location: string | null; event_date: string; capacity: number | null }>(
    'SELECT id, title, description, location, event_date, capacity FROM events WHERE id = ? AND deleted_at IS NULL',
    [eventId],
  );
  if (!event) return res.status(404).json({ error: 'Event not found.' });

  const goingGuests = await getGoingGuestsTotal(db, eventId);
  const remainingCapacity = event.capacity === null ? null : Math.max(event.capacity - goingGuests, 0);

  return res.json({ event, remainingCapacity });
}

/** POST /api/events/:eventId/rsvps  (public — no auth) */
export async function createRsvp(req: Request, res: Response): Promise<Response> {
  const { eventId } = req.params;
  const { name, email, status, notes, guests } = req.body as {
    name?: string;
    email?: string;
    status?: string;
    notes?: string;
    guests?: number | string;
  };

  if (!name?.trim()) return res.status(400).json({ error: 'Name is required.' });
  if (!email?.trim()) return res.status(400).json({ error: 'Email is required.' });

  let guestCount: number;
  try {
    guestCount = parseGuests(guests);
  } catch (error) {
    return res.status(400).json({ error: error instanceof Error ? error.message : 'Invalid guest count.' });
  }

  const db = getDatabase();
  const event = await db.get('SELECT id FROM events WHERE id = ? AND deleted_at IS NULL', [eventId]);
  if (!event) return res.status(404).json({ error: 'Event not found.' });

  const capacity = await getEventCapacity(db, eventId);
  if (capacity !== null && isGoing(status || 'Pending')) {
    const currentGoing = await getGoingGuestsTotal(db, eventId);
    if (currentGoing + guestCount > capacity) {
      return res.status(409).json({ error: 'Event capacity exceeded.' });
    }
  }

  // Determine source based on whether request is authenticated
  const authReq = req as AuthRequest;
  const source = authReq.user ? 'internal' : 'public';

  const result = await db.run(
    `INSERT INTO rsvps (event_id, name, email, guests, status, notes, source)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     RETURNING id`,
    [
      eventId,
      name.trim(),
      email.trim().toLowerCase(),
      guestCount,
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

  const { name, email, status, notes, guests } = req.body as Record<string, string>;
  const fields: string[] = [];
  const params: (string | number | null)[] = [];

  let nextGuests = Number(rsvp.guests ?? 1);
  let nextStatus = rsvp.status;
  if (guests !== undefined) {
    const parsed = parseGuests(guests);
    nextGuests = parsed;
    fields.push('guests = ?');
    params.push(parsed);
  }
  if (status !== undefined) {
    nextStatus = status;
    fields.push('status = ?');
    params.push(status);
  }

  if (isGoing(nextStatus)) {
    const capacity = await getEventCapacity(db, String(rsvp.event_id));
    if (capacity !== null) {
      const currentGoing = await getGoingGuestsTotal(db, String(rsvp.event_id), String(id));
      if (currentGoing + nextGuests > capacity) {
        return res.status(409).json({ error: 'Event capacity exceeded.' });
      }
    }
  }

  if (name !== undefined) { fields.push('name = ?'); params.push(name.trim()); }
  if (email !== undefined) { fields.push('email = ?'); params.push(email.trim().toLowerCase()); }
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

/** GET /api/events/:eventId/rsvps/export?format=csv */
export async function exportRsvpsCsv(req: Request, res: Response): Promise<Response> {
  const db = getDatabase();
  const { eventId } = req.params;
  const { format } = req.query as { format?: string };

  if (format && format !== 'csv') {
    return res.status(400).json({ error: 'Unsupported export format.' });
  }

  const authReq = req as AuthRequest;
  if (!authReq.user) {
    return res.status(401).json({ error: 'Authentication required.' });
  }

  const event = await db.get<{ created_by: number }>('SELECT created_by FROM events WHERE id = ? AND deleted_at IS NULL', [eventId]);
  if (!event) return res.status(404).json({ error: 'Event not found.' });
  if (authReq.user.role_id < 3 && event.created_by !== authReq.user.id) {
    return res.status(403).json({ error: 'Not authorised to export this event.' });
  }

  const rows = await db.all<{
    name: string;
    email: string;
    status: string;
    guests: number;
    notes: string | null;
    created_at: string;
  }>('SELECT name, email, status, guests, notes, created_at FROM rsvps WHERE event_id = ? ORDER BY created_at DESC', [eventId]);

  const csv = [
    ['name', 'email', 'status', 'guests', 'notes', 'submitted_at'].join(','),
    ...rows.map((row) => [
      csvEscape(row.name),
      csvEscape(row.email),
      csvEscape(row.status),
      csvEscape(row.guests),
      csvEscape(row.notes ?? ''),
      csvEscape(row.created_at),
    ].join(',')),
  ].join('\n');

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="event-${eventId}-rsvps.csv"`);
  return res.send(csv);
}
