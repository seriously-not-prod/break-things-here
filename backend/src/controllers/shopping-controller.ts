import { Request, Response } from 'express';
import { getDatabase } from '../db/database.js';
import { requireEventAccess } from '../utils/event-access.js';

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
  const event = await requireEventAccess(req, res, eventId, {
    allowMembers: true,
    forbiddenMessage: 'Not authorised to manage shopping lists for this event.',
  });
  return Boolean(event);
}

/** GET /api/events/:eventId/shopping-lists */
export async function listLists(req: Request, res: Response): Promise<Response> {
  const authReq = req as AuthRequest;
  const { eventId } = req.params;
  const ok = await assertEventAccess(authReq, res, eventId);
  if (!ok) return res as Response;

  const db = getDatabase();
  const lists = await db.all<ShoppingListRow>(
    `SELECT * FROM shopping_lists WHERE event_id = $1 ORDER BY created_at ASC`,
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
    `INSERT INTO shopping_lists (event_id, name, created_by) VALUES ($1, $2, $3) RETURNING id`,
    [eventId, name.trim(), authReq.user!.id],
  );

  const list = await db.get<ShoppingListRow>('SELECT * FROM shopping_lists WHERE id = $1', [result.lastID]);
  return res.status(201).json({ list });
}

/** DELETE /api/events/:eventId/shopping-lists/:listId */
export async function deleteList(req: Request, res: Response): Promise<Response> {
  const authReq = req as AuthRequest;
  const { eventId, listId } = req.params;
  const ok = await assertEventAccess(authReq, res, eventId);
  if (!ok) return res as Response;

  const db = getDatabase();
  const existing = await db.get<{ id: number }>('SELECT id FROM shopping_lists WHERE id = $1 AND event_id = $2', [listId, eventId]);
  if (!existing) return res.status(404).json({ error: 'Shopping list not found.' });

  await db.run('DELETE FROM shopping_lists WHERE id = $1 AND event_id = $2', [listId, eventId]);
  return res.status(204).send('');
}

/** GET /api/events/:eventId/shopping-lists/:listId/items */
export async function listItems(req: Request, res: Response): Promise<Response> {
  const authReq = req as AuthRequest;
  const { eventId, listId } = req.params;
  const ok = await assertEventAccess(authReq, res, eventId);
  if (!ok) return res as Response;

  const db = getDatabase();
  const list = await db.get<{ id: number }>('SELECT id FROM shopping_lists WHERE id = $1 AND event_id = $2', [listId, eventId]);
  if (!list) return res.status(404).json({ error: 'Shopping list not found.' });

  const items = await db.all<ShoppingItemRow>(
    `SELECT * FROM shopping_items WHERE list_id = $1 ORDER BY created_at ASC`,
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
  const list = await db.get<{ id: number }>('SELECT id FROM shopping_lists WHERE id = $1 AND event_id = $2', [listId, eventId]);
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
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id`,
    [listId, name.trim(), parsedQty, unit?.trim() || null, parsedCost, notes?.trim() || null],
  );

  const item = await db.get<ShoppingItemRow>('SELECT * FROM shopping_items WHERE id = $1', [result.lastID]);
  return res.status(201).json({ item });
}

/** PUT /api/events/:eventId/shopping-lists/:listId/items/:itemId */
export async function updateItem(req: Request, res: Response): Promise<Response> {
  const authReq = req as AuthRequest;
  const { eventId, listId, itemId } = req.params;
  const ok = await assertEventAccess(authReq, res, eventId);
  if (!ok) return res as Response;

  const db = getDatabase();
  const list = await db.get<{ id: number }>('SELECT id FROM shopping_lists WHERE id = $1 AND event_id = $2', [listId, eventId]);
  if (!list) return res.status(404).json({ error: 'Shopping list not found.' });

  const existing = await db.get<ShoppingItemRow>('SELECT * FROM shopping_items WHERE id = $1 AND list_id = $2', [itemId, listId]);
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
       name = $1, quantity = $2, unit = $3, estimated_cost = $4, actual_cost = $5,
       status = $6, assigned_to = $7, notes = $8
     WHERE id = $9 AND list_id = $10`,
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

  const item = await db.get<ShoppingItemRow>('SELECT * FROM shopping_items WHERE id = $1', [itemId]);
  return res.json({ item });
}

/** DELETE /api/events/:eventId/shopping-lists/:listId/items/:itemId */
export async function deleteItem(req: Request, res: Response): Promise<Response> {
  const authReq = req as AuthRequest;
  const { eventId, listId, itemId } = req.params;
  const ok = await assertEventAccess(authReq, res, eventId);
  if (!ok) return res as Response;

  const db = getDatabase();
  const list = await db.get<{ id: number }>('SELECT id FROM shopping_lists WHERE id = $1 AND event_id = $2', [listId, eventId]);
  if (!list) return res.status(404).json({ error: 'Shopping list not found.' });

  const existing = await db.get<{ id: number }>('SELECT id FROM shopping_items WHERE id = $1 AND list_id = $2', [itemId, listId]);
  if (!existing) return res.status(404).json({ error: 'Shopping item not found.' });

  await db.run('DELETE FROM shopping_items WHERE id = $1 AND list_id = $2', [itemId, listId]);
  return res.status(204).send('');
}

// ─── Price Data & Comparison (#552, #608) ─────────────────────────────────────

/**
 * PATCH /api/events/:eventId/shopping-lists/:listId/items/:itemId/price-data
 * Updates price comparison fields for a shopping item (#552):
 * source_store_name, source_store_url, compared_price_low, compared_price_high, price_checked_at.
 */
export async function updateItemPriceData(req: Request, res: Response): Promise<Response> {
  const authReq = req as AuthRequest;
  const { eventId, listId, itemId } = req.params;
  const ok = await assertEventAccess(authReq, res, eventId);
  if (!ok) return res as Response;

  const db = getDatabase();
  const list = await db.get<{ id: number }>('SELECT id FROM shopping_lists WHERE id = $1 AND event_id = $2', [listId, eventId]);
  if (!list) return res.status(404).json({ error: 'Shopping list not found.' });

  const existing = await db.get<ShoppingItemRow>('SELECT * FROM shopping_items WHERE id = $1 AND list_id = $2', [itemId, listId]);
  if (!existing) return res.status(404).json({ error: 'Shopping item not found.' });

  const { source_store_name, source_store_url, compared_price_low, compared_price_high } = req.body as {
    source_store_name?: string;
    source_store_url?: string;
    compared_price_low?: number | string;
    compared_price_high?: number | string;
  };

  // Validate URL: must be a valid http/https URL to prevent javascript:/data: injection
  if (source_store_url?.trim()) {
    try {
      const parsed = new URL(source_store_url.trim());
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        return res.status(400).json({ error: 'source_store_url must use http or https.' });
      }
    } catch {
      return res.status(400).json({ error: 'source_store_url must be a valid URL.' });
    }
  }

  // Trim string inputs before conversion so whitespace-only strings become null, not 0
  const rawLow = typeof compared_price_low === 'string' ? compared_price_low.trim() : compared_price_low;
  const rawHigh = typeof compared_price_high === 'string' ? compared_price_high.trim() : compared_price_high;

  const priceLow = rawLow !== undefined && rawLow !== '' ? Number(rawLow) : null;
  const priceHigh = rawHigh !== undefined && rawHigh !== '' ? Number(rawHigh) : null;

  if (priceLow !== null && isNaN(priceLow)) {
    return res.status(400).json({ error: 'compared_price_low must be a valid number.' });
  }
  if (priceHigh !== null && isNaN(priceHigh)) {
    return res.status(400).json({ error: 'compared_price_high must be a valid number.' });
  }
  if (priceLow !== null && priceHigh !== null && priceLow > priceHigh) {
    return res.status(400).json({ error: 'compared_price_low cannot exceed compared_price_high.' });
  }

  await db.run(
    `UPDATE shopping_items SET
       source_store_name  = COALESCE($1, source_store_name),
       source_store_url   = COALESCE($2, source_store_url),
       compared_price_low  = COALESCE($3, compared_price_low),
       compared_price_high = COALESCE($4, compared_price_high),
       price_checked_at   = CURRENT_TIMESTAMP,
       updated_at         = CURRENT_TIMESTAMP
     WHERE id = $5 AND list_id = $6`,
    [
      source_store_name?.trim() ?? null,
      source_store_url?.trim() ?? null,
      priceLow,
      priceHigh,
      itemId,
      listId,
    ],
  );

  const item = await db.get<ShoppingItemRow & {
    source_store_name: string | null;
    source_store_url: string | null;
    compared_price_low: number | null;
    compared_price_high: number | null;
    price_checked_at: string | null;
  }>('SELECT * FROM shopping_items WHERE id = $1', [itemId]);
  return res.json({ item });
}

/**
 * GET /api/events/:eventId/shopping-lists/:listId/price-comparison
 * Returns estimated-vs-actual price comparison for all items in the list (#552, #608).
 *
 * Response includes:
 * - per-item: name, estimated_cost, actual_cost, variance, variance_pct, compared_price_low/high, source_store_name
 * - totals: total_estimated, total_actual, total_variance, items_with_actuals, items_over_budget
 */
export async function getListPriceComparison(req: Request, res: Response): Promise<Response> {
  const authReq = req as AuthRequest;
  const { eventId, listId } = req.params;
  const ok = await assertEventAccess(authReq, res, eventId);
  if (!ok) return res as Response;

  const db = getDatabase();
  const list = await db.get<ShoppingListRow>('SELECT * FROM shopping_lists WHERE id = $1 AND event_id = $2', [listId, eventId]);
  if (!list) return res.status(404).json({ error: 'Shopping list not found.' });

  const items = await db.all<{
    id: number;
    name: string;
    quantity: number;
    unit: string | null;
    status: string;
    estimated_cost: number | null;
    actual_cost: number | null;
    source_store_name: string | null;
    source_store_url: string | null;
    compared_price_low: number | null;
    compared_price_high: number | null;
    price_checked_at: string | null;
  }>(
    `SELECT id, name, quantity, unit, status,
            estimated_cost, actual_cost,
            source_store_name, source_store_url,
            compared_price_low, compared_price_high, price_checked_at
       FROM shopping_items
      WHERE list_id = $1
      ORDER BY created_at ASC`,
    [listId],
  );

  let totalEstimated = 0;
  let totalActual = 0;
  let itemsWithActuals = 0;
  let itemsOverBudget = 0;

  const comparisonItems = items.map((item) => {
    const est = item.estimated_cost !== null ? Number(item.estimated_cost) : null;
    const act = item.actual_cost !== null ? Number(item.actual_cost) : null;

    if (est !== null) totalEstimated += est;
    if (act !== null) {
      totalActual += act;
      itemsWithActuals++;
      if (est !== null && act > est) itemsOverBudget++;
    }

    const variance = est !== null && act !== null ? act - est : null;
    const variancePct = est !== null && est !== 0 && act !== null
      ? Math.round(((act - est) / est) * 10000) / 100
      : null;

    return {
      id: item.id,
      name: item.name,
      quantity: item.quantity,
      unit: item.unit,
      status: item.status,
      estimated_cost: est,
      actual_cost: act,
      variance,
      variance_pct: variancePct,
      source_store_name: item.source_store_name,
      source_store_url: item.source_store_url,
      compared_price_low: item.compared_price_low !== null ? Number(item.compared_price_low) : null,
      compared_price_high: item.compared_price_high !== null ? Number(item.compared_price_high) : null,
      price_checked_at: item.price_checked_at,
    };
  });

  return res.json({
    list: { id: list.id, name: list.name },
    items: comparisonItems,
    summary: {
      total_items: items.length,
      items_with_actuals: itemsWithActuals,
      items_over_budget: itemsOverBudget,
      total_estimated: Math.round(totalEstimated * 100) / 100,
      total_actual: Math.round(totalActual * 100) / 100,
      total_variance: Math.round((totalActual - totalEstimated) * 100) / 100,
    },
  });
}

/**
 * GET /api/events/:eventId/shopping/price-comparison
 * Event-level estimated-vs-actual price comparison across ALL lists (#608).
 * Groups by list for high-level financial reporting.
 */
export async function getEventPriceComparison(req: Request, res: Response): Promise<Response> {
  const authReq = req as AuthRequest;
  const { eventId } = req.params;
  const ok = await assertEventAccess(authReq, res, eventId);
  if (!ok) return res as Response;

  const db = getDatabase();

  const lists = await db.all<{
    list_id: number;
    list_name: string;
    total_estimated: number;
    total_actual: number;
    items_count: number;
    items_with_actuals: number;
    items_over_budget: number;
  }>(
    `SELECT
       sl.id   AS list_id,
       sl.name AS list_name,
       COALESCE(SUM(si.estimated_cost), 0)::numeric                                    AS total_estimated,
       COALESCE(SUM(si.actual_cost), 0)::numeric                                       AS total_actual,
       COUNT(si.id)::int                                                               AS items_count,
       COUNT(si.id) FILTER (WHERE si.actual_cost IS NOT NULL)::int                     AS items_with_actuals,
       COUNT(si.id) FILTER (WHERE si.actual_cost > si.estimated_cost
                              AND si.estimated_cost IS NOT NULL
                              AND si.actual_cost IS NOT NULL)::int                     AS items_over_budget
     FROM shopping_lists sl
     LEFT JOIN shopping_items si ON si.list_id = sl.id
     WHERE sl.event_id = $1
     GROUP BY sl.id, sl.name
     ORDER BY sl.created_at ASC`,
    [eventId],
  );

  const totalEstimated = lists.reduce((s, l) => s + Number(l.total_estimated), 0);
  const totalActual = lists.reduce((s, l) => s + Number(l.total_actual), 0);

  return res.json({
    lists: lists.map((l) => ({
      ...l,
      total_variance: Math.round((Number(l.total_actual) - Number(l.total_estimated)) * 100) / 100,
    })),
    event_summary: {
      total_estimated: Math.round(totalEstimated * 100) / 100,
      total_actual: Math.round(totalActual * 100) / 100,
      total_variance: Math.round((totalActual - totalEstimated) * 100) / 100,
    },
  });
}
