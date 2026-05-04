import { Request, Response } from 'express';
import { getDatabase } from '../db/database.js';

interface AuthRequest extends Request {
  user?: { id: number; email: string; role_id: number };
}

interface TimelineActivityRow {
  id: number;
  event_id: number;
  title: string;
  description: string | null;
  start_time: string | null;
  end_time: string | null;
  location: string | null;
  vendor_id: number | null;
  sort_order: number;
  created_by: number | null;
  created_at: string;
  updated_at: string;
}

async function assertEventAccess(req: AuthRequest, res: Response, eventId: string): Promise<boolean> {
  if (!req.user) {
    res.status(401).json({ error: 'Authentication required.' });
    return false;
  }
  const db = getDatabase();
  const event = await db.get<{ id: number }>('SELECT id FROM events WHERE id = ? AND deleted_at IS NULL', [eventId]);
  if (!event) {
    res.status(404).json({ error: 'Event not found.' });
    return false;
  }
  return true;
}

/** GET /api/events/:eventId/timeline */
export async function listActivities(req: Request, res: Response): Promise<Response> {
  const authReq = req as AuthRequest;
  const { eventId } = req.params;
  const ok = await assertEventAccess(authReq, res, eventId);
  if (!ok) return res as Response;

  const db = getDatabase();
  const activities = await db.all<TimelineActivityRow>(
    `SELECT * FROM timeline_activities WHERE event_id = ? ORDER BY start_time ASC NULLS LAST, sort_order ASC`,
    [eventId],
  );
  return res.json({ activities });
}

/** POST /api/events/:eventId/timeline */
export async function createActivity(req: Request, res: Response): Promise<Response> {
  const authReq = req as AuthRequest;
  const { eventId } = req.params;
  const ok = await assertEventAccess(authReq, res, eventId);
  if (!ok) return res as Response;

  const { title, description, start_time, end_time, location, vendor_id, sort_order } = req.body as {
    title?: string;
    description?: string;
    start_time?: string;
    end_time?: string;
    location?: string;
    vendor_id?: number | string;
    sort_order?: number | string;
  };

  if (!title?.trim()) return res.status(400).json({ error: 'Activity title is required.' });

  const parsedVendorId = vendor_id !== undefined && vendor_id !== '' ? Number(vendor_id) : null;
  const parsedSortOrder = sort_order !== undefined && sort_order !== '' ? Number(sort_order) : 0;

  const db = getDatabase();
  const result = await db.run(
    `INSERT INTO timeline_activities (event_id, title, description, start_time, end_time, location, vendor_id, sort_order, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     RETURNING id`,
    [
      eventId,
      title.trim(),
      description?.trim() || null,
      start_time || null,
      end_time || null,
      location?.trim() || null,
      parsedVendorId,
      parsedSortOrder,
      authReq.user!.id,
    ],
  );

  const activity = await db.get<TimelineActivityRow>('SELECT * FROM timeline_activities WHERE id = ?', [result.lastID]);
  return res.status(201).json({ activity });
}

/** PUT /api/events/:eventId/timeline/:id */
export async function updateActivity(req: Request, res: Response): Promise<Response> {
  const authReq = req as AuthRequest;
  const { eventId, id } = req.params;
  const ok = await assertEventAccess(authReq, res, eventId);
  if (!ok) return res as Response;

  const db = getDatabase();
  const existing = await db.get<TimelineActivityRow>('SELECT * FROM timeline_activities WHERE id = ? AND event_id = ?', [id, eventId]);
  if (!existing) return res.status(404).json({ error: 'Timeline activity not found.' });

  const { title, description, start_time, end_time, location, vendor_id, sort_order } = req.body as {
    title?: string;
    description?: string;
    start_time?: string;
    end_time?: string;
    location?: string;
    vendor_id?: number | string;
    sort_order?: number | string;
  };

  const parsedVendorId = vendor_id !== undefined ? (vendor_id !== '' ? Number(vendor_id) : null) : existing.vendor_id;
  const parsedSortOrder = sort_order !== undefined && sort_order !== '' ? Number(sort_order) : existing.sort_order;

  await db.run(
    `UPDATE timeline_activities SET
       title = ?, description = ?, start_time = ?, end_time = ?,
       location = ?, vendor_id = ?, sort_order = ?, updated_at = CURRENT_TIMESTAMP
     WHERE id = ? AND event_id = ?`,
    [
      title?.trim() ?? existing.title,
      description !== undefined ? (description.trim() || null) : existing.description,
      start_time !== undefined ? (start_time || null) : existing.start_time,
      end_time !== undefined ? (end_time || null) : existing.end_time,
      location !== undefined ? (location.trim() || null) : existing.location,
      parsedVendorId,
      parsedSortOrder,
      id,
      eventId,
    ],
  );

  const activity = await db.get<TimelineActivityRow>('SELECT * FROM timeline_activities WHERE id = ?', [id]);
  return res.json({ activity });
}

/** DELETE /api/events/:eventId/timeline/:id */
export async function deleteActivity(req: Request, res: Response): Promise<Response> {
  const authReq = req as AuthRequest;
  const { eventId, id } = req.params;
  const ok = await assertEventAccess(authReq, res, eventId);
  if (!ok) return res as Response;

  const db = getDatabase();
  const existing = await db.get<{ id: number }>('SELECT id FROM timeline_activities WHERE id = ? AND event_id = ?', [id, eventId]);
  if (!existing) return res.status(404).json({ error: 'Timeline activity not found.' });

  await db.run('DELETE FROM timeline_activities WHERE id = ? AND event_id = ?', [id, eventId]);
  return res.status(204).send('');
}
