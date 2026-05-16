/**
 * Event filter presets controller — story #416, task #454
 *
 * Endpoints (all require authentication):
 *   GET    /api/event-filter-presets         — list current user's presets
 *   POST   /api/event-filter-presets         — create a preset { name, filters }
 *   PUT    /api/event-filter-presets/:id     — rename / replace filters
 *   DELETE /api/event-filter-presets/:id     — delete a preset
 *
 * Presets are scoped to the authenticated user. `filters` is stored as a JSON
 * string so additional filter dimensions can be added without schema changes.
 */

import { Request, Response } from 'express';
import { getDatabase } from '../db/database.js';

interface AuthRequest extends Request {
  user?: { id: number; email: string; role_id: number };
}

export interface FilterPresetRow {
  id: number;
  name: string;
  filters: string;
  user_id: number;
  created_at: string;
  updated_at: string;
}

interface FilterPresetView {
  id: number;
  name: string;
  filters: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

function parseFiltersField(filters: unknown): string {
  if (filters === null || filters === undefined) {
    throw new Error('filters is required');
  }
  if (typeof filters === 'string') {
    try {
      JSON.parse(filters);
    } catch {
      throw new Error('filters must be valid JSON');
    }
    if (filters.length > 8000) throw new Error('filters payload too large');
    return filters;
  }
  if (typeof filters === 'object') {
    const serialized = JSON.stringify(filters);
    if (serialized.length > 8000) throw new Error('filters payload too large');
    return serialized;
  }
  throw new Error('filters must be a JSON object');
}

function toView(row: FilterPresetRow): FilterPresetView {
  let parsed: Record<string, unknown> = {};
  try {
    parsed = JSON.parse(row.filters) as Record<string, unknown>;
  } catch {
    parsed = {};
  }
  return {
    id: row.id,
    name: row.name,
    filters: parsed,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

/** GET /api/event-filter-presets */
export async function listPresets(req: Request, res: Response): Promise<void> {
  try {
    const user = (req as AuthRequest).user;
    if (!user) {
      res.status(401).json({ error: 'User not authenticated' });
      return;
    }
    const db = getDatabase();
    const rows = await db.all<FilterPresetRow>(
      `SELECT * FROM event_filter_presets WHERE user_id = ? ORDER BY updated_at DESC`,
      [user.id],
    );
    res.json({ presets: rows.map(toView) });
  } catch (error) {
    console.error('Error listing filter presets:', error);
    res.status(500).json({ error: 'Failed to list filter presets' });
  }
}

/** POST /api/event-filter-presets */
export async function createPreset(req: Request, res: Response): Promise<void> {
  try {
    const user = (req as AuthRequest).user;
    if (!user) {
      res.status(401).json({ error: 'User not authenticated' });
      return;
    }
    const body = (req.body ?? {}) as { name?: string; filters?: unknown };
    const name = body.name?.trim();
    if (!name) {
      res.status(400).json({ error: 'name is required' });
      return;
    }
    if (name.length > 120) {
      res.status(400).json({ error: 'name must be 120 characters or fewer' });
      return;
    }

    let filtersText: string;
    try {
      filtersText = parseFiltersField(body.filters);
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'invalid filters' });
      return;
    }

    const db = getDatabase();
    // Enforce per-user uniqueness (same as DB unique index)
    const dup = await db.get<FilterPresetRow>(
      'SELECT id FROM event_filter_presets WHERE user_id = $1 AND name = $2',
      [user.id, name],
    );
    if (dup) {
      res.status(409).json({ error: 'A preset with that name already exists' });
      return;
    }

    const result = await db.run(
      `INSERT INTO event_filter_presets (name, filters, user_id)
       VALUES ($1, $2, $3)
       RETURNING id`,
      [name, filtersText, user.id],
    );
    const created = await db.get<FilterPresetRow>(
      'SELECT * FROM event_filter_presets WHERE id = $1',
      [result.lastID],
    );
    if (!created) {
      res.status(500).json({ error: 'Failed to create preset' });
      return;
    }
    res.status(201).json(toView(created));
  } catch (error) {
    console.error('Error creating filter preset:', error);
    res.status(500).json({ error: 'Failed to create preset' });
  }
}

/** PUT /api/event-filter-presets/:id */
export async function updatePreset(req: Request, res: Response): Promise<void> {
  try {
    const user = (req as AuthRequest).user;
    if (!user) {
      res.status(401).json({ error: 'User not authenticated' });
      return;
    }
    const db = getDatabase();
    const existing = await db.get<FilterPresetRow>(
      'SELECT * FROM event_filter_presets WHERE id = $1',
      [req.params['id']],
    );
    if (!existing) {
      res.status(404).json({ error: 'Preset not found' });
      return;
    }
    if (Number(existing.user_id) !== Number(user.id)) {
      res.status(403).json({ error: 'Not authorised to edit this preset.' });
      return;
    }

    const body = (req.body ?? {}) as { name?: string; filters?: unknown };
    const name = body.name?.trim() || existing.name;
    if (name.length > 120) {
      res.status(400).json({ error: 'name must be 120 characters or fewer' });
      return;
    }

    let filtersText = existing.filters;
    if (body.filters !== undefined) {
      try {
        filtersText = parseFiltersField(body.filters);
      } catch (err) {
        res.status(400).json({ error: err instanceof Error ? err.message : 'invalid filters' });
        return;
      }
    }

    if (name !== existing.name) {
      const dup = await db.get<FilterPresetRow>(
        'SELECT id FROM event_filter_presets WHERE user_id = $1 AND name = $2 AND id <> $3',
        [user.id, name, existing.id],
      );
      if (dup) {
        res.status(409).json({ error: 'A preset with that name already exists' });
        return;
      }
    }

    await db.run(
      `UPDATE event_filter_presets
          SET name = $1, filters = $2, updated_at = CURRENT_TIMESTAMP
        WHERE id = $3`,
      [name, filtersText, existing.id],
    );
    const updated = await db.get<FilterPresetRow>(
      'SELECT * FROM event_filter_presets WHERE id = $1',
      [existing.id],
    );
    res.json(updated ? toView(updated) : null);
  } catch (error) {
    console.error('Error updating filter preset:', error);
    res.status(500).json({ error: 'Failed to update preset' });
  }
}

/** DELETE /api/event-filter-presets/:id */
export async function deletePreset(req: Request, res: Response): Promise<void> {
  try {
    const user = (req as AuthRequest).user;
    if (!user) {
      res.status(401).json({ error: 'User not authenticated' });
      return;
    }
    const db = getDatabase();
    const existing = await db.get<FilterPresetRow>(
      'SELECT * FROM event_filter_presets WHERE id = $1',
      [req.params['id']],
    );
    if (!existing) {
      res.status(404).json({ error: 'Preset not found' });
      return;
    }
    if (Number(existing.user_id) !== Number(user.id)) {
      res.status(403).json({ error: 'Not authorised to delete this preset.' });
      return;
    }
    await db.run('DELETE FROM event_filter_presets WHERE id = $1', [existing.id]);
    res.json({ message: 'Preset deleted' });
  } catch (error) {
    console.error('Error deleting filter preset:', error);
    res.status(500).json({ error: 'Failed to delete preset' });
  }
}
