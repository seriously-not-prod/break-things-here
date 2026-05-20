import { Request, Response } from 'express';
import { getDatabase } from '../db/database.js';
import { logActivity } from './activity-feed-controller.js';
import { requireEventAccess } from '../utils/event-access.js';
import { AUDIT_ACTIONS, logMutation } from '../utils/audit-log.js';
import { processMentions } from '../services/mentions/fanout.js';

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

// ─── task_assignees (M:N) helpers — B1.2 ─────────────────────────────────────

export interface AssigneeRow {
  user_id: number;
  display_name: string | null;
  email: string | null;
  is_primary: boolean;
}

/**
 * Resolve and validate the requested assignee user_ids for an event-scoped
 * task. Returns the normalized list in input order. The first id is the
 * primary; duplicates are removed; non-members raise an error.
 *
 * Returning `null` means a caller-supplied value was malformed/empty and
 * the request should respond 400 with the embedded message.
 */
async function normaliseAssigneeIds(
  db: ReturnType<typeof getDatabase>,
  eventId: string,
  raw: unknown,
): Promise<{ ok: true; ids: number[] } | { ok: false; error: string }> {
  if (raw === undefined || raw === null) return { ok: true, ids: [] };
  if (!Array.isArray(raw)) {
    return { ok: false, error: 'assignee_user_ids must be an array of integers.' };
  }
  const seen = new Set<number>();
  const ordered: number[] = [];
  for (const value of raw) {
    const n = Number(value);
    if (!Number.isInteger(n)) {
      return { ok: false, error: 'assignee_user_ids entries must be integers.' };
    }
    if (seen.has(n)) continue;
    seen.add(n);
    ordered.push(n);
  }
  if (ordered.length === 0) return { ok: true, ids: [] };
  const teamMembers = await getTaskTeamMemberIds(db, eventId);
  const stranger = ordered.find((id) => !teamMembers.has(id));
  if (stranger !== undefined) {
    return { ok: false, error: `User ${stranger} is not a member of this event.` };
  }
  return { ok: true, ids: ordered };
}

/**
 * Replace the assignee set for a task. The first id in the array becomes
 * is_primary=true and is mirrored to the legacy `tasks.assigned_user_id`
 * column so existing readers and the dashboard "owner" view keep working
 * through the migration window.
 *
 * Called from createTask + updateTask + the new explicit add/remove
 * endpoints. Idempotent: re-setting the same list is a no-op.
 */
async function replaceTaskAssignees(
  db: ReturnType<typeof getDatabase>,
  taskId: number,
  userIds: number[],
): Promise<void> {
  // Wipe and rewrite — this is a small set per task (typically <5 rows) so
  // doing it transactionally via the adapter is simpler than diffing.
  await db.run('DELETE FROM task_assignees WHERE task_id = ?', [taskId]);
  for (let i = 0; i < userIds.length; i++) {
    await db.run(
      `INSERT INTO task_assignees (task_id, user_id, is_primary)
       VALUES (?, ?, ?)
       ON CONFLICT (task_id, user_id) DO UPDATE SET is_primary = EXCLUDED.is_primary`,
      [taskId, userIds[i], i === 0],
    );
  }
  // Mirror primary to legacy column (or null when assignee set is empty).
  await db.run('UPDATE tasks SET assigned_user_id = ? WHERE id = ?', [
    userIds[0] ?? null,
    taskId,
  ]);
}

/** Single round-trip load of assignees for a set of task ids. Avoids N+1 in listTasks. */
async function loadAssigneesForTasks(
  db: ReturnType<typeof getDatabase>,
  taskIds: number[],
): Promise<Map<number, AssigneeRow[]>> {
  const map = new Map<number, AssigneeRow[]>();
  if (taskIds.length === 0) return map;
  const placeholders = taskIds.map(() => '?').join(',');
  const rows = await db.all<{
    task_id: number;
    user_id: number;
    display_name: string | null;
    email: string | null;
    is_primary: boolean;
  }>(
    `SELECT ta.task_id, ta.user_id, ta.is_primary, u.display_name, u.email
       FROM task_assignees ta
       LEFT JOIN users u ON u.id = ta.user_id AND u.deleted_at IS NULL
      WHERE ta.task_id IN (${placeholders})
      ORDER BY ta.is_primary DESC, ta.assigned_at ASC`,
    taskIds,
  );
  for (const row of rows) {
    const bucket = map.get(Number(row.task_id)) ?? [];
    bucket.push({
      user_id: Number(row.user_id),
      display_name: row.display_name,
      email: row.email,
      is_primary: Boolean(row.is_primary),
    });
    map.set(Number(row.task_id), bucket);
  }
  return map;
}

/** GET /api/events/:eventId/tasks */
export async function listTasks(req: Request, res: Response): Promise<Response> {
  const authReq = req as AuthRequest;
  const db = getDatabase();
  const { eventId } = req.params;
  const event = await requireEventAccess(authReq, res, eventId, { allowMembers: true });
  if (!event) return res as Response;
  const rows = await db.all<{ id: number } & Record<string, unknown>>(
    `SELECT t.*, COALESCE(u.display_name, t.assignee_name) AS assignee_name
     FROM tasks t
     LEFT JOIN users u ON t.assigned_user_id = u.id
     WHERE t.event_id = $1
     ORDER BY t.due_date ASC, t.priority ASC`,
    [eventId],
  );
  const ids = rows.map((r) => Number(r.id));
  const assignees = await loadAssigneesForTasks(db, ids);
  const tasks = rows.map((row) => ({
    ...row,
    assignees: assignees.get(Number(row.id)) ?? [],
  }));
  return res.json({ tasks });
}

/** POST /api/events/:eventId/tasks */
export async function createTask(req: AuthRequest, res: Response): Promise<Response> {
  const { eventId } = req.params;
  const body = req.body as {
    title?: string;
    notes?: string;
    assignee_name?: string;
    assigned_user_id?: number | string;
    // B1.2: explicit M:N list; first id becomes primary.
    assignee_user_ids?: unknown;
    due_date?: string;
    status?: string;
    priority?: string;
  };
  const { title, notes, assignee_name, assigned_user_id, due_date, status, priority } = body;

  if (!title?.trim()) return res.status(400).json({ error: 'Task title is required.' });
  if (status && !ALLOWED_STATUSES.has(status)) return res.status(400).json({ error: 'Invalid task status.' });
  if (priority && !ALLOWED_PRIORITIES.has(priority)) return res.status(400).json({ error: 'Invalid priority.' });

  const db = getDatabase();

  const event = await requireEventAccess(req, res, eventId, { allowMembers: true });
  if (!event) return res as Response;

  // Resolve assignee set. Precedence:
  //   1. assignee_user_ids (new M:N path) when supplied.
  //   2. assigned_user_id (legacy single) when supplied.
  //   3. neither — task is unassigned.
  let assigneeIds: number[] = [];
  if (body.assignee_user_ids !== undefined) {
    const parsed = await normaliseAssigneeIds(db, eventId, body.assignee_user_ids);
    if (!parsed.ok) return res.status(400).json({ error: parsed.error });
    assigneeIds = parsed.ids;
  } else if (assigned_user_id !== undefined && assigned_user_id !== null && assigned_user_id !== '') {
    const n = Number(assigned_user_id);
    if (!Number.isInteger(n)) return res.status(400).json({ error: 'assigned_user_id must be a valid user id.' });
    const teamMembers = await getTaskTeamMemberIds(db, eventId);
    if (!teamMembers.has(n)) return res.status(400).json({ error: 'Assigned user must be a member of this event.' });
    assigneeIds = [n];
  }

  // Derive the display_name shown in legacy list responses from the primary
  // assignee, if any; fall back to whatever the client posted.
  let derivedAssigneeName = assignee_name?.trim() || null;
  if (assigneeIds.length > 0) {
    const primary = await db.get<{ display_name: string }>(
      'SELECT display_name FROM users WHERE id = $1 AND deleted_at IS NULL',
      [assigneeIds[0]],
    );
    if (!primary) return res.status(404).json({ error: 'Primary assignee user not found.' });
    derivedAssigneeName = primary.display_name;
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
      assigneeIds[0] ?? null,
      due_date || null,
      normalizeTaskStatus(status),
      priority || 'Medium',
      req.user!.id,
    ],
  );

  if (result.lastID !== undefined && assigneeIds.length > 0) {
    await replaceTaskAssignees(db, result.lastID, assigneeIds);
  }

  const taskRow = await db.get<{ id: number } & Record<string, unknown>>(
    'SELECT * FROM tasks WHERE id = $1',
    [result.lastID],
  );
  const assigneesMap = await loadAssigneesForTasks(
    db,
    taskRow?.id !== undefined ? [Number(taskRow.id)] : [],
  );
  const task = taskRow
    ? { ...taskRow, assignees: assigneesMap.get(Number(taskRow.id)) ?? [] }
    : null;

  await logActivity(
    eventId,
    req.user!.id,
    'task_created',
    `Task created: ${title.trim()}`,
    `/events/${eventId}`,
  );

  if (result.lastID !== undefined) {
    await logMutation(db, req, AUDIT_ACTIONS.TASK_CREATE, 'task', result.lastID, { eventId });
  }
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

  const body = req.body as Record<string, unknown>;
  const title = body.title as string | undefined;
  const notes = body.notes as string | undefined;
  const assignee_name = body.assignee_name as string | undefined;
  const assigned_user_id = body.assigned_user_id as string | number | undefined;
  const due_date = body.due_date as string | undefined;
  const status = body.status as string | undefined;
  const priority = body.priority as string | undefined;
  const fields: string[] = [];
  const params: (string | number | null)[] = [];

  // B1.2: if assignee_user_ids is supplied it replaces the whole assignee
  // set via task_assignees. The legacy assigned_user_id field is still
  // accepted but is interpreted as a single-element list.
  let newAssigneeIds: number[] | null = null;
  if (body.assignee_user_ids !== undefined) {
    const parsed = await normaliseAssigneeIds(db, eventId, body.assignee_user_ids);
    if (!parsed.ok) return res.status(400).json({ error: parsed.error });
    newAssigneeIds = parsed.ids;
  } else if (assigned_user_id !== undefined) {
    if (assigned_user_id === null || assigned_user_id === '') {
      newAssigneeIds = [];
    } else {
      const n = Number(assigned_user_id);
      if (!Number.isInteger(n)) return res.status(400).json({ error: 'assigned_user_id must be a valid user id.' });
      const teamMembers = await getTaskTeamMemberIds(db, String(task.event_id));
      if (!teamMembers.has(n)) return res.status(400).json({ error: 'Assigned user must be a member of this event.' });
      newAssigneeIds = [n];
    }
  }

  // Mirror the primary into the legacy column in the same UPDATE so
  // legacy readers (dashboard owner pill, etc.) stay consistent.
  if (newAssigneeIds !== null) {
    fields.push('assigned_user_id = ?');
    params.push(newAssigneeIds[0] ?? null);
    if (newAssigneeIds.length > 0) {
      const primary = await db.get<{ display_name: string }>(
        'SELECT display_name FROM users WHERE id = $1 AND deleted_at IS NULL',
        [newAssigneeIds[0]],
      );
      if (!primary) return res.status(404).json({ error: 'Primary assignee user not found.' });
      fields.push('assignee_name = ?');
      params.push(primary.display_name);
    } else {
      fields.push('assignee_name = ?');
      params.push(null);
    }
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
  if (assignee_name !== undefined && assigned_user_id === undefined && body.assignee_user_ids === undefined) {
    fields.push('assignee_name = ?');
    params.push(assignee_name.trim() || null);
  }

  if (fields.length === 0) return res.status(400).json({ error: 'No fields to update.' });

  fields.push('updated_at = CURRENT_TIMESTAMP');
  params.push(id);

  // Use `?` for the WHERE clause too so convertPlaceholders renumbers every
  // bind consistently — mixing `$1` here with `?` in the fields collapses
  // the WHERE param onto the first SET param.
  await db.run(`UPDATE tasks SET ${fields.join(', ')} WHERE id = ?`, params);

  // Sync the M:N table after the scalar update so the response below sees
  // both sources consistent. Skipped when no assignee change was requested.
  if (newAssigneeIds !== null) {
    await replaceTaskAssignees(db, Number(id), newAssigneeIds);
  }

  const updatedRow = await db.get<{ id: number } & Record<string, unknown>>(
    `SELECT t.*, COALESCE(u.display_name, t.assignee_name) AS assignee_name
     FROM tasks t
     LEFT JOIN users u ON t.assigned_user_id = u.id
     WHERE t.id = $1`,
    [id],
  );
  const assigneesMap = await loadAssigneesForTasks(
    db,
    updatedRow?.id !== undefined ? [Number(updatedRow.id)] : [],
  );
  const updated = updatedRow
    ? { ...updatedRow, assignees: assigneesMap.get(Number(updatedRow.id)) ?? [] }
    : null;

  const newTaskStatus = normalizeTaskStatus(status);
  if (newTaskStatus === 'Complete' && task.status !== 'Complete') {
    await logActivity(
      String(task.event_id),
      authReq.user?.id ?? null,
      'task_completed',
      `Task completed: ${(updated as Record<string, unknown> | null)?.['title'] as string ?? 'Unknown'}`,
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

// ── Assignees (M:N) — granular add/remove — B1.2 ────────────────────────────

/** GET /api/events/:eventId/tasks/:taskId/assignees */
export async function listAssignees(req: Request, res: Response): Promise<Response> {
  const authReq = req as AuthRequest;
  const db = getDatabase();
  const { eventId, taskId } = req.params;
  const event = await requireEventAccess(authReq, res, eventId, { allowMembers: true });
  if (!event) return res as Response;
  const task = await db.get('SELECT id FROM tasks WHERE id = $1 AND event_id = $2', [taskId, eventId]);
  if (!task) return res.status(404).json({ error: 'Task not found.' });
  const map = await loadAssigneesForTasks(db, [Number(taskId)]);
  return res.json({ assignees: map.get(Number(taskId)) ?? [] });
}

/** POST /api/events/:eventId/tasks/:taskId/assignees  body: { user_id, is_primary? } */
export async function addAssignee(req: Request, res: Response): Promise<Response> {
  const authReq = req as AuthRequest;
  const db = getDatabase();
  const { eventId, taskId } = req.params;
  const event = await requireEventAccess(authReq, res, eventId, { allowMembers: true });
  if (!event) return res as Response;
  const task = await db.get('SELECT id FROM tasks WHERE id = $1 AND event_id = $2', [taskId, eventId]);
  if (!task) return res.status(404).json({ error: 'Task not found.' });

  const body = req.body as { user_id?: number | string; is_primary?: boolean };
  const userId = Number(body.user_id);
  if (!Number.isInteger(userId)) {
    return res.status(400).json({ error: 'user_id must be a valid integer.' });
  }
  const teamMembers = await getTaskTeamMemberIds(db, eventId);
  if (!teamMembers.has(userId)) {
    return res.status(400).json({ error: 'User is not a member of this event.' });
  }

  // Promote to primary if requested; otherwise add as a secondary assignee.
  if (body.is_primary) {
    // Demote any existing primary first so the constraint stays clean.
    await db.run('UPDATE task_assignees SET is_primary = FALSE WHERE task_id = ?', [taskId]);
    await db.run('UPDATE tasks SET assigned_user_id = ? WHERE id = ?', [userId, taskId]);
  }
  await db.run(
    `INSERT INTO task_assignees (task_id, user_id, is_primary)
     VALUES (?, ?, ?)
     ON CONFLICT (task_id, user_id) DO UPDATE SET is_primary = EXCLUDED.is_primary`,
    [taskId, userId, Boolean(body.is_primary)],
  );

  await logMutation(db, authReq, AUDIT_ACTIONS.TASK_UPDATE, 'task', taskId, {
    eventId,
    op: 'add_assignee',
    user_id: userId,
    is_primary: Boolean(body.is_primary),
  });

  const map = await loadAssigneesForTasks(db, [Number(taskId)]);
  return res.status(201).json({ assignees: map.get(Number(taskId)) ?? [] });
}

/** DELETE /api/events/:eventId/tasks/:taskId/assignees/:userId */
export async function removeAssignee(req: Request, res: Response): Promise<Response> {
  const authReq = req as AuthRequest;
  const db = getDatabase();
  const { eventId, taskId, userId } = req.params;
  const event = await requireEventAccess(authReq, res, eventId, { allowMembers: true });
  if (!event) return res as Response;
  const task = await db.get<{ id: number; assigned_user_id: number | null }>(
    'SELECT id, assigned_user_id FROM tasks WHERE id = $1 AND event_id = $2',
    [taskId, eventId],
  );
  if (!task) return res.status(404).json({ error: 'Task not found.' });

  const removed = await db.run(
    'DELETE FROM task_assignees WHERE task_id = ? AND user_id = ?',
    [taskId, userId],
  );
  if (removed.changes === 0) {
    return res.status(404).json({ error: 'Assignee not found on this task.' });
  }

  // If the removed user was the legacy primary, promote whoever's left
  // (earliest assigned_at) or clear the legacy column.
  if (Number(task.assigned_user_id) === Number(userId)) {
    const nextPrimary = await db.get<{ user_id: number }>(
      `SELECT user_id FROM task_assignees
        WHERE task_id = ?
        ORDER BY assigned_at ASC LIMIT 1`,
      [taskId],
    );
    if (nextPrimary) {
      await db.run('UPDATE task_assignees SET is_primary = (user_id = ?) WHERE task_id = ?', [
        nextPrimary.user_id,
        taskId,
      ]);
      await db.run('UPDATE tasks SET assigned_user_id = ? WHERE id = ?', [nextPrimary.user_id, taskId]);
    } else {
      await db.run('UPDATE tasks SET assigned_user_id = NULL, assignee_name = NULL WHERE id = ?', [taskId]);
    }
  }

  await logMutation(db, authReq, AUDIT_ACTIONS.TASK_UPDATE, 'task', taskId, {
    eventId,
    op: 'remove_assignee',
    user_id: Number(userId),
  });

  const map = await loadAssigneesForTasks(db, [Number(taskId)]);
  return res.json({ assignees: map.get(Number(taskId)) ?? [] });
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

  // Fire-and-forget: parse @mentions and notify mentioned users (#810).
  void processMentions({
    sourceType: 'task_comment',
    sourceId: result.lastID!,
    authorId: req.user!.id,
    body: body.trim(),
    contextLabel: `task comment`,
    link: `/events/${eventId}/tasks/${taskId}`,
  });

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
