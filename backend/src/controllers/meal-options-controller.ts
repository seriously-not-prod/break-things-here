/**
 * Per-event meal options catalog (#591).
 *
 * Owners/organizers maintain a small list of meal choices a guest can pick
 * from during the public RSVP flow. The list is kept simple — name +
 * optional description + active flag — and is read on the public RSVP
 * context endpoint so anonymous guests can see live choices without an
 * authenticated round-trip.
 */
import type { Request, Response } from 'express';
import { getDatabase } from '../db/database.js';
import { requireEventAccess } from '../utils/event-access.js';

interface AuthRequest extends Request {
  user?: { id: number; email: string; role_id: number };
}

interface MealOptionRow {
  id: number;
  event_id: number;
  name: string;
  description: string | null;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export async function listMealOptionsForEvent(eventId: number | string, activeOnly = false): Promise<MealOptionRow[]> {
  const db = getDatabase();
  const rows = await db.all<MealOptionRow>(
    `SELECT id, event_id, name, description, is_active, sort_order, created_at, updated_at
     FROM event_meal_options
     WHERE event_id = $1${activeOnly ? ' AND is_active = TRUE' : ''}
     ORDER BY sort_order ASC, name ASC`,
    [eventId],
  );
  return rows;
}

/** GET /api/events/:eventId/meal-options */
export async function listMealOptions(req: Request, res: Response): Promise<Response> {
  const authReq = req as AuthRequest;
  const { eventId } = req.params;
  const event = await requireEventAccess(authReq, res, eventId, { allowMembers: true });
  if (!event) return res as Response;
  const options = await listMealOptionsForEvent(eventId);
  return res.json({ options });
}

/** POST /api/events/:eventId/meal-options */
export async function createMealOption(req: Request, res: Response): Promise<Response> {
  const authReq = req as AuthRequest;
  const { eventId } = req.params;
  const event = await requireEventAccess(authReq, res, eventId, { ownerOnly: true });
  if (!event) return res as Response;
  const { name, description, is_active, sort_order } = (req.body ?? {}) as {
    name?: string; description?: string; is_active?: boolean; sort_order?: number;
  };
  if (!name?.trim()) return res.status(400).json({ error: 'Meal name is required.' });
  const db = getDatabase();
  try {
    const result = await db.run(
      `INSERT INTO event_meal_options (event_id, name, description, is_active, sort_order)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [eventId, name.trim(), description?.trim() || null, is_active !== false, Number.isFinite(sort_order) ? Number(sort_order) : 0],
    );
    const row = await db.get<MealOptionRow>(
      'SELECT * FROM event_meal_options WHERE id = $1',
      [result.lastID],
    );
    return res.status(201).json({ option: row });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Insert failed';
    if (/unique|duplicate/i.test(message)) {
      return res.status(409).json({ error: 'A meal option with that name already exists.' });
    }
    return res.status(500).json({ error: 'Failed to create meal option.' });
  }
}

/** PATCH /api/events/:eventId/meal-options/:id */
export async function updateMealOption(req: Request, res: Response): Promise<Response> {
  const authReq = req as AuthRequest;
  const { eventId, id } = req.params;
  const event = await requireEventAccess(authReq, res, eventId, { ownerOnly: true });
  if (!event) return res as Response;
  const { name, description, is_active, sort_order } = (req.body ?? {}) as Record<string, unknown>;
  const fields: string[] = [];
  const params: (string | number | boolean | null)[] = [];
  if (typeof name === 'string') { fields.push('name = ?'); params.push(name.trim()); }
  if (description !== undefined) { fields.push('description = ?'); params.push(description ? String(description).trim() : null); }
  if (is_active !== undefined) { fields.push('is_active = ?'); params.push(Boolean(is_active)); }
  if (sort_order !== undefined) { fields.push('sort_order = $1'); params.push(Number(sort_order)); }
  if (fields.length === 0) return res.status(400).json({ error: 'No fields to update.' });
  fields.push('updated_at = CURRENT_TIMESTAMP');
  params.push(id, eventId);
  const db = getDatabase();
  await db.run(
    `UPDATE event_meal_options SET ${fields.join(', ')} WHERE id = $1 AND event_id = $2`,
    params,
  );
  const row = await db.get<MealOptionRow>(
    'SELECT * FROM event_meal_options WHERE id = $1 AND event_id = $2',
    [id, eventId],
  );
  if (!row) return res.status(404).json({ error: 'Meal option not found.' });
  return res.json({ option: row });
}

/** DELETE /api/events/:eventId/meal-options/:id */
export async function deleteMealOption(req: Request, res: Response): Promise<Response> {
  const authReq = req as AuthRequest;
  const { eventId, id } = req.params;
  const event = await requireEventAccess(authReq, res, eventId, { ownerOnly: true });
  if (!event) return res as Response;
  const db = getDatabase();
  const result = await db.run(
    'DELETE FROM event_meal_options WHERE id = $1 AND event_id = $2',
    [id, eventId],
  );
  if (!result.changes) {
    return res.status(404).json({ error: 'Meal option not found.' });
  }
  return res.json({ deleted: true });
}
