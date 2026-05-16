/**
 * Timeline Templates Controller
 * Issues: #612 (drag-and-drop sort), #613 (templates by event type),
 *         #614 (buffer-time config), #615 (execution tracking),
 *         #616 (planned-vs-actual UX)
 */

import { Request, Response } from 'express';
import { getDatabase } from '../db/database.js';
import { requireEventAccess } from '../utils/event-access.js';

interface AuthRequest extends Request {
  user?: { id: number; email: string; role_id: number };
}

// ── #613: Timeline templates ──────────────────────────────────────────────────

/** GET /api/timeline-templates */
export async function listTimelineTemplates(req: Request, res: Response): Promise<Response> {
  const authReq = req as AuthRequest;
  if (!authReq.user) return res.status(401).json({ error: 'Unauthorized.' });

  const { event_type } = req.query as { event_type?: string };
  const db = getDatabase();

  let query = `SELECT * FROM timeline_templates WHERE is_global = TRUE OR created_by = $1`;
  const params: (string | number)[] = [authReq.user.id];

  if (event_type) {
    query += ` AND (event_type = ? OR event_type IS NULL)`;
    params.push(event_type);
  }
  query += ` ORDER BY name ASC`;

  const templates = await db.all(query, params);
  return res.json({ templates });
}

/** GET /api/timeline-templates/:id */
export async function getTimelineTemplate(req: Request, res: Response): Promise<Response> {
  const authReq = req as AuthRequest;
  if (!authReq.user) return res.status(401).json({ error: 'Unauthorized.' });

  const { id } = req.params;
  const db = getDatabase();

  const template = await db.get('SELECT * FROM timeline_templates WHERE id = $1', [id]);
  if (!template) return res.status(404).json({ error: 'Template not found.' });

  const activities = await db.all(
    'SELECT * FROM timeline_template_activities WHERE template_id = $1 ORDER BY sort_order ASC',
    [id],
  );
  return res.json({ template, activities });
}

/** POST /api/timeline-templates */
export async function createTimelineTemplate(req: Request, res: Response): Promise<Response> {
  const authReq = req as AuthRequest;
  if (!authReq.user) return res.status(401).json({ error: 'Unauthorized.' });

  const { name, description, event_type, is_global, activities } = req.body as {
    name?: string;
    description?: string;
    event_type?: string;
    is_global?: boolean;
    activities?: Array<{
      title: string;
      description?: string;
      offset_minutes?: number;
      duration_minutes?: number;
      buffer_before_mins?: number;
      buffer_after_mins?: number;
      location?: string;
      sort_order?: number;
    }>;
  };

  if (!name?.trim()) return res.status(400).json({ error: 'Template name is required.' });

  const db = getDatabase();

  const result = await db.run(
    `INSERT INTO timeline_templates (name, description, event_type, is_global, created_by)
     VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [name.trim(), description?.trim() || null, event_type?.trim() || null, is_global ?? false, authReq.user.id],
  );
  const templateId = result.lastID;

  if (Array.isArray(activities)) {
    for (let i = 0; i < activities.length; i++) {
      const a = activities[i];
      if (!a.title?.trim()) continue;
      await db.run(
        `INSERT INTO timeline_template_activities
           (template_id, title, description, offset_minutes, duration_minutes,
            buffer_before_mins, buffer_after_mins, location, sort_order)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          templateId,
          a.title.trim(),
          a.description?.trim() || null,
          a.offset_minutes ?? 0,
          a.duration_minutes ?? 60,
          a.buffer_before_mins ?? 0,
          a.buffer_after_mins ?? 0,
          a.location?.trim() || null,
          a.sort_order ?? i,
        ],
      );
    }
  }

  const template = await db.get('SELECT * FROM timeline_templates WHERE id = $1', [templateId]);
  const savedActivities = await db.all(
    'SELECT * FROM timeline_template_activities WHERE template_id = $1 ORDER BY sort_order ASC',
    [templateId],
  );
  return res.status(201).json({ template, activities: savedActivities });
}

/** DELETE /api/timeline-templates/:id */
export async function deleteTimelineTemplate(req: Request, res: Response): Promise<Response> {
  const authReq = req as AuthRequest;
  if (!authReq.user) return res.status(401).json({ error: 'Unauthorized.' });

  const { id } = req.params;
  const db = getDatabase();

  const template = await db.get(
    'SELECT * FROM timeline_templates WHERE id = $1 AND (created_by = $2 OR is_global = TRUE)',
    [id, authReq.user.id],
  );
  if (!template) return res.status(404).json({ error: 'Template not found or access denied.' });

  await db.run('DELETE FROM timeline_templates WHERE id = $1', [id]);
  return res.json({ message: 'Template deleted.' });
}

/** POST /api/events/:eventId/timeline/apply-template */
export async function applyTimelineTemplate(req: Request, res: Response): Promise<Response> {
  const authReq = req as AuthRequest;
  const { eventId } = req.params;
  const { template_id, event_start_time } = req.body as {
    template_id?: number;
    event_start_time?: string;
  };

  if (!template_id) return res.status(400).json({ error: 'template_id is required.' });

  const event = await requireEventAccess(authReq, res, eventId, { allowMembers: true });
  if (!event) return res as Response;

  const db = getDatabase();
  const template = await db.get('SELECT * FROM timeline_templates WHERE id = $1', [template_id]);
  if (!template) return res.status(404).json({ error: 'Template not found.' });

  const templateActivities = await db.all(
    'SELECT * FROM timeline_template_activities WHERE template_id = $1 ORDER BY sort_order ASC',
    [template_id],
  );

  const baseTime = event_start_time
    ? new Date(event_start_time)
    : (event as unknown as Record<string, unknown>)['start_date']
      ? new Date((event as unknown as Record<string, string>)['start_date'])
      : new Date();

  const created: unknown[] = [];
  for (const ta of templateActivities as Array<{
    title: string;
    description: string | null;
    offset_minutes: number;
    duration_minutes: number;
    buffer_before_mins: number;
    buffer_after_mins: number;
    location: string | null;
    sort_order: number;
  }>) {
    const startMs = baseTime.getTime() + ta.offset_minutes * 60000;
    const endMs = startMs + ta.duration_minutes * 60000;
    const startTime = new Date(startMs).toISOString();
    const endTime = new Date(endMs).toISOString();

    const result = await db.run(
      `INSERT INTO timeline_activities
         (event_id, title, description, start_time, end_time,
          planned_start_time, planned_end_time,
          buffer_before_mins, buffer_after_mins,
          status, location, sort_order, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'planned', $10, $11, $12)
       RETURNING id`,
      [
        eventId,
        ta.title,
        ta.description,
        startTime,
        endTime,
        startTime,
        endTime,
        ta.buffer_before_mins,
        ta.buffer_after_mins,
        ta.location,
        ta.sort_order,
        authReq.user?.id ?? null,
      ],
    );
    const activity = await db.get('SELECT * FROM timeline_activities WHERE id = $1', [result.lastID]);
    created.push(activity);
  }

  return res.status(201).json({ activities: created, applied_template: template });
}

// ── #612: Drag-and-drop reorder ───────────────────────────────────────────────

/** PATCH /api/events/:eventId/timeline/reorder */
export async function reorderTimeline(req: Request, res: Response): Promise<Response> {
  const authReq = req as AuthRequest;
  const { eventId } = req.params;
  const { order } = req.body as { order?: Array<{ id: number; sort_order: number }> };

  if (!Array.isArray(order) || order.length === 0) {
    return res.status(400).json({ error: 'order array is required.' });
  }

  const event = await requireEventAccess(authReq, res, eventId, { allowMembers: true });
  if (!event) return res as Response;

  const db = getDatabase();

  for (const item of order) {
    const id = Number(item.id);
    const sortOrder = Number(item.sort_order);
    if (!Number.isInteger(id) || id <= 0) continue;
    await db.run(
      `UPDATE timeline_activities SET sort_order = $1, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2 AND event_id = $3`,
      [sortOrder, id, eventId],
    );
  }

  const activities = await db.all(
    `SELECT * FROM timeline_activities WHERE event_id = $1 ORDER BY sort_order ASC`,
    [eventId],
  );
  return res.json({ activities });
}

// ── #614: Buffer-time configuration ──────────────────────────────────────────

/** PATCH /api/events/:eventId/timeline/:id/buffer */
export async function updateActivityBuffer(req: Request, res: Response): Promise<Response> {
  const authReq = req as AuthRequest;
  const { eventId, id } = req.params;
  const { buffer_before_mins, buffer_after_mins } = req.body as {
    buffer_before_mins?: number;
    buffer_after_mins?: number;
  };

  if (buffer_before_mins !== undefined && (buffer_before_mins < 0 || buffer_before_mins > 480)) {
    return res.status(400).json({ error: 'buffer_before_mins must be 0–480.' });
  }
  if (buffer_after_mins !== undefined && (buffer_after_mins < 0 || buffer_after_mins > 480)) {
    return res.status(400).json({ error: 'buffer_after_mins must be 0–480.' });
  }

  const event = await requireEventAccess(authReq, res, eventId, { allowMembers: true });
  if (!event) return res as Response;

  const db = getDatabase();
  const activity = await db.get(
    'SELECT id FROM timeline_activities WHERE id = $1 AND event_id = $2',
    [id, eventId],
  );
  if (!activity) return res.status(404).json({ error: 'Timeline activity not found.' });

  const fields: string[] = ['updated_at = CURRENT_TIMESTAMP'];
  const params: (number | string)[] = [];
  if (buffer_before_mins !== undefined) { fields.unshift('buffer_before_mins = ?'); params.push(buffer_before_mins); }
  if (buffer_after_mins !== undefined) { fields.unshift('buffer_after_mins = ?'); params.push(buffer_after_mins); }
  params.push(id);

  await db.run(`UPDATE timeline_activities SET ${fields.join(', ')} WHERE id = $1`, params);
  const updated = await db.get('SELECT * FROM timeline_activities WHERE id = $1', [id]);
  return res.json({ activity: updated });
}

// ── #615: Execution tracking ──────────────────────────────────────────────────

/** PATCH /api/events/:eventId/timeline/:id/execution */
export async function updateExecutionStatus(req: Request, res: Response): Promise<Response> {
  const authReq = req as AuthRequest;
  const { eventId, id } = req.params;
  const { status, actual_start_time, actual_end_time } = req.body as {
    status?: string;
    actual_start_time?: string;
    actual_end_time?: string;
  };

  const VALID_STATUSES = ['planned', 'in-progress', 'completed', 'skipped'];
  if (status && !VALID_STATUSES.includes(status)) {
    return res.status(400).json({ error: `Invalid status. Allowed: ${VALID_STATUSES.join(', ')}` });
  }

  const event = await requireEventAccess(authReq, res, eventId, { allowMembers: true });
  if (!event) return res as Response;

  const db = getDatabase();
  const activity = await db.get(
    'SELECT id FROM timeline_activities WHERE id = $1 AND event_id = $2',
    [id, eventId],
  );
  if (!activity) return res.status(404).json({ error: 'Timeline activity not found.' });

  const fields: string[] = ['updated_at = CURRENT_TIMESTAMP'];
  const params: (string | null)[] = [];
  if (status) { fields.unshift('status = ?'); params.push(status); }
  if (actual_start_time !== undefined) { fields.unshift('actual_start_time = ?'); params.push(actual_start_time || null); }
  if (actual_end_time !== undefined) { fields.unshift('actual_end_time = ?'); params.push(actual_end_time || null); }
  params.push(id);

  await db.run(`UPDATE timeline_activities SET ${fields.join(', ')} WHERE id = $1`, params);
  const updated = await db.get('SELECT * FROM timeline_activities WHERE id = $1', [id]);
  return res.json({ activity: updated });
}
