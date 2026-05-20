import { Request, Response } from 'express';
import { getDatabase } from '../db/database.js';

interface AuthRequest extends Request {
  user?: { id: number; email: string; role_id: number };
}

interface EventRow {
  id: number;
  title: string;
  description: string | null;
  location: string | null;
  event_date: string;
  status: string;
  created_by: number;
  created_at: string;
  updated_at: string;
  creator_name?: string;
}

interface EventDocumentRow {
  id: number;
  event_id: number;
  original_name: string;
  file_name: string;
  mime_type: string;
  file_size: number;
  created_at: string;
}

/** GET /api/events */
export async function listEvents(req: Request, res: Response): Promise<Response> {
  const db = getDatabase();
  const { status, q } = req.query as { status?: string; q?: string };

  let query = `
    SELECT e.*, u.display_name AS creator_name
    FROM events e
    LEFT JOIN users u ON e.created_by = u.id
    WHERE e.deleted_at IS NULL
  `;
  const params: (string | number)[] = [];

  if (status) {
    query += ' AND e.status = ?';
    params.push(status);
  }
  if (q) {
    query += ' AND (e.title LIKE ? OR e.description LIKE ? OR e.location LIKE ?)';
    const like = `%${q}%`;
    params.push(like, like, like);
  }

  query += ' ORDER BY e.event_date ASC';

  const rows = await db.all<EventRow[]>(query, params);
  return res.json({ events: rows });
}

/** GET /api/events/:id */
export async function getEvent(req: Request, res: Response): Promise<Response> {
  const db = getDatabase();
  const { id } = req.params;

  const event = await db.get<EventRow>(
    `SELECT e.*, u.display_name AS creator_name
     FROM events e LEFT JOIN users u ON e.created_by = u.id
     WHERE e.id = $1 AND e.deleted_at IS NULL`,
    [id],
  );
  if (!event) return res.status(404).json({ error: 'Event not found.' });

  const tasks = await db.all('SELECT * FROM tasks WHERE event_id = $1 ORDER BY due_date ASC', [id]);
  const rsvps = await db.all('SELECT * FROM rsvps WHERE event_id = $1 ORDER BY created_at DESC', [id]);
  const documents = await db.all<EventDocumentRow[]>(
    `SELECT id, event_id, original_name, file_name, mime_type, file_size, created_at
     FROM event_documents
     WHERE event_id = $1
     ORDER BY created_at DESC`,
    [id],
  );

  return res.json({ event, tasks, rsvps, documents });
}

/** POST /api/events */
export async function createEvent(req: AuthRequest, res: Response): Promise<Response> {
  const { title, description, location, event_date, status } = req.body as {
    title?: string;
    description?: string;
    location?: string;
    event_date?: string;
    status?: string;
  };

  if (!title?.trim()) return res.status(400).json({ error: 'Title is required.' });
  if (!event_date) return res.status(400).json({ error: 'event_date is required (YYYY-MM-DD).' });

  const db = getDatabase();
  const result = await db.run(
    `INSERT INTO events (title, description, location, event_date, status, created_by)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id`,
    [
      title.trim(),
      description?.trim() || null,
      location?.trim() || null,
      event_date,
      status || 'Draft',
      req.user!.id,
    ],
  );

  const event = await db.get('SELECT * FROM events WHERE id = $1', [result.lastID]);
  return res.status(201).json({ event });
}

/** PATCH /api/events/:id */
export async function updateEvent(req: AuthRequest, res: Response): Promise<Response> {
  const db = getDatabase();
  const { id } = req.params;

  const event = await db.get<EventRow>('SELECT * FROM events WHERE id = $1 AND deleted_at IS NULL', [id]);
  if (!event) return res.status(404).json({ error: 'Event not found.' });

  // Organizers can only edit their own events; Admins (role_id=3) can edit all
  if (req.user!.role_id < 3 && event.created_by !== req.user!.id) {
    return res.status(403).json({ error: 'Not authorised to edit this event.' });
  }

  const { title, description, location, event_date, status } = req.body as Record<string, string>;
  const fields: string[] = [];
  const params: (string | number | null)[] = [];

  if (title !== undefined) { fields.push('title = ?'); params.push(title.trim()); }
  if (description !== undefined) { fields.push('description = ?'); params.push(description.trim() || null); }
  if (location !== undefined) { fields.push('location = ?'); params.push(location.trim() || null); }
  if (event_date !== undefined) { fields.push('event_date = ?'); params.push(event_date); }
  if (status !== undefined) { fields.push('status = ?'); params.push(status); }

  if (fields.length === 0) return res.status(400).json({ error: 'No fields to update.' });

  fields.push('updated_at = CURRENT_TIMESTAMP');
  params.push(id);

  await db.run(`UPDATE events SET ${fields.join(', ')} WHERE id = $1`, params);
  const updated = await db.get('SELECT * FROM events WHERE id = $1', [id]);
  return res.json({ event: updated });
}

/** DELETE /api/events/:id */
export async function deleteEvent(req: AuthRequest, res: Response): Promise<Response> {
  const db = getDatabase();
  const { id } = req.params;

  const event = await db.get<EventRow>('SELECT * FROM events WHERE id = $1 AND deleted_at IS NULL', [id]);
  if (!event) return res.status(404).json({ error: 'Event not found.' });

  if (req.user!.role_id < 3 && event.created_by !== req.user!.id) {
    return res.status(403).json({ error: 'Not authorised to delete this event.' });
  }

  await db.run('UPDATE events SET deleted_at = CURRENT_TIMESTAMP WHERE id = $1', [id]);
  return res.json({ message: 'Event deleted.' });
}

/** GET /api/events/stats — dashboard summary */
export async function getEventStats(_req: Request, res: Response): Promise<Response> {
  const db = getDatabase();

  const totalEvents = await db.get<{ count: number }>('SELECT COUNT(*) AS count FROM events WHERE deleted_at IS NULL');
  const activeEvents = await db.get<{ count: number }>("SELECT COUNT(*) AS count FROM events WHERE status = 'Active' AND deleted_at IS NULL");
  const totalTasks = await db.get<{ count: number }>('SELECT COUNT(*) AS count FROM tasks');
  const pendingTasks = await db.get<{ count: number }>("SELECT COUNT(*) AS count FROM tasks WHERE status = 'Pending'");
  const totalRsvps = await db.get<{ count: number }>('SELECT COUNT(*) AS count FROM rsvps');
  const goingRsvps = await db.get<{ count: number }>("SELECT COUNT(*) AS count FROM rsvps WHERE canonical_status = 'confirmed'");

  return res.json({
    totalEvents: totalEvents?.count ?? 0,
    activeEvents: activeEvents?.count ?? 0,
    totalTasks: totalTasks?.count ?? 0,
    pendingTasks: pendingTasks?.count ?? 0,
    totalRsvps: totalRsvps?.count ?? 0,
    goingRsvps: goingRsvps?.count ?? 0,
  });
}
