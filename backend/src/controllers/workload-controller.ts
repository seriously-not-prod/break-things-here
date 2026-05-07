/**
 * Workload Dashboard Controller (#451)
 * Aggregates assigned tasks and estimated hours by user for capacity planning.
 */

import { Request, Response } from 'express';
import { getDatabase } from '../db/database.js';
import { requireEventAccess } from '../utils/event-access.js';

interface AuthRequest extends Request {
  user?: { id: number; email: string; role_id: number };
}

/**
 * GET /api/events/:eventId/workload
 * Returns task counts and estimated/actual hours per assigned user.
 */
export async function getWorkload(req: Request, res: Response): Promise<Response> {
  const authReq = req as AuthRequest;
  if (!authReq.user) return res.status(401).json({ error: 'Authentication required.' });

  const { eventId } = req.params;
  const event = await requireEventAccess(authReq, res, eventId, { allowMembers: true });
  if (!event) return res as Response;

  const db = getDatabase();

  // Aggregate tasks by assigned user
  const userWorkload = await db.all<{
    user_id: number | null;
    assignee_name: string | null;
    display_name: string | null;
    total_tasks: number;
    pending_tasks: number;
    in_progress_tasks: number;
    blocked_tasks: number;
    complete_tasks: number;
    estimated_hours: number;
  }>(
    `SELECT
       t.assigned_user_id          AS user_id,
       t.assignee_name,
       u.display_name,
       COUNT(t.id)::int            AS total_tasks,
       COUNT(t.id) FILTER (WHERE t.status = 'Pending')::int      AS pending_tasks,
       COUNT(t.id) FILTER (WHERE t.status = 'In Progress')::int  AS in_progress_tasks,
       COUNT(t.id) FILTER (WHERE t.status = 'Blocked')::int      AS blocked_tasks,
       COUNT(t.id) FILTER (WHERE t.status = 'Complete')::int     AS complete_tasks,
       COALESCE(SUM(t.estimated_hours) FILTER (WHERE t.status <> 'Complete'), 0)::float AS estimated_hours
     FROM tasks t
     LEFT JOIN users u ON u.id = t.assigned_user_id
     WHERE t.event_id = ?
     GROUP BY t.assigned_user_id, t.assignee_name, u.display_name
     ORDER BY total_tasks DESC`,
    [eventId],
  );

  // Actual hours logged per user from time entries
  const actualHours = await db.all<{
    user_id: number;
    display_name: string;
    total_hours_logged: number;
  }>(
    `SELECT
       tte.user_id,
       u.display_name,
       COALESCE(SUM(tte.hours_spent), 0)::float AS total_hours_logged
     FROM task_time_entries tte
     JOIN tasks t ON t.id = tte.task_id
     JOIN users u ON u.id = tte.user_id
     WHERE t.event_id = ?
     GROUP BY tte.user_id, u.display_name`,
    [eventId],
  );

  const actualMap = new Map(actualHours.map((r) => [r.user_id, r.total_hours_logged]));

  const workload = userWorkload.map((row) => ({
    user_id: row.user_id,
    display_name: row.display_name ?? row.assignee_name ?? 'Unassigned',
    total_tasks: row.total_tasks,
    pending_tasks: row.pending_tasks,
    in_progress_tasks: row.in_progress_tasks,
    blocked_tasks: row.blocked_tasks,
    complete_tasks: row.complete_tasks,
    estimated_hours: row.estimated_hours,
    actual_hours_logged: row.user_id ? (actualMap.get(row.user_id) ?? 0) : 0,
    /** Signals over-capacity when estimated hours exceed a nominal 40-hour week */
    is_over_capacity: row.estimated_hours > 40,
  }));

  return res.json({ workload });
}
