/**
 * Task Multi-Assignee Controller
 * Issues: #603 (multi-assignee), #604 (full status lifecycle),
 *         #605 (overdue escalation), #606 (my tasks / capacity planning)
 */

import { Request, Response } from 'express';
import { getDatabase } from '../db/database.js';
import { requireEventAccess } from '../utils/event-access.js';
import { logActivity } from './activity-feed-controller.js';

interface AuthRequest extends Request {
  user?: { id: number; email: string; role_id: number };
}

// #604 — Expanded status set including Cancelled and Verification
export const FULL_TASK_STATUSES = new Set([
  'Pending',
  'In Progress',
  'Blocked',
  'Verification',
  'Complete',
  'Cancelled',
]);

// ── #603: Multi-assignee endpoints ───────────────────────────────────────────

/** GET /api/events/:eventId/tasks/:taskId/assignees */
export async function listTaskAssignees(req: Request, res: Response): Promise<Response> {
  const authReq = req as AuthRequest;
  const { eventId, taskId } = req.params;

  const event = await requireEventAccess(authReq, res, eventId, { allowMembers: true });
  if (!event) return res as Response;

  const db = getDatabase();
  const task = await db.get('SELECT id FROM tasks WHERE id = ? AND event_id = ?', [taskId, eventId]);
  if (!task) return res.status(404).json({ error: 'Task not found.' });

  const assignees = await db.all(
    `SELECT ta.*, COALESCE(u.display_name, u.email) AS display_name, u.email
     FROM task_assignees ta
     JOIN users u ON u.id = ta.user_id
     WHERE ta.task_id = ?
     ORDER BY ta.assigned_at ASC`,
    [taskId],
  );
  return res.json({ assignees });
}

/** POST /api/events/:eventId/tasks/:taskId/assignees */
export async function addTaskAssignee(req: Request, res: Response): Promise<Response> {
  const authReq = req as AuthRequest;
  const { eventId, taskId } = req.params;
  const { user_id } = req.body as { user_id?: number };

  if (!user_id) return res.status(400).json({ error: 'user_id is required.' });

  const event = await requireEventAccess(authReq, res, eventId, { allowMembers: true });
  if (!event) return res as Response;

  const db = getDatabase();
  const task = await db.get('SELECT id FROM tasks WHERE id = ? AND event_id = ?', [taskId, eventId]);
  if (!task) return res.status(404).json({ error: 'Task not found.' });

  // Verify target user is a member of the event
  const member = await db.get(
    'SELECT user_id FROM event_members WHERE event_id = ? AND user_id = ?',
    [eventId, user_id],
  );
  if (!member) return res.status(400).json({ error: 'User must be a member of this event.' });

  const user = await db.get<{ display_name: string; email: string }>(
    'SELECT display_name, email FROM users WHERE id = ? AND deleted_at IS NULL',
    [user_id],
  );
  if (!user) return res.status(404).json({ error: 'User not found.' });

  await db.run(
    `INSERT INTO task_assignees (task_id, user_id, assigned_by)
     VALUES (?, ?, ?)
     ON CONFLICT (task_id, user_id) DO NOTHING`,
    [taskId, user_id, authReq.user?.id ?? null],
  );

  await logActivity(
    eventId,
    authReq.user?.id ?? null,
    'task_assignee_added',
    `Assignee added to task #${taskId}: ${user.display_name ?? user.email}`,
    `/events/${eventId}`,
  );

  const assignees = await db.all(
    `SELECT ta.*, COALESCE(u.display_name, u.email) AS display_name, u.email
     FROM task_assignees ta JOIN users u ON u.id = ta.user_id
     WHERE ta.task_id = ? ORDER BY ta.assigned_at ASC`,
    [taskId],
  );
  return res.status(201).json({ assignees });
}

/** DELETE /api/events/:eventId/tasks/:taskId/assignees/:userId */
export async function removeTaskAssignee(req: Request, res: Response): Promise<Response> {
  const authReq = req as AuthRequest;
  const { eventId, taskId, userId } = req.params;

  const event = await requireEventAccess(authReq, res, eventId, { allowMembers: true });
  if (!event) return res as Response;

  const db = getDatabase();
  const task = await db.get('SELECT id FROM tasks WHERE id = ? AND event_id = ?', [taskId, eventId]);
  if (!task) return res.status(404).json({ error: 'Task not found.' });

  await db.run('DELETE FROM task_assignees WHERE task_id = ? AND user_id = ?', [taskId, userId]);

  return res.json({ message: 'Assignee removed.' });
}

// ── #604: Status lifecycle transitions ───────────────────────────────────────

/** PATCH /api/events/:eventId/tasks/:taskId/status */
export async function updateTaskStatus(req: Request, res: Response): Promise<Response> {
  const authReq = req as AuthRequest;
  const { eventId, taskId } = req.params;
  const { status, cancelled_reason, version } = req.body as {
    status?: string;
    cancelled_reason?: string;
    version?: number;
  };

  if (!status) return res.status(400).json({ error: 'status is required.' });
  if (!FULL_TASK_STATUSES.has(status)) {
    return res.status(400).json({
      error: `Invalid status. Allowed: ${[...FULL_TASK_STATUSES].join(', ')}`,
    });
  }

  const event = await requireEventAccess(authReq, res, eventId, { allowMembers: true });
  if (!event) return res as Response;

  const db = getDatabase();
  const task = await db.get<{ id: number; status: string; version: number; title: string }>(
    'SELECT id, status, version, title FROM tasks WHERE id = ? AND event_id = ?',
    [taskId, eventId],
  );
  if (!task) return res.status(404).json({ error: 'Task not found.' });

  // Optimistic locking — if version provided, ensure it matches
  if (version !== undefined && task.version !== version) {
    return res.status(409).json({
      error: 'Conflict: task was modified by another user. Please refresh and retry.',
      current_version: task.version,
    });
  }

  const fields: string[] = ['status = ?', 'version = version + 1', 'updated_at = CURRENT_TIMESTAMP'];
  const params: (string | number | null)[] = [status];

  if (status === 'Cancelled') {
    fields.push('cancelled_reason = ?');
    params.push(cancelled_reason?.trim() || null);
  }
  if (status === 'Verification') {
    // Record who submitted for verification
    fields.push('verified_by = ?');
    params.push(null); // will be set when approved
  }
  if (status === 'Complete') {
    fields.push('verified_at = CURRENT_TIMESTAMP');
  }

  params.push(taskId);
  await db.run(`UPDATE tasks SET ${fields.join(', ')} WHERE id = ?`, params);

  const updated = await db.get('SELECT * FROM tasks WHERE id = ?', [taskId]);

  await logActivity(
    eventId,
    authReq.user?.id ?? null,
    'task_status_changed',
    `Task status changed to ${status}: ${task.title}`,
    `/events/${eventId}`,
  );

  return res.json({ task: updated });
}

// ── #604: Verification approval ───────────────────────────────────────────────

/** POST /api/events/:eventId/tasks/:taskId/verify */
export async function verifyTaskCompletion(req: Request, res: Response): Promise<Response> {
  const authReq = req as AuthRequest;
  const { eventId, taskId } = req.params;

  const event = await requireEventAccess(authReq, res, eventId, { allowMembers: true });
  if (!event) return res as Response;

  const db = getDatabase();
  const task = await db.get<{ id: number; status: string; title: string }>(
    'SELECT id, status, title FROM tasks WHERE id = ? AND event_id = ?',
    [taskId, eventId],
  );
  if (!task) return res.status(404).json({ error: 'Task not found.' });
  if (task.status !== 'Verification') {
    return res.status(400).json({ error: 'Task must be in Verification status to be approved.' });
  }

  await db.run(
    `UPDATE tasks
     SET status = 'Complete', verified_by = ?, verified_at = CURRENT_TIMESTAMP,
         version = version + 1, updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    [authReq.user?.id ?? null, taskId],
  );

  const updated = await db.get('SELECT * FROM tasks WHERE id = ?', [taskId]);

  await logActivity(
    eventId,
    authReq.user?.id ?? null,
    'task_verified',
    `Task verified and completed: ${task.title}`,
    `/events/${eventId}`,
  );

  return res.json({ task: updated });
}

// ── #605: Escalation policy CRUD ─────────────────────────────────────────────

/** GET /api/events/:eventId/escalation-policy */
export async function getEscalationPolicy(req: Request, res: Response): Promise<Response> {
  const authReq = req as AuthRequest;
  const { eventId } = req.params;

  const event = await requireEventAccess(authReq, res, eventId, { allowMembers: true });
  if (!event) return res as Response;

  const db = getDatabase();
  const policy = await db.get(
    'SELECT * FROM task_escalation_policies WHERE event_id = ?',
    [eventId],
  );
  return res.json({ policy: policy ?? null });
}

/** PUT /api/events/:eventId/escalation-policy */
export async function upsertEscalationPolicy(req: Request, res: Response): Promise<Response> {
  const authReq = req as AuthRequest;
  const { eventId } = req.params;
  const {
    overdue_hours,
    escalate_to_user_id,
    escalate_to_role_id,
    notify_on_escalation,
  } = req.body as {
    overdue_hours?: number;
    escalate_to_user_id?: number | null;
    escalate_to_role_id?: number | null;
    notify_on_escalation?: boolean;
  };

  if (overdue_hours !== undefined && (overdue_hours < 1 || overdue_hours > 8760)) {
    return res.status(400).json({ error: 'overdue_hours must be between 1 and 8760.' });
  }

  const event = await requireEventAccess(authReq, res, eventId, { allowMembers: true });
  if (!event) return res as Response;

  const db = getDatabase();
  await db.run(
    `INSERT INTO task_escalation_policies
       (event_id, overdue_hours, escalate_to_user_id, escalate_to_role_id, notify_on_escalation, created_by)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT (event_id) DO UPDATE SET
       overdue_hours        = EXCLUDED.overdue_hours,
       escalate_to_user_id  = EXCLUDED.escalate_to_user_id,
       escalate_to_role_id  = EXCLUDED.escalate_to_role_id,
       notify_on_escalation = EXCLUDED.notify_on_escalation,
       updated_at           = CURRENT_TIMESTAMP`,
    [
      eventId,
      overdue_hours ?? 24,
      escalate_to_user_id ?? null,
      escalate_to_role_id ?? null,
      notify_on_escalation !== false,
      authReq.user?.id ?? null,
    ],
  );

  const policy = await db.get('SELECT * FROM task_escalation_policies WHERE event_id = ?', [eventId]);
  return res.json({ policy });
}

/** POST /api/events/:eventId/tasks/escalate-overdue (internal/cron-callable) */
export async function escalateOverdueTasks(req: Request, res: Response): Promise<Response> {
  const authReq = req as AuthRequest;
  const { eventId } = req.params;

  const event = await requireEventAccess(authReq, res, eventId, { allowMembers: true });
  if (!event) return res as Response;

  const db = getDatabase();
  const policy = await db.get<{
    overdue_hours: number;
    escalate_to_user_id: number | null;
    notify_on_escalation: boolean;
  }>('SELECT * FROM task_escalation_policies WHERE event_id = ?', [eventId]);

  if (!policy) return res.status(404).json({ error: 'No escalation policy configured for this event.' });

  const overdueTasks = await db.all<{ id: number; title: string }>(
    `SELECT id, title FROM tasks
     WHERE event_id = ?
       AND status NOT IN ('Complete', 'Cancelled')
       AND due_date IS NOT NULL
       AND due_date < datetime('now', ?)
       AND escalated_at IS NULL`,
    [eventId, `-${policy.overdue_hours} hours`],
  );

  let escalated = 0;
  for (const task of overdueTasks) {
    await db.run(
      `UPDATE tasks SET escalated_at = CURRENT_TIMESTAMP, escalated_to = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [policy.escalate_to_user_id, task.id],
    );

    if (policy.notify_on_escalation && policy.escalate_to_user_id) {
      await db.run(
        `INSERT INTO notifications (user_id, type, title, body, notification_type)
         VALUES (?, 'task_overdue', ?, ?, 'task_overdue')`,
        [
          policy.escalate_to_user_id,
          `Overdue task escalated: ${task.title}`,
          `Task "${task.title}" in event #${eventId} is overdue and has been escalated to you.`,
        ],
      );
    }
    escalated++;
  }

  return res.json({ escalated, tasks: overdueTasks });
}

// ── #606: My Tasks / capacity planning ───────────────────────────────────────

/** GET /api/tasks/my-tasks */
export async function getMyTasks(req: Request, res: Response): Promise<Response> {
  const authReq = req as AuthRequest;
  if (!authReq.user) return res.status(401).json({ error: 'Unauthorized.' });

  const db = getDatabase();
  const userId = authReq.user.id;

  // Tasks assigned via task_assignees OR assigned_user_id
  const tasks = await db.all(
    `SELECT DISTINCT t.*, e.title AS event_title,
            CASE WHEN t.due_date IS NOT NULL AND t.due_date < datetime('now')
                      AND t.status NOT IN ('Complete', 'Cancelled')
                 THEN 1 ELSE 0 END AS is_overdue
     FROM tasks t
     JOIN events e ON e.id = t.event_id
     LEFT JOIN task_assignees ta ON ta.task_id = t.id
     WHERE (t.assigned_user_id = ? OR ta.user_id = ?)
       AND t.status NOT IN ('Complete', 'Cancelled')
     ORDER BY t.due_date ASC NULLS LAST, t.priority DESC`,
    [userId, userId],
  );

  return res.json({ tasks });
}

/** GET /api/tasks/capacity */
export async function getCapacityPlanning(req: Request, res: Response): Promise<Response> {
  const authReq = req as AuthRequest;
  if (!authReq.user) return res.status(401).json({ error: 'Unauthorized.' });

  const db = getDatabase();
  const userId = authReq.user.id;

  const capacity = await db.all(
    `SELECT
       COUNT(DISTINCT t.id)                            AS total_tasks,
       SUM(CASE WHEN t.status = 'Pending'     THEN 1 ELSE 0 END) AS pending,
       SUM(CASE WHEN t.status = 'In Progress' THEN 1 ELSE 0 END) AS in_progress,
       SUM(CASE WHEN t.status = 'Blocked'     THEN 1 ELSE 0 END) AS blocked,
       SUM(CASE WHEN t.status = 'Verification' THEN 1 ELSE 0 END) AS in_verification,
       SUM(CASE WHEN t.due_date IS NOT NULL AND t.due_date < datetime('now')
                     AND t.status NOT IN ('Complete', 'Cancelled')
                THEN 1 ELSE 0 END)                    AS overdue,
       COALESCE(SUM(t.estimated_hours), 0)            AS total_estimated_hours
     FROM tasks t
     LEFT JOIN task_assignees ta ON ta.task_id = t.id
     WHERE (t.assigned_user_id = ? OR ta.user_id = ?)
       AND t.status NOT IN ('Complete', 'Cancelled')`,
    [userId, userId],
  );

  return res.json({ capacity: capacity[0] ?? {} });
}
