import { Request, Response } from 'express';
import { getDatabase } from '../db/database.js';

interface AuthRequest extends Request {
  user?: { id: number; email: string; role_id: number };
}

interface ShoppingListRow {
  id: number;
  event_id: number;
  name: string;
  created_by: number | null;
  created_at: string;
}

interface ShoppingItemRow {
  id: number;
  list_id: number;
  name: string;
  quantity: number;
  unit: string | null;
  estimated_cost: number | null;
  actual_cost: number | null;
  status: string;
  assigned_to: number | null;
  notes: string | null;
  created_at: string;
}

async function assertEventAccess(req: AuthRequest, res: Response, eventId: string): Promise<boolean> {
  if (!req.user) {
    res.status(401).json({ error: 'Authentication required.' });
    return false;
  }
  const db = getDatabase();
  const event = await db.get<{ id: number }>('SELECT id FROM events WHERE id = ? AND deleted_at IS NULL', [eventId]);
  if (!event) {
    res.status(404).json({ error: 'Event not found.' });
    return false;
  }
  return true;
}

/** GET /api/events/:eventId/shopping-lists */
export async function listLists(req: Request, res: Response): Promise<Response> {
  const authReq = req as AuthRequest;
  const { eventId } = req.params;
  const ok = await assertEventAccess(authReq, res, eventId);
  if (!ok) return res as Response;

  const db = getDatabase();
  const lists = await db.all<ShoppingListRow>(
    `SELECT * FROM shopping_lists WHERE event_id = ? ORDER BY created_at ASC`,
    [eventId],
  );
  return res.json({ lists });
}

/** POST /api/events/:eventId/shopping-lists */
export async function createList(req: Request, res: Response): Promise<Response> {
  const authReq = req as AuthRequest;
  const { eventId } = req.params;
  const ok = await assertEventAccess(authReq, res, eventId);
  if (!ok) return res as Response;

  const { name } = req.body as { name?: string };
  if (!name?.trim()) return res.status(400).json({ error: 'List name is required.' });

  const db = getDatabase();
  const result = await db.run(
    `INSERT INTO shopping_lists (event_id, name, created_by) VALUES (?, ?, ?) RETURNING id`,
    [eventId, name.trim(), authReq.user!.id],
  );

  const list = await db.get<ShoppingListRow>('SELECT * FROM shopping_lists WHERE id = ?', [result.lastID]);
  return res.status(201).json({ list });
}

/** DELETE /api/events/:eventId/shopping-lists/:listId */
export async function deleteList(req: Request, res: Response): Promise<Response> {
  const authReq = req as AuthRequest;
  const { eventId, listId } = req.params;
  const ok = await assertEventAccess(authReq, res, eventId);
  if (!ok) return res as Response;

  const db = getDatabase();
  const existing = await db.get<{ id: number }>('SELECT id FROM shopping_lists WHERE id = ? AND event_id = ?', [listId, eventId]);
  if (!existing) return res.status(404).json({ error: 'Shopping list not found.' });

  await db.run('DELETE FROM shopping_lists WHERE id = ? AND event_id = ?', [listId, eventId]);
  return res.status(204).send('');
}

/** GET /api/events/:eventId/shopping-lists/:listId/items */
export async function listItems(req: Request, res: Response): Promise<Response> {
  const authReq = req as AuthRequest;
  const { eventId, listId } = req.params;
  const ok = await assertEventAccess(authReq, res, eventId);
  if (!ok) return res as Response;

  const db = getDatabase();
  const list = await db.get<{ id: number }>('SELECT id FROM shopping_lists WHERE id = ? AND event_id = ?', [listId, eventId]);
  if (!list) return res.status(404).json({ error: 'Shopping list not found.' });

  const items = await db.all<ShoppingItemRow>(
    `SELECT * FROM shopping_items WHERE list_id = ? ORDER BY created_at ASC`,
    [listId],
  );
  return res.json({ items });
}

/** POST /api/events/:eventId/shopping-lists/:listId/items */
export async function createItem(req: Request, res: Response): Promise<Response> {
  const authReq = req as AuthRequest;
  const { eventId, listId } = req.params;
  const ok = await assertEventAccess(authReq, res, eventId);
  if (!ok) return res as Response;

  const db = getDatabase();
  const list = await db.get<{ id: number }>('SELECT id FROM shopping_lists WHERE id = ? AND event_id = ?', [listId, eventId]);
  if (!list) return res.status(404).json({ error: 'Shopping list not found.' });

  const { name, quantity, unit, estimated_cost, notes } = req.body as {
    name?: string;
    quantity?: number | string;
    unit?: string;
    estimated_cost?: number | string;
    notes?: string;
  };

  if (!name?.trim()) return res.status(400).json({ error: 'Item name is required.' });

  const parsedQty = quantity !== undefined && quantity !== '' ? Number(quantity) : 1;
  if (!Number.isInteger(parsedQty) || parsedQty < 1) {
    return res.status(400).json({ error: 'Quantity must be a positive integer.' });
  }

  const parsedCost = estimated_cost !== undefined && estimated_cost !== '' ? Number(estimated_cost) : null;
  if (parsedCost !== null && isNaN(parsedCost)) {
    return res.status(400).json({ error: 'Estimated cost must be a valid number.' });
  }

  const result = await db.run(
    `INSERT INTO shopping_items (list_id, name, quantity, unit, estimated_cost, notes)
     VALUES (?, ?, ?, ?, ?, ?)
     RETURNING id`,
    [listId, name.trim(), parsedQty, unit?.trim() || null, parsedCost, notes?.trim() || null],
  );

  const item = await db.get<ShoppingItemRow>('SELECT * FROM shopping_items WHERE id = ?', [result.lastID]);
  return res.status(201).json({ item });
}

/** PUT /api/events/:eventId/shopping-lists/:listId/items/:itemId */
export async function updateItem(req: Request, res: Response): Promise<Response> {
  const authReq = req as AuthRequest;
  const { eventId, listId, itemId } = req.params;
  const ok = await assertEventAccess(authReq, res, eventId);
  if (!ok) return res as Response;

  const db = getDatabase();
  const list = await db.get<{ id: number }>('SELECT id FROM shopping_lists WHERE id = ? AND event_id = ?', [listId, eventId]);
  if (!list) return res.status(404).json({ error: 'Shopping list not found.' });

  const existing = await db.get<ShoppingItemRow>('SELECT * FROM shopping_items WHERE id = ? AND list_id = ?', [itemId, listId]);
  if (!existing) return res.status(404).json({ error: 'Shopping item not found.' });

  const { status, actual_cost, assigned_to, name, quantity, unit, estimated_cost, notes } = req.body as {
    status?: string;
    actual_cost?: number | string;
    assigned_to?: number | string;
    name?: string;
    quantity?: number | string;
    unit?: string;
    estimated_cost?: number | string;
    notes?: string;
  };

  const validStatuses = ['Needed', 'Purchased', 'Not Available', 'Ordered'];
  if (status && !validStatuses.includes(status)) {
    return res.status(400).json({ error: `Status must be one of: ${validStatuses.join(', ')}.` });
  }

  const parsedActualCost = actual_cost !== undefined && actual_cost !== '' ? Number(actual_cost) : existing.actual_cost;
  const parsedEstCost = estimated_cost !== undefined && estimated_cost !== '' ? Number(estimated_cost) : existing.estimated_cost;
  const parsedQty = quantity !== undefined && quantity !== '' ? Number(quantity) : existing.quantity;
  const parsedAssigned = assigned_to !== undefined && assigned_to !== '' ? Number(assigned_to) : existing.assigned_to;

  await db.run(
    `UPDATE shopping_items SET
       name = ?, quantity = ?, unit = ?, estimated_cost = ?, actual_cost = ?,
       status = ?, assigned_to = ?, notes = ?
     WHERE id = ? AND list_id = ?`,
    [
      name?.trim() ?? existing.name,
      parsedQty,
      unit !== undefined ? (unit.trim() || null) : existing.unit,
      parsedEstCost,
      parsedActualCost,
      status ?? existing.status,
      parsedAssigned ?? null,
      notes !== undefined ? (notes.trim() || null) : existing.notes,
      itemId,
      listId,
    ],
  );

  const item = await db.get<ShoppingItemRow>('SELECT * FROM shopping_items WHERE id = ?', [itemId]);
  return res.json({ item });
}

/** DELETE /api/events/:eventId/shopping-lists/:listId/items/:itemId */
export async function deleteItem(req: Request, res: Response): Promise<Response> {
  const authReq = req as AuthRequest;
  const { eventId, listId, itemId } = req.params;
  const ok = await assertEventAccess(authReq, res, eventId);
  if (!ok) return res as Response;

  const db = getDatabase();
  const list = await db.get<{ id: number }>('SELECT id FROM shopping_lists WHERE id = ? AND event_id = ?', [listId, eventId]);
  if (!list) return res.status(404).json({ error: 'Shopping list not found.' });

  const existing = await db.get<{ id: number }>('SELECT id FROM shopping_items WHERE id = ? AND list_id = ?', [itemId, listId]);
  if (!existing) return res.status(404).json({ error: 'Shopping item not found.' });

  await db.run('DELETE FROM shopping_items WHERE id = ? AND list_id = ?', [itemId, listId]);
  return res.status(204).send('');
}
