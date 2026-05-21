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

const VALID_STATUSES = [
  'Draft',
  'Planning',
  'Confirmed',
  'Active',
  'Completed',
  'Cancelled',
] as const;
const VALID_TEMPLATE_SECTIONS = [
  'tasks',
  'budget',
  'timeline',
  'custom_fields',
  'vendors',
  'shopping',
  'rsvp_questions',
] as const;

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
      'SELECT * FROM event_templates WHERE id = $1 AND deleted_at IS NULL',
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
    if (
      body.default_status &&
      !VALID_STATUSES.includes(body.default_status as (typeof VALID_STATUSES)[number])
    ) {
      res.status(400).json({ error: 'Invalid default_status. Must be Draft, Active or Completed' });
      return;
    }

    const db = getDatabase();
    const result = await db.run(
      `INSERT INTO event_templates
         (name, description, default_title, default_location, default_capacity,
          default_event_type, default_status, default_tags, default_is_public,
          default_waitlist_enabled, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
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
    const created = await db.get<EventTemplateRow>('SELECT * FROM event_templates WHERE id = $1', [
      result.lastID,
    ]);
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
      'SELECT * FROM event_templates WHERE id = $1 AND deleted_at IS NULL',
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
    if (
      body.default_status &&
      !VALID_STATUSES.includes(body.default_status as (typeof VALID_STATUSES)[number])
    ) {
      res.status(400).json({ error: 'Invalid default_status. Must be Draft, Active or Completed' });
      return;
    }

    await db.run(
      `UPDATE event_templates SET
         name = $1,
         description = $2,
         default_title = $3,
         default_location = $4,
         default_capacity = $5,
         default_event_type = $6,
         default_status = $7,
         default_tags = $8,
         default_is_public = $9,
         default_waitlist_enabled = $10,
         updated_at = CURRENT_TIMESTAMP
       WHERE id = $11`,
      [
        body.name ?? existing.name,
        body.description !== undefined ? body.description : existing.description,
        body.default_title !== undefined ? body.default_title : existing.default_title,
        body.default_location !== undefined ? body.default_location : existing.default_location,
        body.default_capacity !== undefined ? body.default_capacity : existing.default_capacity,
        body.default_event_type !== undefined
          ? body.default_event_type
          : existing.default_event_type,
        body.default_status ?? existing.default_status,
        body.default_tags !== undefined ? body.default_tags : existing.default_tags,
        body.default_is_public !== undefined ? body.default_is_public : existing.default_is_public,
        body.default_waitlist_enabled !== undefined
          ? body.default_waitlist_enabled
          : existing.default_waitlist_enabled,
        req.params['id'],
      ],
    );
    const updated = await db.get<EventTemplateRow>('SELECT * FROM event_templates WHERE id = $1', [
      req.params['id'],
    ]);
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
      'SELECT * FROM event_templates WHERE id = $1 AND deleted_at IS NULL',
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
    await db.run('UPDATE event_templates SET deleted_at = CURRENT_TIMESTAMP WHERE id = $1', [
      req.params['id'],
    ]);
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
      'SELECT * FROM event_templates WHERE id = $1 AND deleted_at IS NULL',
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
    if (!VALID_STATUSES.includes(status as (typeof VALID_STATUSES)[number])) {
      res.status(400).json({
        error: `Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}`,
      });
      return;
    }

    const result = await db.run(
      `INSERT INTO events (title, date, location, description, capacity, status,
                           event_type, is_public, tags, waitlist_enabled, created_by, updated_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
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
        user.id,
      ],
    );

    // Template depth (#579) — replay section payloads into the new event.
    await applyTemplateSections(db, Number(template.id), Number(result.lastID), user.id);

    const created = await db.get('SELECT *, date AS event_date FROM events WHERE id = $1', [
      result.lastID,
    ]);
    await db.run(
      'INSERT INTO audit_log (user_id, email, action, description, ip_address) VALUES ($1, $2, $3, $4, $5)',
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

// ─── Template section depth (#579) ────────────────────────────────────────────

interface TemplateSectionRow {
  id: number;
  template_id: number;
  section_key: string;
  payload: unknown;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

/** GET /api/event-templates/:id/sections — depth payload */
export async function listTemplateSections(req: Request, res: Response): Promise<void> {
  try {
    const authReq = req as AuthRequest;
    const user = authReq.user;
    if (!user) {
      res.status(401).json({ error: 'User not authenticated' });
      return;
    }
    const db = getDatabase();
    const template = await db.get<EventTemplateRow>(
      'SELECT id, created_by FROM event_templates WHERE id = $1 AND deleted_at IS NULL',
      [req.params['id']],
    );
    if (!template) {
      res.status(404).json({ error: 'Template not found' });
      return;
    }
    if (user.role_id !== 3 && template.created_by !== user.id) {
      res.status(403).json({ error: 'Not authorised to view this template.' });
      return;
    }
    const rows = await db.all<TemplateSectionRow>(
      `SELECT id, template_id, section_key, payload, sort_order, created_at, updated_at
         FROM event_template_sections WHERE template_id = $1
        ORDER BY sort_order ASC, id ASC`,
      [req.params['id']],
    );
    res.json({ sections: rows });
  } catch (error) {
    console.error('Error listing template sections:', error);
    res.status(500).json({ error: 'Failed to list sections' });
  }
}

/** PUT /api/event-templates/:id/sections/:sectionKey — upsert payload */
export async function upsertTemplateSection(req: Request, res: Response): Promise<void> {
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
    const sectionKey = req.params['sectionKey'];
    if (!sectionKey || !(VALID_TEMPLATE_SECTIONS as readonly string[]).includes(sectionKey)) {
      res
        .status(400)
        .json({ error: `section_key must be one of: ${VALID_TEMPLATE_SECTIONS.join(', ')}` });
      return;
    }
    const db = getDatabase();
    const template = await db.get<EventTemplateRow>(
      'SELECT id, created_by FROM event_templates WHERE id = $1 AND deleted_at IS NULL',
      [req.params['id']],
    );
    if (!template) {
      res.status(404).json({ error: 'Template not found' });
      return;
    }
    if (user.role_id !== 3 && template.created_by !== user.id) {
      res.status(403).json({ error: 'Not authorised to manage this template.' });
      return;
    }

    const { payload, sortOrder } = (req.body ?? {}) as { payload?: unknown; sortOrder?: unknown };
    if (payload === undefined) {
      res.status(400).json({ error: 'payload is required.' });
      return;
    }
    const sort = Number(sortOrder) || 0;
    const payloadJson = JSON.stringify(payload);

    await db.run(
      `INSERT INTO event_template_sections (template_id, section_key, payload, sort_order)
       VALUES ($1, $2, $3::jsonb, $4)
       ON CONFLICT (template_id, section_key) DO UPDATE
         SET payload = EXCLUDED.payload,
             sort_order = EXCLUDED.sort_order,
             updated_at = CURRENT_TIMESTAMP`,
      [req.params['id'], sectionKey, payloadJson, sort],
    );

    const row = await db.get<TemplateSectionRow>(
      `SELECT id, template_id, section_key, payload, sort_order, created_at, updated_at
         FROM event_template_sections WHERE template_id = $1 AND section_key = $2`,
      [req.params['id'], sectionKey],
    );
    res.json(row);
  } catch (error) {
    console.error('Error upserting template section:', error);
    res.status(500).json({ error: 'Failed to upsert section' });
  }
}

/** DELETE /api/event-templates/:id/sections/:sectionKey */
export async function deleteTemplateSection(req: Request, res: Response): Promise<void> {
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
    const sectionKey = req.params['sectionKey'];
    if (!sectionKey || !(VALID_TEMPLATE_SECTIONS as readonly string[]).includes(sectionKey)) {
      res
        .status(400)
        .json({ error: `section_key must be one of: ${VALID_TEMPLATE_SECTIONS.join(', ')}` });
      return;
    }
    const db = getDatabase();
    await db.run(
      'DELETE FROM event_template_sections WHERE template_id = $1 AND section_key = $2',
      [req.params['id'], sectionKey],
    );
    res.json({ message: 'Section deleted' });
  } catch (error) {
    console.error('Error deleting template section:', error);
    res.status(500).json({ error: 'Failed to delete section' });
  }
}

/**
 * Internal: replay template sections into a freshly applied event.
 * Each section type maps to its native CRUD path so applied templates compose
 * with the normal API surface.
 */
async function applyTemplateSections(
  db: ReturnType<typeof getDatabase>,
  templateId: number,
  eventId: number,
  userId: number,
): Promise<void> {
  // Defensive: a brand-new template may not have any sections yet, and the
  // section table is optional on legacy databases. Treat lookup errors and
  // null results as "no sections to apply" so apply still succeeds.
  let sections: TemplateSectionRow[] = [];
  try {
    sections =
      (await db.all<TemplateSectionRow>(
        `SELECT section_key, payload FROM event_template_sections
          WHERE template_id = $1
          ORDER BY sort_order ASC, id ASC`,
        [templateId],
      )) ?? [];
  } catch (err) {
    console.warn('[template-sections] lookup failed, skipping section replay:', err);
    return;
  }
  if (!Array.isArray(sections) || sections.length === 0) return;

  for (const section of sections) {
    const payload = section.payload as Record<string, unknown> | null;
    if (!payload) continue;

    if (section.section_key === 'tasks' && Array.isArray(payload['tasks'])) {
      for (const task of payload['tasks'] as Array<Record<string, unknown>>) {
        await db.run(
          `INSERT INTO tasks (event_id, title, notes, due_date, status, priority, created_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [
            eventId,
            String(task['title'] ?? 'Untitled task').slice(0, 200),
            (task['notes'] as string) ?? null,
            (task['due_date'] as string) ?? null,
            (task['status'] as string) ?? 'Pending',
            (task['priority'] as string) ?? 'Medium',
            userId,
          ],
        );
      }
    } else if (section.section_key === 'budget' && Array.isArray(payload['categories'])) {
      for (const cat of payload['categories'] as Array<Record<string, unknown>>) {
        await db.run(
          `INSERT INTO budget_categories (event_id, name, allocated_amount)
           VALUES ($1, $2, $3)`,
          [
            eventId,
            String(cat['name'] ?? 'Category').slice(0, 100),
            Number(cat['allocated_amount'] ?? 0),
          ],
        );
      }
    } else if (section.section_key === 'custom_fields' && Array.isArray(payload['fields'])) {
      for (const f of payload['fields'] as Array<Record<string, unknown>>) {
        if (typeof f['field_key'] !== 'string' || typeof f['label'] !== 'string') continue;
        if (typeof f['field_type'] !== 'string') continue;
        await db.run(
          `INSERT INTO event_custom_fields
             (event_id, field_key, label, field_type, options, value, required, sort_order, created_by, updated_by)
           VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8, $9, $10)
           ON CONFLICT (event_id, field_key) DO NOTHING`,
          [
            eventId,
            String(f['field_key']).slice(0, 60),
            String(f['label']).slice(0, 120),
            String(f['field_type']),
            f['options'] ? JSON.stringify(f['options']) : null,
            (f['value'] as string) ?? null,
            Boolean(f['required']),
            Number(f['sort_order']) || 0,
            userId,
            userId,
          ],
        );
      }
    } else if (section.section_key === 'shopping' && Array.isArray(payload['items'])) {
      const listResult = await db.run(
        `INSERT INTO shopping_lists (event_id, name, created_by) VALUES ($1, $2, $3) RETURNING id`,
        [eventId, String(payload['list_name'] ?? 'Template Shopping List'), userId],
      );
      const listId = listResult.lastID;
      for (const item of payload['items'] as Array<Record<string, unknown>>) {
        await db.run(
          `INSERT INTO shopping_items (list_id, name, quantity, unit, estimated_cost)
           VALUES ($1, $2, $3, $4, $5)`,
          [
            listId,
            String(item['name'] ?? 'Item').slice(0, 200),
            Number(item['quantity']) || 1,
            (item['unit'] as string) ?? null,
            Number(item['estimated_cost']) || null,
          ],
        );
      }
    }
    // Other section types (timeline, vendors, rsvp_questions) are reserved for
    // future work and intentionally left as a no-op here; the payload is still
    // persisted on the template so future implementations are forward-compatible.
  }
}
