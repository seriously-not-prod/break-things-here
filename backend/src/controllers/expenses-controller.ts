import { Request, Response } from 'express';
import { getDatabase } from '../db/database.js';

interface AuthRequest extends Request {
  user?: { id: number; email: string; role_id: number };
}

const VALID_EXPENSE_STATUSES = ['Pending', 'Approved', 'Rejected'];

/** GET /api/events/:eventId/expenses */
export async function listExpenses(req: Request, res: Response): Promise<Response> {
  const db = getDatabase();
  const { eventId } = req.params;
  const rows = await db.all(
    `SELECT e.*, ec.name AS category_name, ec.color AS category_color
     FROM expenses e
     LEFT JOIN expense_categories ec ON ec.id = e.category_id
     WHERE e.event_id = ?
     ORDER BY e.created_at DESC`,
    [eventId],
  );
  return res.json({ expenses: rows });
}

/** POST /api/events/:eventId/expenses */
export async function createExpense(req: Request, res: Response): Promise<Response> {
  const { eventId } = req.params;
  const authReq = req as AuthRequest;
  const userId = authReq.user?.id;
  if (!userId) return res.status(401).json({ error: 'Authentication required.' });

  const { title, amount, category_id, paid_by, receipt_url, status, notes } = req.body as {
    title?: string;
    amount?: number;
    category_id?: number;
    paid_by?: string;
    receipt_url?: string;
    status?: string;
    notes?: string;
  };

  if (!title?.trim()) return res.status(400).json({ error: 'Expense title is required.' });
  if (amount === undefined || amount === null) return res.status(400).json({ error: 'Amount is required.' });
  if (!Number.isFinite(amount) || amount < 0) return res.status(400).json({ error: 'Amount must be a non-negative number.' });

  const db = getDatabase();
  const event = await db.get('SELECT id, created_by FROM events WHERE id = ? AND deleted_at IS NULL', [eventId]);
  if (!event) return res.status(404).json({ error: 'Event not found.' });
  if (Number(event.created_by) !== Number(userId) && authReq.user?.role_id !== 3) {
    return res.status(403).json({ error: 'Not authorised to manage expenses for this event.' });
  }

  if (category_id != null) {
    const cat = await db.get('SELECT id FROM expense_categories WHERE id = ?', [category_id]);
    if (!cat) return res.status(400).json({ error: 'Category not found.' });
  }

  const result = await db.run(
    `INSERT INTO expenses (event_id, category_id, title, amount, paid_by, receipt_url, status, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     RETURNING id`,
    [
      eventId,
      category_id ?? null,
      title.trim(),
      amount,
      paid_by?.trim() || null,
      receipt_url?.trim() || null,
      status || 'Pending',
      notes?.trim() || null,
    ],
  );

  const expense = await db.get(
    `SELECT e.*, ec.name AS category_name, ec.color AS category_color
     FROM expenses e
     LEFT JOIN expense_categories ec ON ec.id = e.category_id
     WHERE e.id = ?`,
    [result.lastID],
  );
  return res.status(201).json({ expense });
}

/** PATCH /api/events/:eventId/expenses/:id */
export async function updateExpense(req: Request, res: Response): Promise<Response> {
  const db = getDatabase();
  const { eventId, id } = req.params;
  const authReq = req as AuthRequest;
  const userId = authReq.user?.id;
  if (!userId) return res.status(401).json({ error: 'Authentication required.' });

  const expense = await db.get('SELECT * FROM expenses WHERE id = ? AND event_id = ?', [id, eventId]);
  if (!expense) return res.status(404).json({ error: 'Expense not found.' });

  const event = await db.get('SELECT created_by FROM events WHERE id = ? AND deleted_at IS NULL', [eventId]);
  if (!event) return res.status(404).json({ error: 'Event not found.' });
  if (Number(event.created_by) !== Number(userId) && authReq.user?.role_id !== 3) {
    return res.status(403).json({ error: 'Not authorised to manage expenses for this event.' });
  }

  const { title, amount, category_id, paid_by, receipt_url, status, notes } = req.body as Record<string, string | number>;
  const fields: string[] = [];
  const params: (string | number | null)[] = [];

  if (title !== undefined) { fields.push('title = ?'); params.push(String(title).trim()); }
  if (amount !== undefined) {
    const numAmount = Number(amount);
    if (!Number.isFinite(numAmount) || numAmount < 0) return res.status(400).json({ error: 'Amount must be a non-negative number.' });
    fields.push('amount = ?'); params.push(numAmount);
  }
  if (category_id !== undefined) {
    if (category_id !== null) {
      const cat = await db.get('SELECT id FROM expense_categories WHERE id = ?', [category_id]);
      if (!cat) return res.status(400).json({ error: 'Category not found.' });
    }
    fields.push('category_id = ?'); params.push(category_id ?? null);
  }
  if (paid_by !== undefined) { fields.push('paid_by = ?'); params.push(String(paid_by).trim() || null); }
  if (receipt_url !== undefined) { fields.push('receipt_url = ?'); params.push(String(receipt_url).trim() || null); }
  if (status !== undefined) {
    if (!VALID_EXPENSE_STATUSES.includes(String(status))) {
      return res.status(400).json({ error: `Status must be one of: ${VALID_EXPENSE_STATUSES.join(', ')}.` });
    }
    fields.push('status = ?'); params.push(String(status));
  }
  if (notes !== undefined) { fields.push('notes = ?'); params.push(String(notes).trim() || null); }

  if (fields.length === 0) return res.status(400).json({ error: 'No fields to update.' });

  fields.push('updated_at = CURRENT_TIMESTAMP');
  params.push(id);
  params.push(eventId);

  await db.run(`UPDATE expenses SET ${fields.join(', ')} WHERE id = ? AND event_id = ?`, params);
  const updated = await db.get(
    `SELECT e.*, ec.name AS category_name, ec.color AS category_color
     FROM expenses e
     LEFT JOIN expense_categories ec ON ec.id = e.category_id
     WHERE e.id = ?`,
    [id],
  );
  return res.json({ expense: updated });
}

/** DELETE /api/events/:eventId/expenses/:id */
export async function deleteExpense(req: Request, res: Response): Promise<Response> {
  const db = getDatabase();
  const { eventId, id } = req.params;
  const authReq = req as AuthRequest;
  const userId = authReq.user?.id;
  if (!userId) return res.status(401).json({ error: 'Authentication required.' });

  const expense = await db.get('SELECT id FROM expenses WHERE id = ? AND event_id = ?', [id, eventId]);
  if (!expense) return res.status(404).json({ error: 'Expense not found.' });

  const event = await db.get('SELECT created_by FROM events WHERE id = ? AND deleted_at IS NULL', [eventId]);
  if (!event) return res.status(404).json({ error: 'Event not found.' });
  if (Number(event.created_by) !== Number(userId) && authReq.user?.role_id !== 3) {
    return res.status(403).json({ error: 'Not authorised to manage expenses for this event.' });
  }

  await db.run('DELETE FROM expenses WHERE id = ? AND event_id = ?', [id, eventId]);
  return res.json({ message: 'Expense deleted.' });
}
