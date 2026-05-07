/**
 * Shopping → Budget Sync Controller (#439)
 * Allows purchased shopping items to push their cost into budget expenses.
 */

import { Request, Response } from 'express';
import { getDatabase } from '../db/database.js';
import { requireEventAccess } from '../utils/event-access.js';

interface AuthRequest extends Request {
  user?: { id: number; email: string; role_id: number };
}

/**
 * POST /api/events/:eventId/shopping-lists/:listId/items/:itemId/sync-to-budget
 *
 * Creates or updates an expense entry for a purchased shopping item.
 * - Only items with status 'Purchased' are eligible.
 * - The actual_cost is preferred; falls back to estimated_cost.
 * - A source reference is stored in the expense notes to prevent duplicate syncs.
 */
export async function syncItemToBudget(req: Request, res: Response): Promise<Response> {
  const authReq = req as AuthRequest;
  if (!authReq.user) return res.status(401).json({ error: 'Authentication required.' });

  const { eventId, listId, itemId } = req.params;
  const { category_id } = req.body as { category_id?: number };

  const event = await requireEventAccess(authReq, res, eventId, { allowMembers: true });
  if (!event) return res as Response;

  const db = getDatabase();

  // Validate the shopping item exists and belongs to this list/event
  const item = await db.get<{
    id: number;
    list_id: number;
    name: string;
    status: string;
    actual_cost: number | null;
    estimated_cost: number | null;
  }>(
    `SELECT si.*
     FROM shopping_items si
     JOIN shopping_lists sl ON sl.id = si.list_id
     WHERE si.id = ? AND si.list_id = ? AND sl.event_id = ?`,
    [itemId, listId, eventId],
  );

  if (!item) return res.status(404).json({ error: 'Shopping item not found in this event.' });

  if (item.status !== 'Purchased') {
    return res.status(400).json({
      error: 'Only purchased items can be synced to the budget.',
    });
  }

  const cost = Number(item.actual_cost ?? item.estimated_cost ?? 0);
  if (cost <= 0) {
    return res.status(400).json({
      error: 'Item has no cost recorded. Set actual_cost or estimated_cost before syncing.',
    });
  }

  // Source tag used to detect duplicate syncs
  const sourceTag = `shopping_item:${itemId}`;

  // Check if an expense already exists for this shopping item
  const existing = await db.get<{ id: number; amount: number }>(
    `SELECT id, amount FROM expenses WHERE event_id = ? AND notes LIKE ?`,
    [eventId, `%${sourceTag}%`],
  );

  if (existing) {
    // Update the amount if cost has changed
    if (Number(existing.amount) !== cost) {
      await db.run(
        `UPDATE expenses SET amount = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [cost, existing.id],
      );
    }
    const updated = await db.get(`SELECT * FROM expenses WHERE id = ?`, [existing.id]);
    return res.json({ expense: updated, synced: true, updated: true });
  }

  // Create a new expense entry
  const notes = `Synced from shopping list item "${item.name}". [${sourceTag}]`;
  const result = await db.run(
    `INSERT INTO expenses
       (event_id, category_id, title, amount, payment_status, notes, created_by)
     VALUES (?, ?, ?, ?, 'Paid', ?, ?) RETURNING id`,
    [eventId, category_id ?? null, item.name, cost, notes, authReq.user.id],
  );

  const expense = await db.get(`SELECT * FROM expenses WHERE id = ?`, [result.lastID]);
  return res.status(201).json({ expense, synced: true, updated: false });
}
