/**
 * Communication templates with personalization tokens (#590).
 *
 * Templates are scoped per event (event_id may be NULL for global system
 * defaults) and contain a subject + body with `{token}` placeholders. They
 * are rendered through `personalize()` before being sent and exposed to the
 * RSVP communication suite UI for save/load.
 */
import type { Request, Response } from 'express';
import { getDatabase } from '../db/database.js';
import { requireEventAccess } from '../utils/event-access.js';
import { personalize } from '../utils/template-personalization.js';

interface AuthRequest extends Request {
  user?: { id: number; email: string; role_id: number };
}

interface TemplateRow {
  id: number;
  event_id: number | null;
  slug: string;
  name: string;
  subject: string;
  body: string;
  is_default: boolean;
  created_by: number | null;
  created_at: string;
  updated_at: string;
}

/** GET /api/events/:eventId/communication/templates */
export async function listTemplates(req: Request, res: Response): Promise<Response> {
  const authReq = req as AuthRequest;
  const { eventId } = req.params;
  const event = await requireEventAccess(authReq, res, eventId, { allowMembers: true });
  if (!event) return res as Response;
  const db = getDatabase();
  const rows = await db.all<TemplateRow>(
    `SELECT * FROM communication_templates
     WHERE event_id = ? OR event_id IS NULL
     ORDER BY (event_id IS NULL) ASC, name ASC`,
    [eventId],
  );
  return res.json({ templates: rows });
}

/** POST /api/events/:eventId/communication/templates */
export async function createTemplate(req: Request, res: Response): Promise<Response> {
  const authReq = req as AuthRequest;
  const { eventId } = req.params;
  const event = await requireEventAccess(authReq, res, eventId, { ownerOnly: true });
  if (!event) return res as Response;
  const { slug, name, subject, body, is_default } = (req.body ?? {}) as {
    slug?: string; name?: string; subject?: string; body?: string; is_default?: boolean;
  };
  if (!slug?.trim()) return res.status(400).json({ error: 'Slug is required.' });
  if (!name?.trim()) return res.status(400).json({ error: 'Name is required.' });
  if (!subject?.trim()) return res.status(400).json({ error: 'Subject is required.' });
  if (!body?.trim()) return res.status(400).json({ error: 'Body is required.' });
  const db = getDatabase();
  try {
    const result = await db.run(
      `INSERT INTO communication_templates (event_id, slug, name, subject, body, is_default, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING id`,
      [eventId, slug.trim(), name.trim(), subject.trim(), body, Boolean(is_default), authReq.user?.id ?? null],
    );
    const row = await db.get<TemplateRow>(
      'SELECT * FROM communication_templates WHERE id = ?',
      [result.lastID],
    );
    return res.status(201).json({ template: row });
  } catch (err) {
    const m = err instanceof Error ? err.message : 'Insert failed';
    if (/unique|duplicate/i.test(m)) {
      return res.status(409).json({ error: 'A template with that slug already exists for this event.' });
    }
    return res.status(500).json({ error: 'Failed to create template.' });
  }
}

/** PATCH /api/events/:eventId/communication/templates/:id */
export async function updateTemplate(req: Request, res: Response): Promise<Response> {
  const authReq = req as AuthRequest;
  const { eventId, id } = req.params;
  const event = await requireEventAccess(authReq, res, eventId, { ownerOnly: true });
  if (!event) return res as Response;
  const { name, subject, body, is_default } = (req.body ?? {}) as Record<string, unknown>;
  const fields: string[] = [];
  const params: (string | boolean | null)[] = [];
  if (typeof name === 'string') { fields.push('name = ?'); params.push(name.trim()); }
  if (typeof subject === 'string') { fields.push('subject = ?'); params.push(subject.trim()); }
  if (typeof body === 'string') { fields.push('body = ?'); params.push(String(body)); }
  if (is_default !== undefined) { fields.push('is_default = ?'); params.push(Boolean(is_default)); }
  if (fields.length === 0) return res.status(400).json({ error: 'No fields to update.' });
  fields.push('updated_at = CURRENT_TIMESTAMP');
  params.push(id, eventId);
  const db = getDatabase();
  await db.run(
    `UPDATE communication_templates SET ${fields.join(', ')} WHERE id = ? AND event_id = ?`,
    params,
  );
  const row = await db.get<TemplateRow>(
    'SELECT * FROM communication_templates WHERE id = ? AND event_id = ?',
    [id, eventId],
  );
  if (!row) return res.status(404).json({ error: 'Template not found.' });
  return res.json({ template: row });
}

/** DELETE /api/events/:eventId/communication/templates/:id */
export async function deleteTemplate(req: Request, res: Response): Promise<Response> {
  const authReq = req as AuthRequest;
  const { eventId, id } = req.params;
  const event = await requireEventAccess(authReq, res, eventId, { ownerOnly: true });
  if (!event) return res as Response;
  const db = getDatabase();
  await db.run('DELETE FROM communication_templates WHERE id = ? AND event_id = ?', [id, eventId]);
  return res.json({ deleted: true });
}

/** POST /api/events/:eventId/communication/templates/:id/preview — render with sample tokens */
export async function previewTemplate(req: Request, res: Response): Promise<Response> {
  const authReq = req as AuthRequest;
  const { eventId, id } = req.params;
  const event = await requireEventAccess(authReq, res, eventId, { allowMembers: true });
  if (!event) return res as Response;
  const db = getDatabase();
  const row = await db.get<TemplateRow>(
    'SELECT * FROM communication_templates WHERE id = ? AND (event_id = ? OR event_id IS NULL)',
    [id, eventId],
  );
  if (!row) return res.status(404).json({ error: 'Template not found.' });
  const ev = await db.get<{ title: string; date: string; location: string | null }>(
    'SELECT title, date, location FROM events WHERE id = ?',
    [eventId],
  );
  const tokens = (req.body?.tokens ?? {}) as Record<string, string>;
  const base = {
    name: 'Sample Guest',
    guest_name: 'Sample Guest',
    email: 'guest@example.com',
    event: ev?.title ?? 'Event',
    event_title: ev?.title ?? 'Event',
    event_date: ev?.date ?? '',
    event_location: ev?.location ?? '',
    rsvp_url: 'https://example.com/rsvp/sample',
    unsubscribe_url: 'https://example.com/u/sample',
    meal_choice: '',
    status: 'Pending',
    organizer: '',
    ...tokens,
  };
  return res.json({
    subject: personalize(row.subject, base),
    body: personalize(row.body, base),
  });
}
