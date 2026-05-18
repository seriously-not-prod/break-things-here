/**
 * Task Templates & Time Entries Controller (#450)
 * Handles reusable task templates and actual time tracking for tasks.
 */

import { Request, Response } from 'express';
import { getDatabase } from '../db/database.js';
import { requireEventAccess } from '../utils/event-access.js';

interface AuthRequest extends Request {
  user?: { id: number; email: string; role_id: number };
}

interface TaskTemplate {
  id: number;
  event_id: number;
  name: string;
  description: string | null;
  priority: string;
  estimated_hours: number | null;
  created_by: number | null;
  created_at: string;
}

interface TaskTimeEntry {
  id: number;
  task_id: number;
  user_id: number;
  hours_spent: number;
  notes: string | null;
  logged_at: string;
  created_at: string;
}

// ─── Task Templates ───────────────────────────────────────────────────────────

/** GET /api/events/:eventId/task-templates */
export async function listTaskTemplates(req: Request, res: Response): Promise<Response> {
  const authReq = req as AuthRequest;
  if (!authReq.user) return res.status(401).json({ error: 'Authentication required.' });

  const { eventId } = req.params;
  const event = await requireEventAccess(authReq, res, eventId, { allowMembers: true });
  if (!event) return res as Response;

  const db = getDatabase();
  const templates = await db.all<TaskTemplate>(
    `SELECT * FROM task_templates WHERE event_id = $1 ORDER BY name ASC`,
    [eventId],
  );
  return res.json({ templates });
}

/** POST /api/events/:eventId/task-templates */
export async function createTaskTemplate(req: Request, res: Response): Promise<Response> {
  const authReq = req as AuthRequest;
  if (!authReq.user) return res.status(401).json({ error: 'Authentication required.' });

  const { eventId } = req.params;
  const { name, description, priority, estimated_hours } = req.body as {
    name?: string;
    description?: string;
    priority?: string;
    estimated_hours?: number;
  };

  if (!name?.trim()) return res.status(400).json({ error: 'Template name is required.' });
  if (priority && !['Low', 'Medium', 'High'].includes(priority)) {
    return res.status(400).json({ error: 'Priority must be Low, Medium, or High.' });
  }
  if (estimated_hours !== undefined && estimated_hours <= 0) {
    return res.status(400).json({ error: 'Estimated hours must be positive.' });
  }

  const event = await requireEventAccess(authReq, res, eventId, { allowMembers: true });
  if (!event) return res as Response;

  const db = getDatabase();
  const result = await db.run(
    `INSERT INTO task_templates (event_id, name, description, priority, estimated_hours, created_by)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    [eventId, name.trim(), description?.trim() ?? null, priority ?? 'Medium', estimated_hours ?? null, authReq.user.id],
  );

  const template = await db.get<TaskTemplate>(
    `SELECT * FROM task_templates WHERE id = $1`,
    [result.lastID],
  );
  return res.status(201).json({ template });
}

/** DELETE /api/events/:eventId/task-templates/:id */
export async function deleteTaskTemplate(req: Request, res: Response): Promise<Response> {
  const authReq = req as AuthRequest;
  if (!authReq.user) return res.status(401).json({ error: 'Authentication required.' });

  const { eventId, id } = req.params;
  const event = await requireEventAccess(authReq, res, eventId, { allowMembers: true });
  if (!event) return res as Response;

  const db = getDatabase();
  const template = await db.get<{ id: number }>(
    `SELECT id FROM task_templates WHERE id = $1 AND event_id = $2`,
    [id, eventId],
  );
  if (!template) return res.status(404).json({ error: 'Task template not found.' });

  await db.run(`DELETE FROM task_templates WHERE id = $1`, [id]);
  return res.json({ message: 'Task template deleted.' });
}

/**
 * POST /api/events/:eventId/task-templates/:id/apply
 * Creates a new task from the template.
 */
export async function applyTaskTemplate(req: Request, res: Response): Promise<Response> {
  const authReq = req as AuthRequest;
  if (!authReq.user) return res.status(401).json({ error: 'Authentication required.' });

  const { eventId, id } = req.params;
  const { title, assignee_name, due_date } = req.body as {
    title?: string;
    assignee_name?: string;
    due_date?: string;
  };

  const event = await requireEventAccess(authReq, res, eventId, { allowMembers: true });
  if (!event) return res as Response;

  const db = getDatabase();
  const template = await db.get<TaskTemplate>(
    `SELECT * FROM task_templates WHERE id = $1 AND event_id = $2`,
    [id, eventId],
  );
  if (!template) return res.status(404).json({ error: 'Task template not found.' });

  const taskTitle = (title?.trim() || template.name).slice(0, 255);
  const result = await db.run(
    `INSERT INTO tasks
       (event_id, title, description, priority, estimated_hours,
        assignee_name, due_date, status, created_by, template_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 'Pending', $8, $9) RETURNING id`,
    [
      eventId,
      taskTitle,
      template.description,
      template.priority,
      template.estimated_hours,
      assignee_name?.trim() ?? null,
      due_date ?? null,
      authReq.user.id,
      template.id,
    ],
  );

  const task = await db.get(`SELECT * FROM tasks WHERE id = $1`, [result.lastID]);
  return res.status(201).json({ task });
}

// ─── Task Time Entries ────────────────────────────────────────────────────────

/** GET /api/events/:eventId/tasks/:taskId/time-entries */
export async function listTimeEntries(req: Request, res: Response): Promise<Response> {
  const authReq = req as AuthRequest;
  if (!authReq.user) return res.status(401).json({ error: 'Authentication required.' });

  const { eventId, taskId } = req.params;
  const event = await requireEventAccess(authReq, res, eventId, { allowMembers: true });
  if (!event) return res as Response;

  const db = getDatabase();

  // Verify task belongs to this event (prevents cross-event access by taskId)
  const taskCheck = await db.get<{ id: number }>(
    `SELECT id FROM tasks WHERE id = $1 AND event_id = $2`,
    [taskId, eventId],
  );
  if (!taskCheck) return res.status(404).json({ error: 'Task not found in this event.' });

  const entries = await db.all<TaskTimeEntry & { author_name: string }>(
    `SELECT tte.*, u.display_name AS author_name
     FROM task_time_entries tte
     JOIN users u ON u.id = tte.user_id
     JOIN tasks t ON t.id = tte.task_id
     WHERE tte.task_id = $1 AND t.event_id = $2
     ORDER BY tte.logged_at DESC, tte.created_at DESC`,
    [taskId, eventId],
  );
  const totalHours = entries.reduce((sum, e) => sum + Number(e.hours_spent), 0);
  return res.json({ entries, total_hours: totalHours });
}

/** POST /api/events/:eventId/tasks/:taskId/time-entries */
export async function addTimeEntry(req: Request, res: Response): Promise<Response> {
  const authReq = req as AuthRequest;
  if (!authReq.user) return res.status(401).json({ error: 'Authentication required.' });

  const { eventId, taskId } = req.params;
  const { hours_spent, notes, logged_at } = req.body as {
    hours_spent?: number;
    notes?: string;
    logged_at?: string;
  };

  if (!hours_spent || hours_spent <= 0) {
    return res.status(400).json({ error: 'hours_spent must be a positive number.' });
  }
  if (hours_spent > 24) {
    return res.status(400).json({ error: 'Cannot log more than 24 hours per entry.' });
  }

  const event = await requireEventAccess(authReq, res, eventId, { allowMembers: true });
  if (!event) return res as Response;

  const db = getDatabase();
  const task = await db.get<{ id: number }>(
    `SELECT id FROM tasks WHERE id = $1 AND event_id = $2`,
    [taskId, eventId],
  );
  if (!task) return res.status(404).json({ error: 'Task not found in this event.' });

  const result = await db.run(
    `INSERT INTO task_time_entries (task_id, user_id, hours_spent, notes, logged_at)
     VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [taskId, authReq.user.id, hours_spent, notes?.trim() ?? null, logged_at ?? new Date().toISOString().slice(0, 10)],
  );

  const entry = await db.get(
    `SELECT tte.*, u.display_name AS author_name
     FROM task_time_entries tte
     JOIN users u ON u.id = tte.user_id
     WHERE tte.id = $1`,
    [result.lastID],
  );
  return res.status(201).json({ entry });
}

/** DELETE /api/events/:eventId/tasks/:taskId/time-entries/:id */
export async function deleteTimeEntry(req: Request, res: Response): Promise<Response> {
  const authReq = req as AuthRequest;
  if (!authReq.user) return res.status(401).json({ error: 'Authentication required.' });

  const { eventId, taskId, id } = req.params;
  const event = await requireEventAccess(authReq, res, eventId, { allowMembers: true });
  if (!event) return res as Response;

  const db = getDatabase();
  // Verify task belongs to this event
  const task = await db.get<{ event_id: number; created_by: number | null }>(
    `SELECT event_id, created_by FROM tasks WHERE id = $1 AND event_id = $2`,
    [taskId, eventId],
  );
  if (!task) return res.status(404).json({ error: 'Task not found in this event.' });

  const entry = await db.get<TaskTimeEntry>(
    `SELECT * FROM task_time_entries WHERE id = $1 AND task_id = $2`,
    [id, taskId],
  );
  if (!entry) return res.status(404).json({ error: 'Time entry not found.' });

  // Allow: entry author OR event owner/admin
  const isOwner = event.created_by === authReq.user.id;
  const isAuthor = entry.user_id === authReq.user.id;
  if (!isAuthor && !isOwner) {
    return res.status(403).json({ error: 'Not authorised to delete this time entry.' });
  }

  await db.run(`DELETE FROM task_time_entries WHERE id = $1`, [id]);
  return res.json({ message: 'Time entry deleted.' });
}
