import { Request, Response } from 'express';
import { getDatabase } from '../db/database.js';
import { logActivity } from './activity-feed-controller.js';
import { requireEventAccess } from '../utils/event-access.js';
import { AUDIT_ACTIONS, logMutation } from '../utils/audit-log.js';

interface AuthRequest extends Request {
  user?: { id: number; email: string; role_id: number };
}

const ALLOWED_STATUSES = new Set(['Pending', 'Complete', 'Completed', 'In Progress', 'Blocked']);
const ALLOWED_PRIORITIES = new Set(['Low', 'Medium', 'High']);

function normalizeTaskStatus(status?: string): string {
  return status === 'Completed' ? 'Complete' : status ?? 'Pending';
}

async function getTaskTeamMemberIds(db: ReturnType<typeof getDatabase>, eventId: string): Promise<Set<number>> {
  const rows = await db.all<{ user_id: number }>('SELECT user_id FROM event_members WHERE event_id = $1', [eventId]);
  return new Set(rows.map((row) => Number(row.user_id)));
}

/** GET /api/events/:eventId/tasks */
export async function listTasks(req: Request, res: Response): Promise<Response> {
  const authReq = req as AuthRequest;
  const db = getDatabase();
  const { eventId } = req.params;
  const event = await requireEventAccess(authReq, res, eventId, { allowMembers: true });
  if (!event) return res as Response;
  const rows = await db.all(
    `SELECT t.*, COALESCE(u.display_name, t.assignee_name) AS assignee_name
     FROM tasks t
     LEFT JOIN users u ON t.assigned_user_id = u.id
     WHERE t.event_id = $1
     ORDER BY t.due_date ASC, t.priority ASC`,
    [eventId],
  );
  return res.json({ tasks: rows });
}

/** POST /api/events/:eventId/tasks */
export async function createTask(req: AuthRequest, res: Response): Promise<Response> {
  const { eventId } = req.params;
  const { title, notes, assignee_name, assigned_user_id, due_date, status, priority } = req.body as {
    title?: string;
    notes?: string;
    assignee_name?: string;
    assigned_user_id?: number | string;
    due_date?: string;
    status?: string;
    priority?: string;
  };

  if (!title?.trim()) return res.status(400).json({ error: 'Task title is required.' });
  if (status && !ALLOWED_STATUSES.has(status)) return res.status(400).json({ error: 'Invalid task status.' });
  if (priority && !ALLOWED_PRIORITIES.has(priority)) return res.status(400).json({ error: 'Invalid priority.' });

  const db = getDatabase();

  const event = await requireEventAccess(req, res, eventId, { allowMembers: true });
  if (!event) return res as Response;

  let assignedUserId: number | null = null;
  let derivedAssigneeName = assignee_name?.trim() || null;
  if (assigned_user_id !== undefined && assigned_user_id !== null && assigned_user_id !== '') {
    assignedUserId = Number(assigned_user_id);
    if (!Number.isInteger(assignedUserId)) return res.status(400).json({ error: 'assigned_user_id must be a valid user id.' });
    const teamMembers = await getTaskTeamMemberIds(db, eventId);
    if (!teamMembers.has(assignedUserId)) return res.status(400).json({ error: 'Assigned user must be a member of this event.' });
    const assignee = await db.get<{ display_name: string }>('SELECT display_name FROM users WHERE id = $1 AND deleted_at IS NULL', [assignedUserId]);
    if (!assignee) return res.status(404).json({ error: 'Assigned user not found.' });
    derivedAssigneeName = assignee.display_name;
  }

  const result = await db.run(
    `INSERT INTO tasks (event_id, title, notes, assignee_name, assigned_user_id, due_date, status, priority, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING id`,
    [
      eventId,
      title.trim(),
      notes?.trim() || null,
      derivedAssigneeName,
      assignedUserId,
      due_date || null,
      normalizeTaskStatus(status),
      priority || 'Medium',
      req.user!.id,
    ],
  );

  const task = await db.get('SELECT * FROM tasks WHERE id = $1', [result.lastID]);

  await logActivity(
    eventId,
    req.user!.id,
    'task_created',
    `Task created: ${title.trim()}`,
    `/events/${eventId}`,
  );

  await logMutation(db, req, AUDIT_ACTIONS.TASK_CREATE, 'task', result.lastID ?? 0, { eventId });
  return res.status(201).json({ task });
}

/** PATCH /api/events/:eventId/tasks/:id */
export async function updateTask(req: Request, res: Response): Promise<Response> {
  const authReq = req as AuthRequest;
  const db = getDatabase();
  const { id, eventId } = req.params;

  const event = await requireEventAccess(authReq, res, eventId, { allowMembers: true });
  if (!event) return res as Response;

  const task = await db.get('SELECT * FROM tasks WHERE id = $1 AND event_id = $2', [id, eventId]);
  if (!task) return res.status(404).json({ error: 'Task not found.' });

  const { title, notes, assignee_name, assigned_user_id, due_date, status, priority } = req.body as Record<string, string>;
  const fields: string[] = [];
  const params: (string | number | null)[] = [];

  let derivedAssigneeName = assignee_name;
  if (assigned_user_id !== undefined) {
    const assignedUserId = Number(assigned_user_id);
    if (!Number.isInteger(assignedUserId)) return res.status(400).json({ error: 'assigned_user_id must be a valid user id.' });
    const teamMembers = await getTaskTeamMemberIds(db, String(task.event_id));
    if (!teamMembers.has(assignedUserId)) return res.status(400).json({ error: 'Assigned user must be a member of this event.' });
    const assignee = await db.get<{ display_name: string }>('SELECT display_name FROM users WHERE id = $1 AND deleted_at IS NULL', [assignedUserId]);
    if (!assignee) return res.status(404).json({ error: 'Assigned user not found.' });
    fields.push('assigned_user_id = ?');
    params.push(assignedUserId);
    fields.push('assignee_name = ?');
    params.push(assignee.display_name);
  }

  if (title !== undefined) { fields.push('title = ?'); params.push(title.trim()); }
  if (notes !== undefined) { fields.push('notes = ?'); params.push(notes.trim() || null); }
  if (due_date !== undefined) { fields.push('due_date = ?'); params.push(due_date || null); }
  if (status !== undefined) {
    if (!ALLOWED_STATUSES.has(status)) return res.status(400).json({ error: 'Invalid task status.' });
    fields.push('status = ?');
    params.push(normalizeTaskStatus(status));
  }
  if (priority !== undefined) {
    if (!ALLOWED_PRIORITIES.has(priority)) return res.status(400).json({ error: 'Invalid priority.' });
    fields.push('priority = ?');
    params.push(priority);
  }
  if (assignee_name !== undefined && assigned_user_id === undefined) { fields.push('assignee_name = ?'); params.push(assignee_name.trim() || null); }

  if (fields.length === 0) return res.status(400).json({ error: 'No fields to update.' });

  fields.push('updated_at = CURRENT_TIMESTAMP');
  params.push(id);

  await db.run(`UPDATE tasks SET ${fields.join(', ')} WHERE id = $1`, params);
  const updated = await db.get(
    `SELECT t.*, COALESCE(u.display_name, t.assignee_name) AS assignee_name
     FROM tasks t
     LEFT JOIN users u ON t.assigned_user_id = u.id
     WHERE t.id = $1`,
    [id],
  );

  const newTaskStatus = normalizeTaskStatus(status);
  if (newTaskStatus === 'Complete' && task.status !== 'Complete') {
    const authReq = req as AuthRequest;
    await logActivity(
      String(task.event_id),
      authReq.user?.id ?? null,
      'task_completed',
      `Task completed: ${(updated as Record<string, unknown>)['title'] as string ?? 'Unknown'}`,
      `/events/${task.event_id as string}`,
    );
  }

  await logMutation(db, authReq, AUDIT_ACTIONS.TASK_UPDATE, 'task', id, { eventId });
  return res.json({ task: updated });
}

/** DELETE /api/events/:eventId/tasks/:id */
export async function deleteTask(req: Request, res: Response): Promise<Response> {
  const authReq = req as AuthRequest;
  const db = getDatabase();
  const { id, eventId } = req.params;

  const event = await requireEventAccess(authReq, res, eventId, { allowMembers: true });
  if (!event) return res as Response;

  const task = await db.get('SELECT id FROM tasks WHERE id = $1 AND event_id = $2', [id, eventId]);
  if (!task) return res.status(404).json({ error: 'Task not found.' });

  await db.run('DELETE FROM tasks WHERE id = $1', [id]);
  await logMutation(db, authReq, AUDIT_ACTIONS.TASK_DELETE, 'task', id, { eventId });
  return res.json({ message: 'Task deleted.' });
}

// ── Comments ─────────────────────────────────────────────────────────────────

/** GET /api/events/:eventId/tasks/:taskId/comments */
export async function listComments(req: Request, res: Response): Promise<Response> {
  const authReq = req as AuthRequest;
  const db = getDatabase();
  const { taskId, eventId } = req.params;

  const event = await requireEventAccess(authReq, res, eventId, { allowMembers: true });
  if (!event) return res as Response;

  const task = await db.get('SELECT id FROM tasks WHERE id = $1 AND event_id = $2', [taskId, eventId]);
  if (!task) return res.status(404).json({ error: 'Task not found.' });

  const comments = await db.all(
    `SELECT tc.*, COALESCE(u.display_name, u.email) AS author_name
     FROM task_comments tc
     LEFT JOIN users u ON tc.user_id = u.id
     WHERE tc.task_id = $1
     ORDER BY tc.created_at ASC`,
    [taskId],
  );
  return res.json({ comments });
}

/** POST /api/events/:eventId/tasks/:taskId/comments */
export async function addComment(req: AuthRequest, res: Response): Promise<Response> {
  const db = getDatabase();
  const { taskId, eventId } = req.params;
  const { body } = req.body as { body?: string };

  if (!body?.trim()) return res.status(400).json({ error: 'Comment body is required.' });

  const event = await requireEventAccess(req, res, eventId, { allowMembers: true });
  if (!event) return res as Response;

  const task = await db.get('SELECT id FROM tasks WHERE id = $1 AND event_id = $2', [taskId, eventId]);
  if (!task) return res.status(404).json({ error: 'Task not found.' });

  const result = await db.run(
    `INSERT INTO task_comments (task_id, user_id, body) VALUES ($1, $2, $3) RETURNING id`,
    [taskId, req.user!.id, body.trim()],
  );

  const comment = await db.get(
    `SELECT tc.*, COALESCE(u.display_name, u.email) AS author_name
     FROM task_comments tc
     LEFT JOIN users u ON tc.user_id = u.id
     WHERE tc.id = $1`,
    [result.lastID],
  );
  return res.status(201).json({ comment });
}

// ── Subtasks ──────────────────────────────────────────────────────────────────

/** POST /api/events/:eventId/tasks/:taskId/subtasks */
export async function addSubtask(req: Request, res: Response): Promise<Response> {
  const authReq = req as AuthRequest;
  const db = getDatabase();
  const { taskId, eventId } = req.params;
  const { title } = req.body as { title?: string };

  if (!title?.trim()) return res.status(400).json({ error: 'Subtask title is required.' });

  const event = await requireEventAccess(authReq, res, eventId, { allowMembers: true });
  if (!event) return res as Response;

  const task = await db.get('SELECT id FROM tasks WHERE id = $1 AND event_id = $2', [taskId, eventId]);
  if (!task) return res.status(404).json({ error: 'Task not found.' });

  const result = await db.run(
    `INSERT INTO task_subtasks (task_id, title) VALUES ($1, $2) RETURNING id`,
    [taskId, title.trim()],
  );

  const subtask = await db.get('SELECT * FROM task_subtasks WHERE id = $1', [result.lastID]);
  return res.status(201).json({ subtask });
}

/** PATCH /api/events/:eventId/tasks/:taskId/subtasks/:id */
export async function toggleSubtask(req: Request, res: Response): Promise<Response> {
  const authReq = req as AuthRequest;
  const db = getDatabase();
  const { id, eventId } = req.params;

  const event = await requireEventAccess(authReq, res, eventId, { allowMembers: true });
  if (!event) return res as Response;

  const subtask = await db.get(
    `SELECT ts.* FROM task_subtasks ts
     JOIN tasks t ON t.id = ts.task_id
     WHERE ts.id = $1 AND t.event_id = $2`,
    [id, eventId],
  );
  if (!subtask) return res.status(404).json({ error: 'Subtask not found.' });

  await db.run('UPDATE task_subtasks SET completed = NOT completed WHERE id = $1', [id]);
  const updated = await db.get('SELECT * FROM task_subtasks WHERE id = $1', [id]);
  return res.json({ subtask: updated });
}

/** DELETE /api/events/:eventId/tasks/:taskId/subtasks/:id */
export async function deleteSubtask(req: Request, res: Response): Promise<Response> {
  const authReq = req as AuthRequest;
  const db = getDatabase();
  const { id, eventId } = req.params;

  const event = await requireEventAccess(authReq, res, eventId, { allowMembers: true });
  if (!event) return res as Response;

  const subtask = await db.get(
    `SELECT ts.id FROM task_subtasks ts
     JOIN tasks t ON t.id = ts.task_id
     WHERE ts.id = $1 AND t.event_id = $2`,
    [id, eventId],
  );
  if (!subtask) return res.status(404).json({ error: 'Subtask not found.' });

  await db.run('DELETE FROM task_subtasks WHERE id = $1', [id]);
  return res.json({ message: 'Subtask deleted.' });
}
