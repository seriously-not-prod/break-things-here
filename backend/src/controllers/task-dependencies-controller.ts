/**
 * Task Dependencies Controller (#440)
 * Manages blocking/blocked-by relationships between tasks.
 */

import { Request, Response } from 'express';
import { getDatabase } from '../db/database.js';
import { requireEventAccess } from '../utils/event-access.js';

interface AuthRequest extends Request {
  user?: { id: number; email: string; role_id: number };
}

interface TaskDependency {
  id: number;
  task_id: number;
  depends_on_id: number;
  created_by: number | null;
  created_at: string;
}

/**
 * Detect if adding a dependency from task_id → depends_on_id would create a cycle.
 * Performs a BFS from depends_on_id through existing dependencies to see if task_id
 * is already reachable (which would close a cycle).
 */
async function wouldCreateCycle(
  db: ReturnType<typeof getDatabase>,
  taskId: number,
  dependsOnId: number,
): Promise<boolean> {
  const visited = new Set<number>();
  const queue = [dependsOnId];

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (current === taskId) return true;
    if (visited.has(current)) continue;
    visited.add(current);

    const upstreams = await db.all<{ depends_on_id: number }>(
      `SELECT depends_on_id FROM task_dependencies WHERE task_id = ?`,
      [current],
    );
    for (const row of upstreams) queue.push(row.depends_on_id);
  }
  return false;
}

// ─── List Dependencies for a Task ────────────────────────────────────────────

/**
 * GET /api/events/:eventId/tasks/:taskId/dependencies
 * Returns all tasks this task depends on (blocking tasks) and tasks blocked by it.
 */
export async function listDependencies(req: Request, res: Response): Promise<Response> {
  const authReq = req as AuthRequest;
  if (!authReq.user) return res.status(401).json({ error: 'Authentication required.' });

  const { eventId, taskId } = req.params;
  const event = await requireEventAccess(authReq, res, eventId, { allowMembers: true });
  if (!event) return res as Response;

  const db = getDatabase();

  // Tasks this task is blocked by (depends_on_id = other tasks)
  const blocking = await db.all(
    `SELECT t.id, t.title, t.status, t.priority, td.id AS dep_id
     FROM task_dependencies td
     JOIN tasks t ON t.id = td.depends_on_id
     WHERE td.task_id = ?
     ORDER BY t.title ASC`,
    [taskId],
  );

  // Tasks blocked by this task (task_id = other tasks that depend on us)
  const blockedBy = await db.all(
    `SELECT t.id, t.title, t.status, t.priority, td.id AS dep_id
     FROM task_dependencies td
     JOIN tasks t ON t.id = td.task_id
     WHERE td.depends_on_id = ?
     ORDER BY t.title ASC`,
    [taskId],
  );

  return res.json({ blocking, blocked_by: blockedBy });
}

// ─── Add Dependency ───────────────────────────────────────────────────────────

/**
 * POST /api/events/:eventId/tasks/:taskId/dependencies
 * Body: { depends_on_id: number }
 */
export async function addDependency(req: Request, res: Response): Promise<Response> {
  const authReq = req as AuthRequest;
  if (!authReq.user) return res.status(401).json({ error: 'Authentication required.' });

  const { eventId, taskId } = req.params;
  const { depends_on_id } = req.body as { depends_on_id?: number };

  if (!depends_on_id) return res.status(400).json({ error: 'depends_on_id is required.' });
  if (Number(taskId) === depends_on_id) {
    return res.status(400).json({ error: 'A task cannot depend on itself.' });
  }

  const event = await requireEventAccess(authReq, res, eventId, { allowMembers: true });
  if (!event) return res as Response;

  const db = getDatabase();

  // Verify both tasks belong to this event
  const [task, dep] = await Promise.all([
    db.get<{ id: number }>(`SELECT id FROM tasks WHERE id = ? AND event_id = ?`, [taskId, eventId]),
    db.get<{ id: number }>(`SELECT id FROM tasks WHERE id = ? AND event_id = ?`, [depends_on_id, eventId]),
  ]);

  if (!task) return res.status(404).json({ error: 'Task not found in this event.' });
  if (!dep) return res.status(404).json({ error: 'Dependency task not found in this event.' });

  // Cycle check
  const hasCycle = await wouldCreateCycle(db, Number(taskId), depends_on_id);
  if (hasCycle) {
    return res.status(409).json({ error: 'Adding this dependency would create a circular dependency.' });
  }

  // Check for existing dependency
  const existing = await db.get<TaskDependency>(
    `SELECT id FROM task_dependencies WHERE task_id = ? AND depends_on_id = ?`,
    [taskId, depends_on_id],
  );
  if (existing) {
    return res.status(409).json({ error: 'This dependency already exists.' });
  }

  const result = await db.run(
    `INSERT INTO task_dependencies (task_id, depends_on_id, created_by) VALUES (?, ?, ?) RETURNING id`,
    [taskId, depends_on_id, authReq.user.id],
  );

  const dependency = await db.get<TaskDependency>(
    `SELECT * FROM task_dependencies WHERE id = ?`,
    [result.lastID],
  );
  return res.status(201).json({ dependency });
}

// ─── Remove Dependency ────────────────────────────────────────────────────────

/**
 * DELETE /api/events/:eventId/tasks/:taskId/dependencies/:depId
 */
export async function removeDependency(req: Request, res: Response): Promise<Response> {
  const authReq = req as AuthRequest;
  if (!authReq.user) return res.status(401).json({ error: 'Authentication required.' });

  const { eventId, taskId, depId } = req.params;
  const event = await requireEventAccess(authReq, res, eventId, { allowMembers: true });
  if (!event) return res as Response;

  const db = getDatabase();

  const dep = await db.get<TaskDependency>(
    `SELECT * FROM task_dependencies WHERE id = ? AND task_id = ?`,
    [depId, taskId],
  );
  if (!dep) return res.status(404).json({ error: 'Dependency not found.' });

  await db.run(`DELETE FROM task_dependencies WHERE id = ?`, [depId]);
  return res.json({ message: 'Dependency removed.' });
}
