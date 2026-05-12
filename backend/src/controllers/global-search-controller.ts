/**
 * Power-user global search (#581)
 *
 * Unified query that returns matching events, tasks, RSVPs, vendors, and
 * gallery items the caller has access to. Permission scoping is enforced by
 * filtering on event ownership/membership before returning a hit.
 *
 * Query parameters:
 *   ?q=keyword       (required)
 *   ?types=...       (optional CSV: events,tasks,rsvps,vendors,gallery)
 *   ?limit=N         (default 10 per type)
 *   ?include_archived=true|false (default false)
 */

import { Request, Response } from 'express';
import { getDatabase } from '../db/database.js';

interface AuthRequest extends Request {
  user?: { id: number; email: string; role_id: number };
}

const ALL_TYPES = ['events', 'tasks', 'rsvps', 'vendors', 'gallery'] as const;
type SearchType = (typeof ALL_TYPES)[number];

export async function globalSearch(req: Request, res: Response): Promise<Response> {
  const authReq = req as AuthRequest;
  if (!authReq.user) return res.status(401).json({ error: 'Authentication required.' });

  const q = typeof req.query['q'] === 'string' ? (req.query['q'] as string).trim() : '';
  if (!q) return res.status(400).json({ error: 'q is required.' });
  if (q.length > 200) return res.status(400).json({ error: 'q exceeds maximum length.' });

  const limit = Math.min(Math.max(Number(req.query['limit']) || 10, 1), 50);
  const includeArchived = req.query['include_archived'] === 'true';

  const requestedTypes = typeof req.query['types'] === 'string'
    ? (req.query['types'] as string).split(',').map((t) => t.trim()).filter(Boolean)
    : [...ALL_TYPES];
  const types = requestedTypes.filter((t): t is SearchType =>
    (ALL_TYPES as readonly string[]).includes(t),
  );

  // Escape LIKE wildcards AND the escape character itself so user input cannot
  // alter pattern semantics. Order matters: escape backslashes first.
  const like = `%${q.replace(/[\\%_]/g, '\\$&')}%`;

  // Accessible event ids: created_by + event_members.
  const isAdmin = authReq.user.role_id === 3;
  const db = getDatabase();
  let accessibleClause: string;
  let accessibleParams: (number | string)[];

  if (isAdmin) {
    accessibleClause = 'TRUE';
    accessibleParams = [];
  } else {
    accessibleClause = `(e.created_by = ? OR EXISTS (
      SELECT 1 FROM event_members em WHERE em.event_id = e.id AND em.user_id = ?
    ))`;
    accessibleParams = [authReq.user.id, authReq.user.id];
  }
  const archiveClause = includeArchived ? '' : 'AND e.archived_at IS NULL';

  const results: Record<string, unknown[]> = {};

  if (types.includes('events')) {
    const sql = `
      SELECT e.id, e.title, e.date, e.location, e.status, e.archived_at,
             'event' AS kind
        FROM events e
       WHERE e.deleted_at IS NULL ${archiveClause}
         AND ${accessibleClause}
         AND (e.title ILIKE ? OR COALESCE(e.description, '') ILIKE ? OR e.location ILIKE ?
              OR COALESCE(e.tags, '') ILIKE ?)
       ORDER BY e.date DESC
       LIMIT ${limit}
    `;
    results['events'] = await db.all(sql, [...accessibleParams, like, like, like, like]);
  }

  if (types.includes('tasks')) {
    const sql = `
      SELECT t.id, t.event_id, t.title, t.status, t.due_date, e.title AS event_title,
             'task' AS kind
        FROM tasks t
        JOIN events e ON e.id = t.event_id
       WHERE e.deleted_at IS NULL ${archiveClause}
         AND ${accessibleClause}
         AND (t.title ILIKE ? OR COALESCE(t.notes, '') ILIKE ?)
       ORDER BY t.due_date ASC NULLS LAST, t.id DESC
       LIMIT ${limit}
    `;
    results['tasks'] = await db.all(sql, [...accessibleParams, like, like]);
  }

  if (types.includes('rsvps')) {
    const sql = `
      SELECT r.id, r.event_id, r.name, r.email, r.status, e.title AS event_title,
             'rsvp' AS kind
        FROM rsvps r
        JOIN events e ON e.id = r.event_id
       WHERE e.deleted_at IS NULL ${archiveClause}
         AND ${accessibleClause}
         AND (r.name ILIKE ? OR r.email ILIKE ?)
       ORDER BY r.created_at DESC
       LIMIT ${limit}
    `;
    results['rsvps'] = await db.all(sql, [...accessibleParams, like, like]);
  }

  if (types.includes('vendors')) {
    const sql = `
      SELECT v.id, v.event_id, v.name, v.category, v.status, e.title AS event_title,
             'vendor' AS kind
        FROM vendors v
        JOIN events e ON e.id = v.event_id
       WHERE e.deleted_at IS NULL ${archiveClause}
         AND ${accessibleClause}
         AND (v.name ILIKE ? OR v.category ILIKE ? OR COALESCE(v.notes, '') ILIKE ?)
       ORDER BY v.created_at DESC
       LIMIT ${limit}
    `;
    results['vendors'] = await db.all(sql, [...accessibleParams, like, like, like]);
  }

  if (types.includes('gallery')) {
    const sql = `
      SELECT d.id, d.event_id, d.file_name, d.original_name, d.caption, e.title AS event_title,
             'photo' AS kind
        FROM event_documents d
        JOIN events e ON e.id = d.event_id
       WHERE e.deleted_at IS NULL ${archiveClause}
         AND ${accessibleClause}
         AND d.mime_type LIKE 'image/%'
         AND (d.original_name ILIKE ? OR COALESCE(d.caption, '') ILIKE ?)
       ORDER BY d.created_at DESC
       LIMIT ${limit}
    `;
    results['gallery'] = await db.all(sql, [...accessibleParams, like, like]);
  }

  return res.json({ q, types, limit, results });
}
