import { Request, Response } from 'express';
import { getDatabase } from '../db/database.js';

interface AuthRequest extends Request {
  user?: { id: number; email: string; role_id: number };
}

/**
 * GET /api/events/:eventId/budget
 * Returns the event budget record plus a spend summary:
 * - total_budget, total_spent, remaining
 * - breakdown by category (for chart rendering)
 */
export async function getBudget(req: Request, res: Response): Promise<Response> {
  const db = getDatabase();
  const { eventId } = req.params;

  const event = await db.get('SELECT id FROM events WHERE id = ? AND deleted_at IS NULL', [eventId]);
  if (!event) return res.status(404).json({ error: 'Event not found.' });

  const budget = await db.get('SELECT * FROM event_budgets WHERE event_id = ?', [eventId]);

  // Aggregate spend totals
  const totalSpentRow = (await db.get(
    `SELECT COALESCE(SUM(amount), 0) AS total FROM expenses WHERE event_id = ?`,
    [eventId],
  )) as { total: number } | undefined;
  const totalSpent = Number(totalSpentRow?.total ?? 0);
  const totalBudget = budget ? Number(budget.total_budget) : 0;

  // Category breakdown for pie/bar chart
  const breakdown = await db.all(
    `SELECT
       COALESCE(ec.name, 'Uncategorised') AS category,
       COALESCE(ec.color, '#94a3b8')      AS color,
       SUM(e.amount)                       AS amount
     FROM expenses e
     LEFT JOIN expense_categories ec ON ec.id = e.category_id
     WHERE e.event_id = ?
     GROUP BY ec.id, ec.name, ec.color
     ORDER BY amount DESC`,
    [eventId],
  );

  // Coerce Postgres NUMERIC/string amounts to JS numbers
  const typedBreakdown = (breakdown as { category: string; color: string; amount: unknown }[]).map((row) => ({
    ...row,
    amount: Number(row.amount),
  }));

  return res.json({
    budget: budget ?? null,
    summary: {
      total_budget: totalBudget,
      total_spent: totalSpent,
      remaining: totalBudget - totalSpent,
    },
    breakdown: typedBreakdown,
  });
}

/**
 * PUT /api/events/:eventId/budget
 * Creates or replaces the event budget (upsert).
 */
export async function upsertBudget(req: Request, res: Response): Promise<Response> {
  const { eventId } = req.params;
  const authReq = req as AuthRequest;
  const userId = authReq.user?.id;
  if (!userId) return res.status(401).json({ error: 'Authentication required.' });

  const { total_budget, currency, notes } = req.body as {
    total_budget?: number;
    currency?: string;
    notes?: string;
  };

  if (total_budget === undefined || total_budget === null) {
    return res.status(400).json({ error: 'total_budget is required.' });
  }
  if (!Number.isFinite(total_budget) || total_budget < 0) {
    return res.status(400).json({ error: 'total_budget must be a non-negative number.' });
  }

  const db = getDatabase();
  const event = await db.get('SELECT id, created_by FROM events WHERE id = ? AND deleted_at IS NULL', [eventId]);
  if (!event) return res.status(404).json({ error: 'Event not found.' });
  if (Number(event.created_by) !== Number(userId) && authReq.user?.role_id !== 3) {
    return res.status(403).json({ error: 'Not authorised to manage the budget for this event.' });
  }

  await db.run(
    `INSERT INTO event_budgets (event_id, total_budget, currency, notes, updated_at)
     VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
     ON CONFLICT (event_id) DO UPDATE SET
       total_budget = EXCLUDED.total_budget,
       currency     = EXCLUDED.currency,
       notes        = EXCLUDED.notes,
       updated_at   = CURRENT_TIMESTAMP`,
    [eventId, total_budget, currency?.trim() || 'USD', notes?.trim() || null],
  );

  const budget = await db.get('SELECT * FROM event_budgets WHERE event_id = ?', [eventId]);
  return res.json({ budget });
}
