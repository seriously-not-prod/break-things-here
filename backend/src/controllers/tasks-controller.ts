import { Request, Response } from 'express';
import { getDatabase } from '../db/database.js';

interface AuthRequest extends Request {
  user?: { id: number; email: string; role_id: number };
}

/** GET /api/events/:eventId/tasks */
export async function listTasks(req: Request, res: Response): Promise<Response> {
  const db = getDatabase();
  const { eventId } = req.params;
  const rows = await db.all('SELECT * FROM tasks WHERE event_id = ? ORDER BY due_date ASC', [eventId]);
  return res.json({ tasks: rows });
}

/** POST /api/events/:eventId/tasks */
export async function createTask(req: AuthRequest, res: Response): Promise<Response> {
  const { eventId } = req.params;
  const { title, notes, assignee_name, due_date, status } = req.body as {
    title?: string;
    notes?: string;
    assignee_name?: string;
    due_date?: string;
    status?: string;
  };

  if (!title?.trim()) return res.status(400).json({ error: 'Task title is required.' });

  const db = getDatabase();

  const event = await db.get('SELECT id FROM events WHERE id = ? AND deleted_at IS NULL', [eventId]);
  if (!event) return res.status(404).json({ error: 'Event not found.' });

  const result = await db.run(
    `INSERT INTO tasks (event_id, title, notes, assignee_name, due_date, status, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      eventId,
      title.trim(),
      notes?.trim() || null,
      assignee_name?.trim() || null,
      due_date || null,
      status || 'Pending',
      req.user!.id,
    ],
  );

  const task = await db.get('SELECT * FROM tasks WHERE id = ?', [result.lastID]);
  return res.status(201).json({ task });
}

/** PATCH /api/events/:eventId/tasks/:id */
export async function updateTask(req: Request, res: Response): Promise<Response> {
  const db = getDatabase();
  const { id } = req.params;

  const task = await db.get('SELECT * FROM tasks WHERE id = ?', [id]);
  if (!task) return res.status(404).json({ error: 'Task not found.' });

  const { title, notes, assignee_name, due_date, status } = req.body as Record<string, string>;
  const fields: string[] = [];
  const params: (string | null)[] = [];

  if (title !== undefined) { fields.push('title = ?'); params.push(title.trim()); }
  if (notes !== undefined) { fields.push('notes = ?'); params.push(notes.trim() || null); }
  if (assignee_name !== undefined) { fields.push('assignee_name = ?'); params.push(assignee_name.trim() || null); }
  if (due_date !== undefined) { fields.push('due_date = ?'); params.push(due_date || null); }
  if (status !== undefined) { fields.push('status = ?'); params.push(status); }

  if (fields.length === 0) return res.status(400).json({ error: 'No fields to update.' });

  fields.push('updated_at = CURRENT_TIMESTAMP');
  params.push(id);

  await db.run(`UPDATE tasks SET ${fields.join(', ')} WHERE id = ?`, params);
  const updated = await db.get('SELECT * FROM tasks WHERE id = ?', [id]);
  return res.json({ task: updated });
}

/** DELETE /api/events/:eventId/tasks/:id */
export async function deleteTask(req: Request, res: Response): Promise<Response> {
  const db = getDatabase();
  const { id } = req.params;

  const task = await db.get('SELECT id FROM tasks WHERE id = ?', [id]);
  if (!task) return res.status(404).json({ error: 'Task not found.' });

  await db.run('DELETE FROM tasks WHERE id = ?', [id]);
  return res.json({ message: 'Task deleted.' });
}
