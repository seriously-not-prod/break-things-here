/**
 * Event Templates Controller — story #410, task #432
 *
 * Reusable seed data for new events. Owners see their own templates; admins
 * (role_id = 3) see all. Mutations require role_id >= 2 (Organizer or Admin).
 */

import { Request, Response } from 'express';
import { getDatabase } from '../db/database.js';

interface AuthRequest extends Request {
  user?: { id: number; email: string; role_id: number };
}

export interface EventTemplateRow {
  id: number;
  name: string;
  description: string | null;
  default_title: string | null;
  default_location: string | null;
  default_capacity: number | null;
  default_event_type: string | null;
  default_status: 'Draft' | 'Active' | 'Completed' | null;
  default_tags: string | null;
  default_is_public: boolean;
  default_waitlist_enabled: boolean;
  created_by: number;
  created_at: string;
  updated_at: string;
}

const VALID_STATUSES = ['Draft', 'Active', 'Completed', 'Cancelled'] as const;

function canMutate(user?: AuthRequest['user']): boolean {
  return !!user && user.role_id >= 2;
}

/** GET /api/event-templates — owner sees own; admin sees all */
export async function listTemplates(req: Request, res: Response): Promise<void> {
  try {
    const authReq = req as AuthRequest;
    const user = authReq.user;
    if (!user) {
      res.status(401).json({ error: 'User not authenticated' });
      return;
    }
    const db = getDatabase();
    const rows =
      user.role_id === 3
        ? await db.all<EventTemplateRow>(
            `SELECT * FROM event_templates WHERE deleted_at IS NULL ORDER BY updated_at DESC`,
          )
        : await db.all<EventTemplateRow>(
            `SELECT * FROM event_templates
             WHERE deleted_at IS NULL AND created_by = ?
             ORDER BY updated_at DESC`,
            [user.id],
          );
    res.json({ templates: rows });
  } catch (error) {
    console.error('Error listing event templates:', error);
    res.status(500).json({ error: 'Failed to fetch templates' });
  }
}

/** GET /api/event-templates/:id */
export async function getTemplate(req: Request, res: Response): Promise<void> {
  try {
    const authReq = req as AuthRequest;
    const user = authReq.user;
    if (!user) {
      res.status(401).json({ error: 'User not authenticated' });
      return;
    }
    const db = getDatabase();
    const row = await db.get<EventTemplateRow>(
      'SELECT * FROM event_templates WHERE id = ? AND deleted_at IS NULL',
      [req.params['id']],
    );
    if (!row) {
      res.status(404).json({ error: 'Template not found' });
      return;
    }
    if (user.role_id !== 3 && row.created_by !== user.id) {
      res.status(403).json({ error: 'Not authorised to view this template.' });
      return;
    }
    res.json(row);
  } catch (error) {
    console.error('Error fetching template:', error);
    res.status(500).json({ error: 'Failed to fetch template' });
  }
}

/** POST /api/event-templates */
export async function createTemplate(req: Request, res: Response): Promise<void> {
  try {
    const authReq = req as AuthRequest;
    const user = authReq.user;
    if (!user) {
      res.status(401).json({ error: 'User not authenticated' });
      return;
    }
    if (!canMutate(user)) {
      res.status(403).json({ error: 'Not authorised to manage templates.' });
      return;
    }

    const body = (req.body ?? {}) as Partial<EventTemplateRow>;
    if (!body.name || !String(body.name).trim()) {
      res.status(400).json({ error: 'Template name is required' });
      return;
    }
    if (body.default_status && !VALID_STATUSES.includes(body.default_status as typeof VALID_STATUSES[number])) {
      res.status(400).json({ error: 'Invalid default_status. Must be Draft, Active or Completed' });
      return;
    }

    const db = getDatabase();
    const result = await db.run(
      `INSERT INTO event_templates
         (name, description, default_title, default_location, default_capacity,
          default_event_type, default_status, default_tags, default_is_public,
          default_waitlist_enabled, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       RETURNING id`,
      [
        String(body.name).trim(),
        body.description ?? null,
        body.default_title ?? null,
        body.default_location ?? null,
        body.default_capacity ?? null,
        body.default_event_type ?? null,
        body.default_status ?? 'Draft',
        body.default_tags ?? null,
        body.default_is_public ?? false,
        body.default_waitlist_enabled ?? false,
        user.id,
      ],
    );
    const created = await db.get<EventTemplateRow>(
      'SELECT * FROM event_templates WHERE id = ?',
      [result.lastID],
    );
    res.status(201).json(created);
  } catch (error) {
    console.error('Error creating template:', error);
    res.status(500).json({ error: 'Failed to create template' });
  }
}

/** PATCH /api/event-templates/:id */
export async function updateTemplate(req: Request, res: Response): Promise<void> {
  try {
    const authReq = req as AuthRequest;
    const user = authReq.user;
    if (!user) {
      res.status(401).json({ error: 'User not authenticated' });
      return;
    }
    if (!canMutate(user)) {
      res.status(403).json({ error: 'Not authorised to manage templates.' });
      return;
    }
    const db = getDatabase();
    const existing = await db.get<EventTemplateRow>(
      'SELECT * FROM event_templates WHERE id = ? AND deleted_at IS NULL',
      [req.params['id']],
    );
    if (!existing) {
      res.status(404).json({ error: 'Template not found' });
      return;
    }
    if (user.role_id !== 3 && existing.created_by !== user.id) {
      res.status(403).json({ error: 'Not authorised to edit this template.' });
      return;
    }

    const body = (req.body ?? {}) as Partial<EventTemplateRow>;
    if (body.default_status && !VALID_STATUSES.includes(body.default_status as typeof VALID_STATUSES[number])) {
      res.status(400).json({ error: 'Invalid default_status. Must be Draft, Active or Completed' });
      return;
    }

    await db.run(
      `UPDATE event_templates SET
         name = ?,
         description = ?,
         default_title = ?,
         default_location = ?,
         default_capacity = ?,
         default_event_type = ?,
         default_status = ?,
         default_tags = ?,
         default_is_public = ?,
         default_waitlist_enabled = ?,
         updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [
        body.name ?? existing.name,
        body.description !== undefined ? body.description : existing.description,
        body.default_title !== undefined ? body.default_title : existing.default_title,
        body.default_location !== undefined ? body.default_location : existing.default_location,
        body.default_capacity !== undefined ? body.default_capacity : existing.default_capacity,
        body.default_event_type !== undefined ? body.default_event_type : existing.default_event_type,
        body.default_status ?? existing.default_status,
        body.default_tags !== undefined ? body.default_tags : existing.default_tags,
        body.default_is_public !== undefined ? body.default_is_public : existing.default_is_public,
        body.default_waitlist_enabled !== undefined
          ? body.default_waitlist_enabled
          : existing.default_waitlist_enabled,
        req.params['id'],
      ],
    );
    const updated = await db.get<EventTemplateRow>(
      'SELECT * FROM event_templates WHERE id = ?',
      [req.params['id']],
    );
    res.json(updated);
  } catch (error) {
    console.error('Error updating template:', error);
    res.status(500).json({ error: 'Failed to update template' });
  }
}

/** DELETE /api/event-templates/:id (soft delete) */
export async function deleteTemplate(req: Request, res: Response): Promise<void> {
  try {
    const authReq = req as AuthRequest;
    const user = authReq.user;
    if (!user) {
      res.status(401).json({ error: 'User not authenticated' });
      return;
    }
    if (!canMutate(user)) {
      res.status(403).json({ error: 'Not authorised to manage templates.' });
      return;
    }
    const db = getDatabase();
    const existing = await db.get<EventTemplateRow>(
      'SELECT * FROM event_templates WHERE id = ? AND deleted_at IS NULL',
      [req.params['id']],
    );
    if (!existing) {
      res.status(404).json({ error: 'Template not found' });
      return;
    }
    if (user.role_id !== 3 && existing.created_by !== user.id) {
      res.status(403).json({ error: 'Not authorised to delete this template.' });
      return;
    }
    await db.run(
      'UPDATE event_templates SET deleted_at = CURRENT_TIMESTAMP WHERE id = ?',
      [req.params['id']],
    );
    res.json({ message: 'Template deleted' });
  } catch (error) {
    console.error('Error deleting template:', error);
    res.status(500).json({ error: 'Failed to delete template' });
  }
}

/**
 * POST /api/event-templates/:id/apply — task #432
 * Creates a new event from a template; overrides are allowed via request body.
 * Required: { date: 'YYYY-MM-DD', title?: string }
 */
export async function applyTemplate(req: Request, res: Response): Promise<void> {
  try {
    const authReq = req as AuthRequest;
    const user = authReq.user;
    if (!user) {
      res.status(401).json({ error: 'User not authenticated' });
      return;
    }
    if (!canMutate(user)) {
      res.status(403).json({ error: 'Not authorised to create events from templates.' });
      return;
    }
    const db = getDatabase();
    const template = await db.get<EventTemplateRow>(
      'SELECT * FROM event_templates WHERE id = ? AND deleted_at IS NULL',
      [req.params['id']],
    );
    if (!template) {
      res.status(404).json({ error: 'Template not found' });
      return;
    }
    if (user.role_id !== 3 && template.created_by !== user.id) {
      res.status(403).json({ error: 'Not authorised to use this template.' });
      return;
    }

    const overrides = (req.body ?? {}) as {
      title?: string;
      date?: string;
      location?: string;
      capacity?: number | null;
      status?: string;
      event_type?: string | null;
      tags?: string | null;
      is_public?: boolean;
      waitlist_enabled?: boolean;
      description?: string | null;
    };
    const date = overrides.date;
    if (!date) {
      res.status(400).json({ error: 'date is required to apply a template' });
      return;
    }
    const title = overrides.title?.trim() || template.default_title?.trim() || template.name;
    const location = overrides.location ?? template.default_location ?? '';
    if (!title) {
      res.status(400).json({ error: 'title is required (template has no default_title)' });
      return;
    }
    if (!location) {
      res.status(400).json({ error: 'location is required (template has no default_location)' });
      return;
    }
    const status = overrides.status ?? template.default_status ?? 'Draft';
    if (!VALID_STATUSES.includes(status as typeof VALID_STATUSES[number])) {
      res.status(400).json({ error: 'Invalid status. Must be Draft, Active or Completed' });
      return;
    }

    const result = await db.run(
      `INSERT INTO events (title, date, location, description, capacity, status,
                           event_type, is_public, tags, waitlist_enabled, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       RETURNING id`,
      [
        title,
        date,
        location,
        overrides.description ?? null,
        overrides.capacity ?? template.default_capacity ?? null,
        status,
        overrides.event_type ?? template.default_event_type ?? 'Other',
        overrides.is_public ?? template.default_is_public ?? false,
        overrides.tags ?? template.default_tags ?? null,
        overrides.waitlist_enabled ?? template.default_waitlist_enabled ?? false,
        user.id,
      ],
    );
    const created = await db.get(
      'SELECT *, date AS event_date FROM events WHERE id = ?',
      [result.lastID],
    );
    await db.run(
      'INSERT INTO audit_log (user_id, email, action, description, ip_address) VALUES (?, ?, ?, ?, ?)',
      [
        user.id,
        user.email ?? null,
        'event.template.applied',
        `Applied template #${template.id} (${template.name}) to new event #${result.lastID}`,
        authReq.ip ?? null,
      ],
    );
    res.status(201).json(created);
  } catch (error) {
    console.error('Error applying template:', error);
    res.status(500).json({ error: 'Failed to apply template' });
  }
}
