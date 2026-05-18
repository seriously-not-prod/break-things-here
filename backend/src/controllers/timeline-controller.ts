import { Request, Response } from 'express';
import { getDatabase } from '../db/database.js';
import { requireEventAccess } from '../utils/event-access.js';

interface AuthRequest extends Request {
  user?: { id: number; email: string; role_id: number };
}

type ActivityStatus = 'planned' | 'in-progress' | 'completed' | 'skipped';

const VALID_STATUSES: ActivityStatus[] = ['planned', 'in-progress', 'completed', 'skipped'];

interface TimelineActivityRow {
  id: number;
  event_id: number;
  title: string;
  description: string | null;
  start_time: string | null;
  end_time: string | null;
  planned_start_time: string | null;
  planned_end_time: string | null;
  actual_start_time: string | null;
  actual_end_time: string | null;
  status: ActivityStatus;
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
    `SELECT * FROM timeline_activities WHERE event_id = $1 ORDER BY start_time ASC NULLS LAST, sort_order ASC`,
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

  const {
    title,
    description,
    start_time,
    end_time,
    planned_start_time,
    planned_end_time,
    actual_start_time,
    actual_end_time,
    status,
    location,
    vendor_id,
    sort_order,
  } = req.body as {
    title?: string;
    description?: string;
    start_time?: string;
    end_time?: string;
    planned_start_time?: string;
    planned_end_time?: string;
    actual_start_time?: string;
    actual_end_time?: string;
    status?: string;
    location?: string;
    vendor_id?: number | string;
    sort_order?: number | string;
  };

  if (!title?.trim()) return res.status(400).json({ error: 'Activity title is required.' });

  const parsedStatus: ActivityStatus =
    status && (VALID_STATUSES as string[]).includes(status)
      ? (status as ActivityStatus)
      : 'planned';
  const parsedVendorId = vendor_id !== undefined && vendor_id !== '' ? Number(vendor_id) : null;
  const parsedSortOrder = sort_order !== undefined && sort_order !== '' ? Number(sort_order) : 0;

  const db = getDatabase();
  const result = await db.run(
    `INSERT INTO timeline_activities (
       event_id, title, description, start_time, end_time,
       planned_start_time, planned_end_time,
       actual_start_time, actual_end_time,
       status, location, vendor_id, sort_order, created_by
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
     RETURNING id`,
    [
      eventId,
      title.trim(),
      description?.trim() || null,
      start_time || null,
      end_time || null,
      planned_start_time || null,
      planned_end_time || null,
      actual_start_time || null,
      actual_end_time || null,
      parsedStatus,
      location?.trim() || null,
      parsedVendorId,
      parsedSortOrder,
      authReq.user!.id,
    ],
  );

  const activity = await db.get<TimelineActivityRow>(
    'SELECT * FROM timeline_activities WHERE id = $1',
    [result.lastID],
  );
  return res.status(201).json({ activity });
}

/** PUT /api/events/:eventId/timeline/:id */
export async function updateActivity(req: Request, res: Response): Promise<Response> {
  const authReq = req as AuthRequest;
  const { eventId, id } = req.params;
  const ok = await assertEventAccess(authReq, res, eventId);
  if (!ok) return res as Response;

  const db = getDatabase();
  const existing = await db.get<TimelineActivityRow>(
    'SELECT * FROM timeline_activities WHERE id = $1 AND event_id = $2',
    [id, eventId],
  );
  if (!existing) return res.status(404).json({ error: 'Timeline activity not found.' });

  const {
    title,
    description,
    start_time,
    end_time,
    planned_start_time,
    planned_end_time,
    actual_start_time,
    actual_end_time,
    status,
    location,
    vendor_id,
    sort_order,
  } = req.body as {
    title?: string;
    description?: string;
    start_time?: string;
    end_time?: string;
    planned_start_time?: string;
    planned_end_time?: string;
    actual_start_time?: string;
    actual_end_time?: string;
    status?: string;
    location?: string;
    vendor_id?: number | string;
    sort_order?: number | string;
  };

  const parsedStatus: ActivityStatus =
    status && (VALID_STATUSES as string[]).includes(status)
      ? (status as ActivityStatus)
      : existing.status ?? 'planned';
  const parsedVendorId =
    vendor_id !== undefined ? (vendor_id !== '' ? Number(vendor_id) : null) : existing.vendor_id;
  const parsedSortOrder =
    sort_order !== undefined && sort_order !== '' ? Number(sort_order) : existing.sort_order;

  await db.run(
    `UPDATE timeline_activities SET
       title = $1, description = $2, start_time = $3, end_time = $4,
       planned_start_time = $5, planned_end_time = $6,
       actual_start_time = $7, actual_end_time = $8,
       status = $9, location = $10, vendor_id = $11, sort_order = $12,
       updated_at = CURRENT_TIMESTAMP
     WHERE id = $13 AND event_id = $14`,
    [
      title?.trim() ?? existing.title,
      description !== undefined ? (description.trim() || null) : existing.description,
      start_time !== undefined ? (start_time || null) : existing.start_time,
      end_time !== undefined ? (end_time || null) : existing.end_time,
      planned_start_time !== undefined ? (planned_start_time || null) : existing.planned_start_time,
      planned_end_time !== undefined ? (planned_end_time || null) : existing.planned_end_time,
      actual_start_time !== undefined ? (actual_start_time || null) : existing.actual_start_time,
      actual_end_time !== undefined ? (actual_end_time || null) : existing.actual_end_time,
      parsedStatus,
      location !== undefined ? (location.trim() || null) : existing.location,
      parsedVendorId,
      parsedSortOrder,
      id,
      eventId,
    ],
  );

  const activity = await db.get<TimelineActivityRow>(
    'SELECT * FROM timeline_activities WHERE id = $1',
    [id],
  );
  return res.json({ activity });
}

/** DELETE /api/events/:eventId/timeline/:id */
export async function deleteActivity(req: Request, res: Response): Promise<Response> {
  const authReq = req as AuthRequest;
  const { eventId, id } = req.params;
  const ok = await assertEventAccess(authReq, res, eventId);
  if (!ok) return res as Response;

  const db = getDatabase();
  const existing = await db.get<{ id: number }>('SELECT id FROM timeline_activities WHERE id = $1 AND event_id = $2', [id, eventId]);
  if (!existing) return res.status(404).json({ error: 'Timeline activity not found.' });

  await db.run('DELETE FROM timeline_activities WHERE id = $1 AND event_id = $2', [id, eventId]);
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
     WHERE a.event_id = $1
     ORDER BY a.start_time ASC`,
    [eventId],
  );

  return res.json({ conflicts, count: conflicts.length });
}

/**
 * GET /api/events/:eventId/timeline/comparison (#460)
 * Returns all activities with their planned and actual times side-by-side,
 * including a computed variance in minutes and a summary of status counts.
 */
export async function getTimelineComparison(req: Request, res: Response): Promise<Response> {
  const authReq = req as AuthRequest;
  const { eventId } = req.params;
  const ok = await assertEventAccess(authReq, res, eventId);
  if (!ok) return res as Response;

  const db = getDatabase();
  const activities = await db.all<TimelineActivityRow>(
    `SELECT * FROM timeline_activities WHERE event_id = $1 ORDER BY sort_order ASC, start_time ASC NULLS LAST`,
    [eventId],
  );

  const comparisonItems = activities.map(a => {
    const plannedStart = a.planned_start_time ? new Date(a.planned_start_time).getTime() : null;
    const plannedEnd = a.planned_end_time ? new Date(a.planned_end_time).getTime() : null;
    const actualStart = a.actual_start_time ? new Date(a.actual_start_time).getTime() : null;
    const actualEnd = a.actual_end_time ? new Date(a.actual_end_time).getTime() : null;

    const startVarianceMinutes =
      plannedStart !== null && actualStart !== null
        ? Math.round((actualStart - plannedStart) / 60000)
        : null;
    const endVarianceMinutes =
      plannedEnd !== null && actualEnd !== null
        ? Math.round((actualEnd - plannedEnd) / 60000)
        : null;
    const plannedDurationMinutes =
      plannedStart !== null && plannedEnd !== null
        ? Math.round((plannedEnd - plannedStart) / 60000)
        : null;
    const actualDurationMinutes =
      actualStart !== null && actualEnd !== null
        ? Math.round((actualEnd - actualStart) / 60000)
        : null;

    return {
      id: a.id,
      title: a.title,
      status: a.status ?? 'planned',
      location: a.location,
      vendor_id: a.vendor_id,
      sort_order: a.sort_order,
      planned_start_time: a.planned_start_time,
      planned_end_time: a.planned_end_time,
      actual_start_time: a.actual_start_time,
      actual_end_time: a.actual_end_time,
      start_variance_minutes: startVarianceMinutes,
      end_variance_minutes: endVarianceMinutes,
      planned_duration_minutes: plannedDurationMinutes,
      actual_duration_minutes: actualDurationMinutes,
    };
  });

  const summary = {
    total: activities.length,
    planned: activities.filter(a => (a.status ?? 'planned') === 'planned').length,
    in_progress: activities.filter(a => a.status === 'in-progress').length,
    completed: activities.filter(a => a.status === 'completed').length,
    skipped: activities.filter(a => a.status === 'skipped').length,
  };

  return res.json({ comparison: comparisonItems, summary });
}
