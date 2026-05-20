/**
 * Workload Dashboard Controller (#451 / #796)
 * Aggregates assigned tasks and estimated hours by user for capacity planning.
 *
 * Filters (all optional, applied at the SQL layer):
 *   - from         ISO date (inclusive) — restricts tasks by due_date >=
 *   - to           ISO date (inclusive) — restricts tasks by due_date <=
 *   - assignee     numeric user id — restricts to a single assignee
 *   - status       one of the Task status values — restricts the count window
 *   - daily_hours  positive number, defaults to 8. Combined with the window
 *                  derived from {from, to} (or fallback 5 working days) to
 *                  compute the per-user capacity threshold.
 */

import { Request, Response } from 'express';
import { getDatabase } from '../db/database.js';
import { requireEventAccess } from '../utils/event-access.js';

interface AuthRequest extends Request {
  user?: { id: number; email: string; role_id: number };
}

const DEFAULT_DAILY_CAPACITY_HOURS = 8;
const DEFAULT_WINDOW_DAYS = 5; // one working week
const MS_PER_DAY = 86_400_000;

function parseIsoDate(value: unknown): string | null {
  if (typeof value !== 'string' || !value) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : value;
}

function parsePositiveNumber(value: unknown, fallback: number): number {
  if (value === undefined || value === null || value === '') return fallback;
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function diffDaysInclusive(from: string, to: string): number {
  const a = new Date(from).getTime();
  const b = new Date(to).getTime();
  if (!Number.isFinite(a) || !Number.isFinite(b)) return DEFAULT_WINDOW_DAYS;
  return Math.max(1, Math.floor((b - a) / MS_PER_DAY) + 1);
}

/**
 * GET /api/events/:eventId/workload
 * Returns task counts and estimated/actual hours per assigned user,
 * with an `is_over_capacity` flag computed against the configured
 * daily-hours capacity over the selected window.
 */
export async function getWorkload(req: Request, res: Response): Promise<Response> {
  const authReq = req as AuthRequest;
  if (!authReq.user) return res.status(401).json({ error: 'Authentication required.' });

  const { eventId } = req.params;
  const event = await requireEventAccess(authReq, res, eventId, { allowMembers: true });
  if (!event) return res as Response;

  const from = parseIsoDate(req.query.from);
  const to = parseIsoDate(req.query.to);
  const assigneeRaw = req.query.assignee;
  const assigneeId =
    typeof assigneeRaw === 'string' && /^\d+$/.test(assigneeRaw) ? Number(assigneeRaw) : null;
  const statusFilter = typeof req.query.status === 'string' ? req.query.status : '';
  const dailyHours = parsePositiveNumber(req.query.daily_hours, DEFAULT_DAILY_CAPACITY_HOURS);

  const windowDays = from && to ? diffDaysInclusive(from, to) : DEFAULT_WINDOW_DAYS;
  const capacityThreshold = dailyHours * windowDays;

  const db = getDatabase();

  const whereClauses: string[] = ['t.event_id = $1'];
  const params: Array<string | number> = [eventId];
  if (from) {
    params.push(from);
    whereClauses.push(`(t.due_date IS NULL OR t.due_date >= $${params.length})`);
  }
  if (to) {
    params.push(to);
    whereClauses.push(`(t.due_date IS NULL OR t.due_date <= $${params.length})`);
  }
  if (assigneeId !== null) {
    params.push(assigneeId);
    whereClauses.push(`t.assigned_user_id = $${params.length}`);
  }
  if (statusFilter) {
    params.push(statusFilter);
    whereClauses.push(`t.status = $${params.length}`);
  }
  const whereSql = whereClauses.join(' AND ');

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
     WHERE ${whereSql}
     GROUP BY t.assigned_user_id, t.assignee_name, u.display_name
     ORDER BY total_tasks DESC`,
    params,
  );

  // Actual hours logged per user from time entries (same window when supplied)
  const teParams: Array<string | number> = [eventId];
  const teClauses: string[] = ['t.event_id = $1'];
  if (from) {
    teParams.push(from);
    teClauses.push(`tte.logged_at >= $${teParams.length}`);
  }
  if (to) {
    teParams.push(to);
    teClauses.push(`tte.logged_at <= $${teParams.length}`);
  }
  if (assigneeId !== null) {
    teParams.push(assigneeId);
    teClauses.push(`tte.user_id = $${teParams.length}`);
  }
  const teWhere = teClauses.join(' AND ');

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
     WHERE ${teWhere}
     GROUP BY tte.user_id, u.display_name`,
    teParams,
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
    is_over_capacity: row.estimated_hours > capacityThreshold,
  }));

  return res.json({
    workload,
    meta: {
      from,
      to,
      assignee_id: assigneeId,
      status: statusFilter || null,
      daily_hours: dailyHours,
      window_days: windowDays,
      capacity_threshold_hours: capacityThreshold,
    },
  });
}
