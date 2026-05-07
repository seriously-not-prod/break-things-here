/**
 * Store Suggestions Controller (#464)
 * Allows users to suggest stores for shopping/procurement workflows.
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
  const { name, website, notes, category } = req.body as {
    name?: string;
    website?: string;
    notes?: string;
    category?: string;
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
    `INSERT INTO store_suggestions (event_id, name, website, notes, category, suggested_by)
     VALUES (?, ?, ?, ?, ?, ?) RETURNING id`,
    [
      eventId,
      name.trim(),
      website?.trim() ?? null,
      notes?.trim() ?? null,
      category?.trim() ?? null,
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
