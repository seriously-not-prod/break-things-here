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
  let paramIndex = 1;

  if (status) {
    query += ` AND e.status = $${paramIndex++}`;
    params.push(status);
  }
  if (q) {
    query += ` AND (e.title LIKE $${paramIndex} OR e.description LIKE $${paramIndex + 1} OR e.location LIKE $${paramIndex + 2})`;
    const like = `%${q}%`;
    params.push(like, like, like);
    paramIndex += 3;
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

  // Parallelize independent queries to reduce response latency
  const [tasks, rsvps, documents] = await Promise.all([
    db.all('SELECT * FROM tasks WHERE event_id = $1 ORDER BY due_date ASC', [id]),
    db.all('SELECT * FROM rsvps WHERE event_id = $1 ORDER BY created_at DESC', [id]),
    db.all<EventDocumentRow[]>(
      `SELECT id, event_id, original_name, file_name, mime_type, file_size, created_at
       FROM event_documents
       WHERE event_id = $1
       ORDER BY created_at DESC`,
      [id],
    ),
  ]);

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

  const event = await db.get<EventRow>(
    'SELECT * FROM events WHERE id = $1 AND deleted_at IS NULL',
    [id],
  );
  if (!event) return res.status(404).json({ error: 'Event not found.' });

  // Organizers can only edit their own events; Admins (role_id=3) can edit all
  if (req.user!.role_id < 3 && event.created_by !== req.user!.id) {
    return res.status(403).json({ error: 'Not authorised to edit this event.' });
  }

  const { title, description, location, event_date, status } = req.body as Record<string, string>;
  const fields: string[] = [];
  const params: (string | number | null)[] = [];
  let paramIndex = 1;

  if (title !== undefined) {
    fields.push(`title = $${paramIndex++}`);
    params.push(title.trim());
  }
  if (description !== undefined) {
    fields.push(`description = $${paramIndex++}`);
    params.push(description.trim() || null);
  }
  if (location !== undefined) {
    fields.push(`location = $${paramIndex++}`);
    params.push(location.trim() || null);
  }
  if (event_date !== undefined) {
    fields.push(`event_date = $${paramIndex++}`);
    params.push(event_date);
  }
  if (status !== undefined) {
    fields.push(`status = $${paramIndex++}`);
    params.push(status);
  }

  if (fields.length === 0) return res.status(400).json({ error: 'No fields to update.' });

  fields.push('updated_at = CURRENT_TIMESTAMP');
  params.push(id);

  await db.run(`UPDATE events SET ${fields.join(', ')} WHERE id = $${paramIndex}`, params);
  const updated = await db.get('SELECT * FROM events WHERE id = $1', [id]);
  return res.json({ event: updated });
}

/** DELETE /api/events/:id */
export async function deleteEvent(req: AuthRequest, res: Response): Promise<Response> {
  const db = getDatabase();
  const { id } = req.params;

  const event = await db.get<EventRow>(
    'SELECT * FROM events WHERE id = $1 AND deleted_at IS NULL',
    [id],
  );
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

  const [totalEvents, activeEvents, totalTasks, pendingTasks, totalRsvps, goingRsvps] =
    await Promise.all([
      db.get<{ count: number }>('SELECT COUNT(*) AS count FROM events WHERE deleted_at IS NULL'),
      db.get<{ count: number }>(
        "SELECT COUNT(*) AS count FROM events WHERE status = 'Active' AND deleted_at IS NULL",
      ),
      db.get<{ count: number }>('SELECT COUNT(*) AS count FROM tasks'),
      db.get<{ count: number }>(
        "SELECT COUNT(*) AS count FROM tasks WHERE status = 'Pending'",
      ),
      db.get<{ count: number }>('SELECT COUNT(*) AS count FROM rsvps'),
      db.get<{ count: number }>(
        "SELECT COUNT(*) AS count FROM rsvps WHERE canonical_status = 'confirmed'",
      ),
    ]);

  return res.json({
    totalEvents: totalEvents?.count ?? 0,
    activeEvents: activeEvents?.count ?? 0,
    totalTasks: totalTasks?.count ?? 0,
    pendingTasks: pendingTasks?.count ?? 0,
    totalRsvps: totalRsvps?.count ?? 0,
    goingRsvps: goingRsvps?.count ?? 0,
  });
}
