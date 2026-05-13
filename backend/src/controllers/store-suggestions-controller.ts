/**
 * Store Suggestions Controller (#464, #607)
 * Allows users to suggest stores for shopping/procurement workflows.
 * #607: Extends with suggestion engine — location-aware ranking and smart recommendations.
 */

import { Request, Response } from 'express';
import { getDatabase } from '../db/database.js';
import { requireEventAccess } from '../utils/event-access.js';

interface AuthRequest extends Request {
  user?: { id: number; email: string; role_id: number };
}

interface StoreSuggestion {
  id: number;
  event_id: number;
  name: string;
  website: string | null;
  notes: string | null;
  category: string | null;
  location: string | null;
  latitude: number | null;
  longitude: number | null;
  usage_count: number;
  last_used_at: string | null;
  suggested_by: number | null;
  status: 'pending' | 'approved' | 'rejected';
  created_at: string;
  updated_at: string;
}

// ─── List Suggestions ─────────────────────────────────────────────────────────

/** GET /api/events/:eventId/store-suggestions */
export async function listStoreSuggestions(req: Request, res: Response): Promise<Response> {
  const authReq = req as AuthRequest;
  if (!authReq.user) return res.status(401).json({ error: 'Authentication required.' });

  const { eventId } = req.params;
  const { status } = req.query as { status?: string };

  const event = await requireEventAccess(authReq, res, eventId, { allowMembers: true });
  if (!event) return res as Response;

  const db = getDatabase();

  const validStatuses = ['pending', 'approved', 'rejected'];
  const statusFilter = status && validStatuses.includes(status) ? status : null;

  const suggestions = await db.all<StoreSuggestion & { suggester_name: string | null }>(
    `SELECT ss.*, u.display_name AS suggester_name
     FROM store_suggestions ss
     LEFT JOIN users u ON u.id = ss.suggested_by
     WHERE ss.event_id = ?
       ${statusFilter ? 'AND ss.status = ?' : ''}
     ORDER BY ss.created_at DESC`,
    statusFilter ? [eventId, statusFilter] : [eventId],
  );

  return res.json({ suggestions });
}

// ─── Create Suggestion ────────────────────────────────────────────────────────

/** POST /api/events/:eventId/store-suggestions */
export async function createStoreSuggestion(req: Request, res: Response): Promise<Response> {
  const authReq = req as AuthRequest;
  if (!authReq.user) return res.status(401).json({ error: 'Authentication required.' });

  const { eventId } = req.params;
  const { name, website, notes, category, location } = req.body as {
    name?: string;
    website?: string;
    notes?: string;
    category?: string;
    location?: string;
  };

  if (!name?.trim()) return res.status(400).json({ error: 'Store name is required.' });

  // Basic URL validation when provided
  if (website?.trim()) {
    try {
      new URL(website.trim());
    } catch {
      return res.status(400).json({ error: 'website must be a valid URL.' });
    }
  }

  const event = await requireEventAccess(authReq, res, eventId, { allowMembers: true });
  if (!event) return res as Response;

  const db = getDatabase();

  // Duplicate check (case-insensitive name within the same event)
  const duplicate = await db.get<{ id: number }>(
    `SELECT id FROM store_suggestions WHERE event_id = ? AND lower(name) = lower(?)`,
    [eventId, name.trim()],
  );
  if (duplicate) {
    return res.status(409).json({ error: 'A store suggestion with this name already exists for this event.' });
  }

  const result = await db.run(
    `INSERT INTO store_suggestions (event_id, name, website, notes, category, location, suggested_by)
     VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING id`,
    [
      eventId,
      name.trim(),
      website?.trim() ?? null,
      notes?.trim() ?? null,
      category?.trim() ?? null,
      location?.trim() ?? null,
      authReq.user.id,
    ],
  );

  const suggestion = await db.get<StoreSuggestion & { suggester_name: string | null }>(
    `SELECT ss.*, u.display_name AS suggester_name
     FROM store_suggestions ss
     LEFT JOIN users u ON u.id = ss.suggested_by
     WHERE ss.id = ?`,
    [result.lastID],
  );

  return res.status(201).json({ suggestion });
}

// ─── Update Suggestion Status ─────────────────────────────────────────────────

/** PATCH /api/events/:eventId/store-suggestions/:id */
export async function updateStoreSuggestionStatus(req: Request, res: Response): Promise<Response> {
  const authReq = req as AuthRequest;
  if (!authReq.user) return res.status(401).json({ error: 'Authentication required.' });

  const { eventId, id } = req.params;
  const { status } = req.body as { status?: string };

  const validStatuses = ['pending', 'approved', 'rejected'];
  if (!status || !validStatuses.includes(status)) {
    return res.status(400).json({ error: `status must be one of: ${validStatuses.join(', ')}.` });
  }

  // Only event owners/organisers can approve or reject
  const event = await requireEventAccess(authReq, res, eventId, { allowMembers: false });
  if (!event) return res as Response;

  const db = getDatabase();

  const suggestion = await db.get<{ id: number }>(
    `SELECT id FROM store_suggestions WHERE id = ? AND event_id = ?`,
    [id, eventId],
  );
  if (!suggestion) return res.status(404).json({ error: 'Store suggestion not found.' });

  await db.run(
    `UPDATE store_suggestions SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
    [status, id],
  );

  const updated = await db.get<StoreSuggestion>(
    `SELECT * FROM store_suggestions WHERE id = ?`,
    [id],
  );
  return res.json({ suggestion: updated });
}

// ─── Delete Suggestion ────────────────────────────────────────────────────────

/** DELETE /api/events/:eventId/store-suggestions/:id */
export async function deleteStoreSuggestion(req: Request, res: Response): Promise<Response> {
  const authReq = req as AuthRequest;
  if (!authReq.user) return res.status(401).json({ error: 'Authentication required.' });

  const { eventId, id } = req.params;
  const event = await requireEventAccess(authReq, res, eventId, { allowMembers: true });
  if (!event) return res as Response;

  const db = getDatabase();
  const suggestion = await db.get<StoreSuggestion>(
    `SELECT * FROM store_suggestions WHERE id = ? AND event_id = ?`,
    [id, eventId],
  );
  if (!suggestion) return res.status(404).json({ error: 'Store suggestion not found.' });

  // Only the suggester or event owner can delete
  if (suggestion.suggested_by !== authReq.user.id) {
    // Try owner access
    const ownerCheck = await requireEventAccess(authReq, res, eventId, { allowMembers: false });
    if (!ownerCheck) return res as Response;
  }

  await db.run(`DELETE FROM store_suggestions WHERE id = ?`, [id]);
  return res.json({ message: 'Store suggestion deleted.' });
}

// ─── Suggestion Engine — Recommendations (#607) ───────────────────────────────

/**
 * GET /api/events/:eventId/store-suggestions/recommendations
 * Returns ranked store suggestions for the event.
 * Query params:
 *   - category (optional): filter by category
 *   - query (optional): text search against name/notes/location
 *   - limit (optional, default 10, max 50)
 *
 * Ranking: approved first, then by usage_count DESC, then by recency.
 */
export async function getStoreSuggestionRecommendations(req: Request, res: Response): Promise<Response> {
  const authReq = req as AuthRequest;
  if (!authReq.user) return res.status(401).json({ error: 'Authentication required.' });

  const { eventId } = req.params;
  const { category, query, limit } = req.query as { category?: string; query?: string; limit?: string };

  const event = await requireEventAccess(authReq, res, eventId, { allowMembers: true });
  if (!event) return res as Response;

  const db = getDatabase();

  const parsedLimit = Math.min(Math.max(parseInt(limit ?? '10', 10) || 10, 1), 50);

  const conditions: string[] = ['ss.event_id = ?'];
  const params: (string | number)[] = [eventId];

  if (category?.trim()) {
    conditions.push('lower(ss.category) = lower(?)');
    params.push(category.trim());
  }

  if (query?.trim()) {
    conditions.push(`(
      lower(ss.name)     LIKE lower(?) OR
      lower(ss.notes)    LIKE lower(?) OR
      lower(ss.location) LIKE lower(?)
    )`);
    const like = `%${query.trim()}%`;
    params.push(like, like, like);
  }

  const whereClause = conditions.join(' AND ');

  const suggestions = await db.all<StoreSuggestion & { suggester_name: string | null; rank_score: number }>(
    `SELECT
       ss.*,
       u.display_name AS suggester_name,
       (
         CASE ss.status
           WHEN 'approved' THEN 3
           WHEN 'pending'  THEN 1
           ELSE 0
         END
         + COALESCE(ss.usage_count, 0)
       ) AS rank_score
     FROM store_suggestions ss
     LEFT JOIN users u ON u.id = ss.suggested_by
     WHERE ${whereClause}
       AND ss.status != 'rejected'
     ORDER BY rank_score DESC, ss.created_at DESC
     LIMIT ?`,
    [...params, parsedLimit],
  );

  return res.json({ recommendations: suggestions });
}

/**
 * POST /api/events/:eventId/store-suggestions/:id/select
 * Records a "selection" event for a suggestion — increments usage_count and sets last_used_at.
 * Called when a user picks a store suggestion to attach to a shopping item or action.
 */
export async function selectStoreSuggestion(req: Request, res: Response): Promise<Response> {
  const authReq = req as AuthRequest;
  if (!authReq.user) return res.status(401).json({ error: 'Authentication required.' });

  const { eventId, id } = req.params;
  const event = await requireEventAccess(authReq, res, eventId, { allowMembers: true });
  if (!event) return res as Response;

  const db = getDatabase();

  const suggestion = await db.get<{ id: number; status: string }>(
    `SELECT id, status FROM store_suggestions WHERE id = ? AND event_id = ?`,
    [id, eventId],
  );
  if (!suggestion) return res.status(404).json({ error: 'Store suggestion not found.' });

  if (suggestion.status === 'rejected') {
    return res.status(409).json({ error: 'Cannot select a rejected store suggestion.' });
  }

  await db.run(
    `UPDATE store_suggestions
        SET usage_count  = COALESCE(usage_count, 0) + 1,
            last_used_at = CURRENT_TIMESTAMP,
            updated_at   = CURRENT_TIMESTAMP
      WHERE id = ?`,
    [id],
  );

  const updated = await db.get<StoreSuggestion>(
    `SELECT * FROM store_suggestions WHERE id = ?`,
    [id],
  );
  return res.json({ suggestion: updated });
}

/**
 * GET /api/events/:eventId/store-suggestions/categories
 * Returns distinct categories used across all suggestions for the event.
 * Useful for populating filter dropdowns in the UI.
 */
export async function listStoreSuggestionCategories(req: Request, res: Response): Promise<Response> {
  const authReq = req as AuthRequest;
  if (!authReq.user) return res.status(401).json({ error: 'Authentication required.' });

  const { eventId } = req.params;
  const event = await requireEventAccess(authReq, res, eventId, { allowMembers: true });
  if (!event) return res as Response;

  const db = getDatabase();

  const rows = await db.all<{ category: string; count: number }>(
    `SELECT category, COUNT(*)::int AS count
       FROM store_suggestions
      WHERE event_id = ? AND category IS NOT NULL AND status != 'rejected'
      GROUP BY category
      ORDER BY count DESC, category ASC`,
    [eventId],
  );

  return res.json({ categories: rows });
}
