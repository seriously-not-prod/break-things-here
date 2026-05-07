/**
 * Budget Controller
 * Handles CRUD operations for budget categories and expenses
 * BRD section 3.4 / Issue #374
 */

import { Request, Response } from 'express';
import { getDatabase } from '../db/database.js';
import { logActivity } from './activity-feed-controller.js';
import { createBudgetAlert } from './notifications-controller.js';
import { requireEventAccess } from '../utils/event-access.js';

interface AuthRequest extends Request {
  user?: { id: number; email: string; role_id: number };
}

// ─── Internal helper ─────────────────────────────────────────────────────────

/**
 * After any expense write, check if the category has hit the 90% budget threshold.
 * If so, fire a notification to the event owner. Errors are swallowed so they
 * never disrupt the primary request.
 */
async function checkAndFireBudgetAlert(
  db: ReturnType<typeof getDatabase>,
  categoryId: number,
  eventId: number,
): Promise<void> {
  try {
    const row = await db.get<{
      name:      string;
      allocated: string;
      spent:     string;
      owner_id:  number;
    }>(
      `SELECT bc.name,
              bc.allocated_amount::numeric              AS allocated,
              COALESCE(SUM(ex.amount), 0)::numeric      AS spent,
              ev.created_by                             AS owner_id
       FROM budget_categories bc
       JOIN events ev ON ev.id = bc.event_id
       LEFT JOIN expenses ex ON ex.category_id = bc.id
       WHERE bc.id = ? AND bc.event_id = ?
       GROUP BY bc.id, bc.name, bc.allocated_amount, ev.created_by`,
      [categoryId, eventId],
    );

    if (!row) return;

    const allocated = Number(row.allocated);
    if (allocated <= 0) return;

    const pct = Math.round((Number(row.spent) / allocated) * 100);
    if (pct >= 90) {
      await createBudgetAlert(eventId, row.owner_id, row.name, pct);
    }
  } catch (err) {
    console.error('checkAndFireBudgetAlert failed:', err);
  }
}

// ─── Budget Categories ────────────────────────────────────────────────────────

/**
 * GET /events/:eventId/budget/categories
 * Returns all budget categories for an event with aggregated spent amount.
 */
export async function listCategories(req: AuthRequest, res: Response): Promise<void> {
  try {
    const db = getDatabase();
    const { eventId } = req.params;

    const event = await requireEventAccess(req, res, eventId, { allowMembers: true });
    if (!event) return;

    const categories = await db.all<{
      id: number;
      event_id: number;
      name: string;
      allocated_amount: number;
      color: string | null;
      created_at: string;
      spent: number;
    }>(
      `SELECT bc.id,
              bc.event_id,
              bc.name,
              bc.allocated_amount,
              bc.color,
              bc.created_at,
              COALESCE(SUM(e.amount), 0)::numeric AS spent
       FROM budget_categories bc
       LEFT JOIN expenses e ON e.category_id = bc.id
       WHERE bc.event_id = ?
       GROUP BY bc.id, bc.event_id, bc.name, bc.allocated_amount, bc.color, bc.created_at
       ORDER BY bc.name ASC`,
      [eventId],
    );

    res.json({ categories });
  } catch (error) {
    console.error('Error listing budget categories:', error);
    res.status(500).json({ error: 'Failed to fetch budget categories' });
  }
}

/**
 * POST /events/:eventId/budget/categories
 * Body: { name, allocated_amount, color }
 */
export async function createCategory(req: AuthRequest, res: Response): Promise<void> {
  try {
    const db = getDatabase();
    const { eventId } = req.params;

    const event = await requireEventAccess(req, res, eventId, { ownerOnly: true });
    if (!event) return;

    const { name, allocated_amount, color } = req.body as {
      name?: unknown;
      allocated_amount?: unknown;
      color?: unknown;
    };

    if (typeof name !== 'string' || name.trim() === '') {
      res.status(400).json({ error: 'name is required' });
      return;
    }
    const parsedAmount = Number(allocated_amount);
    if (!Number.isFinite(parsedAmount) || parsedAmount < 0) {
      res.status(400).json({ error: 'allocated_amount must be a non-negative number' });
      return;
    }
    const safeColor = typeof color === 'string' ? color.trim() : null;

    const result = await db.run(
      `INSERT INTO budget_categories (event_id, name, allocated_amount, color)
       VALUES (?, ?, ?, ?) RETURNING id`,
      [eventId, name.trim(), parsedAmount, safeColor],
    );

    const category = await db.get<{ id: number; event_id: number; name: string; allocated_amount: number; color: string | null; created_at: string }>(
      `SELECT bc.id, bc.event_id, bc.name, bc.allocated_amount, bc.color, bc.created_at,
              0 AS spent
       FROM budget_categories bc WHERE bc.id = ?`,
      [result.lastID],
    );

    res.status(201).json({ category });
  } catch (error) {
    console.error('Error creating budget category:', error);
    res.status(500).json({ error: 'Failed to create budget category' });
  }
}

/**
 * PUT /events/:eventId/budget/categories/:id
 * Body: { name, allocated_amount, color }
 */
export async function updateCategory(req: AuthRequest, res: Response): Promise<void> {
  try {
    const db = getDatabase();
    const { eventId, id } = req.params;

    const event = await requireEventAccess(req, res, eventId, { ownerOnly: true });
    if (!event) return;

    const { name, allocated_amount, color } = req.body as {
      name?: unknown;
      allocated_amount?: unknown;
      color?: unknown;
    };

    const existing = await db.get(
      'SELECT id FROM budget_categories WHERE id = ? AND event_id = ?',
      [id, eventId],
    );
    if (!existing) {
      res.status(404).json({ error: 'Budget category not found' });
      return;
    }

    if (typeof name !== 'string' || name.trim() === '') {
      res.status(400).json({ error: 'name is required' });
      return;
    }
    const parsedAmount = Number(allocated_amount);
    if (!Number.isFinite(parsedAmount) || parsedAmount < 0) {
      res.status(400).json({ error: 'allocated_amount must be a non-negative number' });
      return;
    }
    const safeColor = typeof color === 'string' ? color.trim() : null;

    await db.run(
      `UPDATE budget_categories SET name = ?, allocated_amount = ?, color = ? WHERE id = ?`,
      [name.trim(), parsedAmount, safeColor, id],
    );

    const category = await db.get(
      `SELECT bc.id, bc.event_id, bc.name, bc.allocated_amount, bc.color, bc.created_at,
              COALESCE(SUM(e.amount), 0)::numeric AS spent
       FROM budget_categories bc
       LEFT JOIN expenses e ON e.category_id = bc.id
       WHERE bc.id = ?
       GROUP BY bc.id, bc.event_id, bc.name, bc.allocated_amount, bc.color, bc.created_at`,
      [id],
    );

    res.json({ category });
  } catch (error) {
    console.error('Error updating budget category:', error);
    res.status(500).json({ error: 'Failed to update budget category' });
  }
}

/**
 * DELETE /events/:eventId/budget/categories/:id
 */
export async function deleteCategory(req: AuthRequest, res: Response): Promise<void> {
  try {
    const db = getDatabase();
    const { eventId, id } = req.params;

    const event = await requireEventAccess(req, res, eventId, { ownerOnly: true });
    if (!event) return;

    const existing = await db.get(
      'SELECT id FROM budget_categories WHERE id = ? AND event_id = ?',
      [id, eventId],
    );
    if (!existing) {
      res.status(404).json({ error: 'Budget category not found' });
      return;
    }

    await db.run('DELETE FROM expenses WHERE category_id = ?', [id]);
    await db.run('DELETE FROM budget_categories WHERE id = ?', [id]);

    res.status(204).end();
  } catch (error) {
    console.error('Error deleting budget category:', error);
    res.status(500).json({ error: 'Failed to delete budget category' });
  }
}

// ─── Expenses ─────────────────────────────────────────────────────────────────

/**
 * GET /events/:eventId/expenses
 * Returns all expenses for an event with category name joined.
 */
export async function listExpenses(req: AuthRequest, res: Response): Promise<void> {
  try {
    const db = getDatabase();
    const { eventId } = req.params;

    const event = await requireEventAccess(req, res, eventId, { allowMembers: true });
    if (!event) return;

    const expenses = await db.all(
      `SELECT e.*, bc.name AS category_name
       FROM expenses e
       LEFT JOIN budget_categories bc ON bc.id = e.category_id
       WHERE e.event_id = ?
       ORDER BY e.created_at DESC`,
      [eventId],
    );

    res.json({ expenses });
  } catch (error) {
    console.error('Error listing expenses:', error);
    res.status(500).json({ error: 'Failed to fetch expenses' });
  }
}

const VALID_PAYMENT_STATUSES = ['pending', 'paid', 'overdue'] as const;
type PaymentStatus = (typeof VALID_PAYMENT_STATUSES)[number];

/**
 * POST /events/:eventId/expenses
 * Body: { title, amount, category_id, payment_status, vendor_name, notes }
 */
export async function createExpense(req: AuthRequest, res: Response): Promise<void> {
  try {
    const db = getDatabase();
    const { eventId } = req.params;

    const event = await requireEventAccess(req, res, eventId, { allowMembers: true });
    if (!event) return;

    const { title, amount, category_id, payment_status, vendor_name, notes } = req.body as {
      title?: unknown;
      amount?: unknown;
      category_id?: unknown;
      payment_status?: unknown;
      vendor_name?: unknown;
      notes?: unknown;
    };

    if (typeof title !== 'string' || title.trim() === '') {
      res.status(400).json({ error: 'title is required' });
      return;
    }
    const parsedAmount = Number(amount);
    if (!Number.isFinite(parsedAmount) || parsedAmount < 0) {
      res.status(400).json({ error: 'amount must be a non-negative number' });
      return;
    }
    const parsedCategoryId = Number(category_id);
    if (!Number.isInteger(parsedCategoryId) || parsedCategoryId <= 0) {
      res.status(400).json({ error: 'category_id must be a valid integer' });
      return;
    }

    const status: PaymentStatus = VALID_PAYMENT_STATUSES.includes(payment_status as PaymentStatus)
      ? (payment_status as PaymentStatus)
      : 'pending';

    const safeVendor = typeof vendor_name === 'string' ? vendor_name.trim() : null;
    const safeNotes = typeof notes === 'string' ? notes.trim() : null;

    const result = await db.run(
      `INSERT INTO expenses (event_id, category_id, title, amount, payment_status, vendor_name, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING id`,
      [eventId, parsedCategoryId, title.trim(), parsedAmount, status, safeVendor, safeNotes],
    );

    const expense = await db.get(
      `SELECT e.*, bc.name AS category_name
       FROM expenses e
       LEFT JOIN budget_categories bc ON bc.id = e.category_id
       WHERE e.id = ?`,
      [result.lastID],
    );

    // Fire budget alert if category reaches >= 90% utilisation
    await checkAndFireBudgetAlert(db, parsedCategoryId, Number(eventId));

    await logActivity(
      eventId,
      req.user?.id ?? null,
      'expense_added',
      `Expense added: ${title.trim()} — $${parsedAmount.toFixed(2)}`,
      `/events/${eventId}`,
    );

    res.status(201).json({ expense });
  } catch (error) {
    console.error('Error creating expense:', error);
    res.status(500).json({ error: 'Failed to create expense' });
  }
}

/**
 * PUT /events/:eventId/expenses/:id
 */
export async function updateExpense(req: AuthRequest, res: Response): Promise<void> {
  try {
    const db = getDatabase();
    const { eventId, id } = req.params;

    const event = await requireEventAccess(req, res, eventId, { allowMembers: true });
    if (!event) return;

    const { title, amount, category_id, payment_status, vendor_name, notes } = req.body as {
      title?: unknown;
      amount?: unknown;
      category_id?: unknown;
      payment_status?: unknown;
      vendor_name?: unknown;
      notes?: unknown;
    };

    const existing = await db.get(
      'SELECT id FROM expenses WHERE id = ? AND event_id = ?',
      [id, eventId],
    );
    if (!existing) {
      res.status(404).json({ error: 'Expense not found' });
      return;
    }

    if (typeof title !== 'string' || title.trim() === '') {
      res.status(400).json({ error: 'title is required' });
      return;
    }
    const parsedAmount = Number(amount);
    if (!Number.isFinite(parsedAmount) || parsedAmount < 0) {
      res.status(400).json({ error: 'amount must be a non-negative number' });
      return;
    }
    const parsedCategoryId = Number(category_id);
    if (!Number.isInteger(parsedCategoryId) || parsedCategoryId <= 0) {
      res.status(400).json({ error: 'category_id must be a valid integer' });
      return;
    }

    const status: PaymentStatus = VALID_PAYMENT_STATUSES.includes(payment_status as PaymentStatus)
      ? (payment_status as PaymentStatus)
      : 'pending';

    const safeVendor = typeof vendor_name === 'string' ? vendor_name.trim() : null;
    const safeNotes = typeof notes === 'string' ? notes.trim() : null;

    await db.run(
      `UPDATE expenses SET title = ?, amount = ?, category_id = ?, payment_status = ?,
              vendor_name = ?, notes = ? WHERE id = ?`,
      [title.trim(), parsedAmount, parsedCategoryId, status, safeVendor, safeNotes, id],
    );

    const expense = await db.get(
      `SELECT e.*, bc.name AS category_name
       FROM expenses e
       LEFT JOIN budget_categories bc ON bc.id = e.category_id
       WHERE e.id = ?`,
      [id],
    );

    // Fire budget alert if category reaches >= 90% utilisation
    await checkAndFireBudgetAlert(db, parsedCategoryId, Number(eventId));

    res.json({ expense });
  } catch (error) {
    console.error('Error updating expense:', error);
    res.status(500).json({ error: 'Failed to update expense' });
  }
}

/**
 * DELETE /events/:eventId/expenses/:id
 */
export async function deleteExpense(req: AuthRequest, res: Response): Promise<void> {
  try {
    const db = getDatabase();
    const { eventId, id } = req.params;

    const event = await requireEventAccess(req, res, eventId, { ownerOnly: true });
    if (!event) return;

    const existing = await db.get(
      'SELECT id FROM expenses WHERE id = ? AND event_id = ?',
      [id, eventId],
    );
    if (!existing) {
      res.status(404).json({ error: 'Expense not found' });
      return;
    }

    await db.run('DELETE FROM expenses WHERE id = ?', [id]);
    res.status(204).end();
  } catch (error) {
    console.error('Error deleting expense:', error);
    res.status(500).json({ error: 'Failed to delete expense' });
  }
}
