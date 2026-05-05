/**
 * Event Messages Controller
 * PostgreSQL-backed team conversation scoped to an event.
 * Only event owners, admins, and event members may read or post.
 *
 * Routes handled here:
 *   GET    /api/events/:eventId/messages
 *   POST   /api/events/:eventId/messages
 *   PATCH  /api/events/:eventId/messages/:id
 *   DELETE /api/events/:eventId/messages/:id
 */

import { Request, Response } from 'express';
import { getDatabase } from '../db/database.js';
import { requireEventAccess } from '../utils/event-access.js';

interface AuthRequest extends Request {
  user?: { id: number; email: string; role_id: number };
}

const MAX_BODY_LENGTH = 4_000;

const MESSAGE_SELECT = `
  SELECT m.id,
         m.event_id,
         m.sender_id,
         m.body,
         m.created_at,
         m.updated_at,
         COALESCE(u.display_name, u.email) AS sender_name
  FROM   event_messages m
  JOIN   users u ON u.id = m.sender_id
`;

/**
 * GET /api/events/:eventId/messages?before=<id>&limit=<n>
 * Returns up to `limit` (max 100, default 50) messages in ascending order.
 * Cursor-style pagination: pass `before=<id>` to fetch an earlier page.
 */
export async function listMessages(req: Request, res: Response): Promise<Response> {
  const authReq = req as AuthRequest;
  const { eventId } = req.params;

  const event = await requireEventAccess(authReq, res, eventId, { allowMembers: true });
  if (!event) return res as Response;

  const rawBefore = req.query.before;
  const rawLimit  = req.query.limit;

  const limit = Math.min(Number.isFinite(Number(rawLimit)) ? Number(rawLimit) : 50, 100);
  if (limit < 1) return res.status(400).json({ error: 'limit must be a positive integer.' });

  let messages: unknown[];
  if (rawBefore !== undefined) {
    const before = Number(rawBefore);
    if (!Number.isInteger(before) || before <= 0) {
      return res.status(400).json({ error: 'before must be a positive integer.' });
    }
    const db = getDatabase();
    messages = await db.all(
      `${MESSAGE_SELECT}
       WHERE  m.event_id = ? AND m.deleted_at IS NULL AND m.id < ?
       ORDER  BY m.id DESC
       LIMIT  ?`,
      [eventId, before, limit],
    );
  } else {
    const db = getDatabase();
    messages = await db.all(
      `${MESSAGE_SELECT}
       WHERE  m.event_id = ? AND m.deleted_at IS NULL
       ORDER  BY m.id DESC
       LIMIT  ?`,
      [eventId, limit],
    );
  }

  // Return in chronological order so clients can append directly.
  return res.json({ messages: (messages as unknown[]).reverse() });
}

/**
 * POST /api/events/:eventId/messages
 * Body: { body: string }
 */
export async function postMessage(req: Request, res: Response): Promise<Response> {
  const authReq = req as AuthRequest;
  const { eventId } = req.params;

  const event = await requireEventAccess(authReq, res, eventId, { allowMembers: true });
  if (!event) return res as Response;

  const { body } = req.body as { body?: string };
  if (!body?.trim()) return res.status(400).json({ error: 'Message body is required.' });
  if (body.trim().length > MAX_BODY_LENGTH) {
    return res.status(400).json({ error: `Message body cannot exceed ${MAX_BODY_LENGTH} characters.` });
  }

  const db = getDatabase();
  const result = await db.run(
    `INSERT INTO event_messages (event_id, sender_id, body) VALUES (?, ?, ?) RETURNING id`,
    [eventId, authReq.user!.id, body.trim()],
  );

  const message = await db.get(
    `${MESSAGE_SELECT} WHERE m.id = ?`,
    [result.lastID],
  );

  return res.status(201).json({ message });
}

/**
 * PATCH /api/events/:eventId/messages/:id
 * Body: { body: string }
 * Only the original sender, the event owner, or an admin may edit a message.
 */
export async function editMessage(req: Request, res: Response): Promise<Response> {
  const authReq = req as AuthRequest;
  const { eventId, id } = req.params;

  const event = await requireEventAccess(authReq, res, eventId, { allowMembers: true });
  if (!event) return res as Response;

  const db = getDatabase();
  const existing = await db.get<{ id: number; sender_id: number }>(
    'SELECT id, sender_id FROM event_messages WHERE id = ? AND event_id = ? AND deleted_at IS NULL',
    [id, eventId],
  );
  if (!existing) return res.status(404).json({ error: 'Message not found.' });

  const isAdmin = authReq.user!.role_id >= 3;
  const isEventOwner = event.created_by === authReq.user!.id;
  if (existing.sender_id !== authReq.user!.id && !isAdmin && !isEventOwner) {
    return res.status(403).json({ error: 'You can only edit your own messages.' });
  }

  const { body } = req.body as { body?: string };
  if (!body?.trim()) return res.status(400).json({ error: 'Message body is required.' });
  if (body.trim().length > MAX_BODY_LENGTH) {
    return res.status(400).json({ error: `Message body cannot exceed ${MAX_BODY_LENGTH} characters.` });
  }

  await db.run(
    'UPDATE event_messages SET body = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
    [body.trim(), id],
  );

  const updated = await db.get(`${MESSAGE_SELECT} WHERE m.id = ?`, [id]);
  return res.json({ message: updated });
}

/**
 * DELETE /api/events/:eventId/messages/:id
 * Soft-deletes so thread context is preserved for other participants.
 * Only the original sender, the event owner, or an admin may delete.
 */
export async function deleteMessage(req: Request, res: Response): Promise<Response> {
  const authReq = req as AuthRequest;
  const { eventId, id } = req.params;

  const event = await requireEventAccess(authReq, res, eventId, { allowMembers: true });
  if (!event) return res as Response;

  const db = getDatabase();
  const existing = await db.get<{ id: number; sender_id: number }>(
    'SELECT id, sender_id FROM event_messages WHERE id = ? AND event_id = ? AND deleted_at IS NULL',
    [id, eventId],
  );
  if (!existing) return res.status(404).json({ error: 'Message not found.' });

  const isAdmin = authReq.user!.role_id >= 3;
  const isEventOwner = event.created_by === authReq.user!.id;
  if (existing.sender_id !== authReq.user!.id && !isAdmin && !isEventOwner) {
    return res.status(403).json({ error: 'You can only delete your own messages.' });
  }

  await db.run(
    'UPDATE event_messages SET deleted_at = CURRENT_TIMESTAMP WHERE id = ?',
    [id],
  );

  return res.json({ message: 'Message deleted.' });
}
