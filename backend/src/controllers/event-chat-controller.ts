/**
 * Event Chat Controller
 * Issue: #628 — Integrated event team chat with real-time behavior
 */

import { Request, Response } from 'express';
import { getDatabase } from '../db/database.js';
import { requireEventAccess } from '../utils/event-access.js';
import { processMentions } from '../services/mentions/fanout.js';

interface AuthRequest extends Request {
  user?: { id: number; email: string; role_id: number };
}

/** GET /api/events/:eventId/chat */
export async function listChatMessages(req: Request, res: Response): Promise<Response> {
  const authReq = req as AuthRequest;
  const { eventId } = req.params;
  const { before, limit } = req.query as { before?: string; limit?: string };

  const event = await requireEventAccess(authReq, res, eventId, { allowMembers: true });
  if (!event) return res as Response;

  const db = getDatabase();
  const pageLimit = Math.min(Number(limit) || 50, 100);

  let query = `
    SELECT m.*, COALESCE(u.display_name, u.email) AS author_name, u.email AS author_email,
           r.body AS reply_to_body,
           COALESCE(ru.display_name, ru.email) AS reply_to_author
    FROM event_chat_messages m
    JOIN users u ON u.id = m.user_id
    LEFT JOIN event_chat_messages r ON r.id = m.reply_to_id
    LEFT JOIN users ru ON ru.id = r.user_id
    WHERE m.event_id = $1 AND m.deleted_at IS NULL`;

  const params: (string | number)[] = [eventId];

  if (before) {
    query += ` AND m.created_at < ?`;
    params.push(before);
  }

  query += ` ORDER BY m.created_at DESC LIMIT ?`;
  params.push(pageLimit);

  const messages = await db.all(query, params);
  return res.json({ messages: messages.reverse() });
}

/** POST /api/events/:eventId/chat */
export async function postChatMessage(req: Request, res: Response): Promise<Response> {
  const authReq = req as AuthRequest;
  const { eventId } = req.params;
  const { body, reply_to_id } = req.body as { body?: string; reply_to_id?: number };

  if (!body?.trim()) return res.status(400).json({ error: 'Message body is required.' });
  if (body.trim().length > 4000) return res.status(400).json({ error: 'Message too long (max 4000 chars).' });

  const event = await requireEventAccess(authReq, res, eventId, { allowMembers: true });
  if (!event) return res as Response;

  const db = getDatabase();

  if (reply_to_id) {
    const parent = await db.get(
      'SELECT id FROM event_chat_messages WHERE id = $1 AND event_id = $2 AND deleted_at IS NULL',
      [reply_to_id, eventId],
    );
    if (!parent) return res.status(404).json({ error: 'Reply-to message not found.' });
  }

  const result = await db.run(
    `INSERT INTO event_chat_messages (event_id, user_id, body, reply_to_id)
     VALUES ($1, $2, $3, $4) RETURNING id`,
    [eventId, authReq.user!.id, body.trim(), reply_to_id ?? null],
  );

  const message = await db.get(
    `SELECT m.*, COALESCE(u.display_name, u.email) AS author_name
     FROM event_chat_messages m
     JOIN users u ON u.id = m.user_id
     WHERE m.id = $1`,
    [result.lastID],
  );

  // Fire-and-forget: parse @mentions and notify mentioned users (#810).
  void processMentions({
    sourceType: 'chat_message',
    sourceId: result.lastID!,
    authorId: authReq.user!.id,
    body: body.trim(),
    contextLabel: `event chat`,
    link: `/events/${eventId}/chat`,
  });

  return res.status(201).json({ message });
}

/** PATCH /api/events/:eventId/chat/:id */
export async function editChatMessage(req: Request, res: Response): Promise<Response> {
  const authReq = req as AuthRequest;
  const { eventId, id } = req.params;
  const { body } = req.body as { body?: string };

  if (!body?.trim()) return res.status(400).json({ error: 'Message body is required.' });
  if (body.trim().length > 4000) return res.status(400).json({ error: 'Message too long (max 4000 chars).' });

  const event = await requireEventAccess(authReq, res, eventId, { allowMembers: true });
  if (!event) return res as Response;

  const db = getDatabase();
  const message = await db.get<{ id: number; user_id: number }>(
    'SELECT id, user_id FROM event_chat_messages WHERE id = $1 AND event_id = $2 AND deleted_at IS NULL',
    [id, eventId],
  );
  if (!message) return res.status(404).json({ error: 'Message not found.' });
  if (message.user_id !== authReq.user?.id) {
    return res.status(403).json({ error: 'You can only edit your own messages.' });
  }

  await db.run(
    'UPDATE event_chat_messages SET body = $1, edited_at = CURRENT_TIMESTAMP WHERE id = $2',
    [body.trim(), id],
  );

  const updated = await db.get(
    `SELECT m.*, COALESCE(u.display_name, u.email) AS author_name
     FROM event_chat_messages m JOIN users u ON u.id = m.user_id WHERE m.id = $1`,
    [id],
  );
  return res.json({ message: updated });
}

/** DELETE /api/events/:eventId/chat/:id */
export async function deleteChatMessage(req: Request, res: Response): Promise<Response> {
  const authReq = req as AuthRequest;
  const { eventId, id } = req.params;

  const event = await requireEventAccess(authReq, res, eventId, { allowMembers: true });
  if (!event) return res as Response;

  const db = getDatabase();
  const message = await db.get<{ id: number; user_id: number }>(
    'SELECT id, user_id FROM event_chat_messages WHERE id = $1 AND event_id = $2 AND deleted_at IS NULL',
    [id, eventId],
  );
  if (!message) return res.status(404).json({ error: 'Message not found.' });
  if (message.user_id !== authReq.user?.id) {
    return res.status(403).json({ error: 'You can only delete your own messages.' });
  }

  await db.run(
    'UPDATE event_chat_messages SET deleted_at = CURRENT_TIMESTAMP WHERE id = $1',
    [id],
  );
  return res.json({ message: 'Message deleted.' });
}
