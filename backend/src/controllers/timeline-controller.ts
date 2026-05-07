import { Request, Response } from 'express';
import { getDatabase } from '../db/database.js';
import { requireEventAccess } from '../utils/event-access.js';

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
  const event = await requireEventAccess(req, res, eventId, {
    allowMembers: true,
    forbiddenMessage: 'Not authorised to manage the timeline for this event.',
  });
  return Boolean(event);
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

/**
 * GET /api/events/:eventId/timeline/conflicts (#441)
 * Returns pairs of timeline activities whose time windows overlap.
 * Two activities conflict when:
 *   A.start_time < B.end_time  AND  A.end_time > B.start_time
 * Activities without both start and end times are excluded.
 */
export async function detectConflicts(req: Request, res: Response): Promise<Response> {
  const authReq = req as AuthRequest;
  const { eventId } = req.params;
  const ok = await assertEventAccess(authReq, res, eventId);
  if (!ok) return res as Response;

  const db = getDatabase();

  const conflicts = await db.all<{
    activity_a_id: number;
    activity_a_title: string;
    activity_a_start: string;
    activity_a_end: string;
    activity_b_id: number;
    activity_b_title: string;
    activity_b_start: string;
    activity_b_end: string;
  }>(
    `SELECT
       a.id    AS activity_a_id,
       a.title AS activity_a_title,
       a.start_time::text AS activity_a_start,
       a.end_time::text   AS activity_a_end,
       b.id    AS activity_b_id,
       b.title AS activity_b_title,
       b.start_time::text AS activity_b_start,
       b.end_time::text   AS activity_b_end
     FROM timeline_activities a
     JOIN timeline_activities b
       ON a.event_id = b.event_id
      AND a.id < b.id
      AND a.start_time IS NOT NULL
      AND a.end_time   IS NOT NULL
      AND b.start_time IS NOT NULL
      AND b.end_time   IS NOT NULL
      AND a.start_time < b.end_time
      AND a.end_time   > b.start_time
     WHERE a.event_id = ?
     ORDER BY a.start_time ASC`,
    [eventId],
  );

  return res.json({ conflicts, count: conflicts.length });
}
