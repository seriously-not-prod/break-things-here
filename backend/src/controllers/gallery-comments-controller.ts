/**
 * Gallery Comments / Discussion (#621)
 *
 * Comments respect three layers of permission:
 *   1. The event-level `gallery_comments_enabled` toggle.
 *   2. The per-photo `allow_comments` flag.
 *   3. Membership in the event (owner/admin can always comment; members can
 *      comment unless gates above forbid; non-members cannot comment).
 *
 * Comments support threading via `parent_id` and soft-hide via `is_hidden`.
 */

import { Request, Response } from 'express';
import { getDatabase } from '../db/database.js';
import { requireEventAccess } from '../utils/event-access.js';

interface AuthRequest extends Request {
  user?: { id: number; email: string; role_id: number };
}

interface PhotoCtx {
  id: number;
  event_id: number;
  allow_comments: boolean;
}

interface EventCtx {
  id: number;
  gallery_comments_enabled: boolean;
  created_by: number;
}

async function loadPhotoCtx(eventId: string, documentId: string): Promise<PhotoCtx | null> {
  const db = getDatabase();
  return (
    (await db.get<PhotoCtx>(
      `SELECT id, event_id, allow_comments FROM event_documents
        WHERE id = ? AND event_id = ?`,
      [documentId, eventId],
    )) ?? null
  );
}

async function loadEventCtx(eventId: string): Promise<EventCtx | null> {
  const db = getDatabase();
  return (
    (await db.get<EventCtx>(
      `SELECT id, gallery_comments_enabled, created_by FROM events
        WHERE id = ? AND deleted_at IS NULL`,
      [eventId],
    )) ?? null
  );
}

export async function listComments(req: Request, res: Response): Promise<Response> {
  const authReq = req as AuthRequest;
  const { eventId, documentId } = req.params;

  const event = await requireEventAccess(authReq, res, eventId, { allowMembers: true });
  if (!event) return res as Response;

  const photo = await loadPhotoCtx(eventId, documentId);
  if (!photo) return res.status(404).json({ error: 'Photo not found.' });

  const db = getDatabase();
  const rows = await db.all(
    `SELECT c.id, c.event_id, c.document_id, c.parent_id, c.user_id, c.body,
            c.is_hidden, c.hidden_by, c.hidden_at, c.created_at, c.updated_at,
            u.display_name AS author_name, u.email AS author_email
       FROM gallery_comments c
       LEFT JOIN users u ON u.id = c.user_id
      WHERE c.document_id = ? AND c.event_id = ?
      ORDER BY c.created_at ASC`,
    [documentId, eventId],
  );

  return res.json({
    comments: rows.map((r: Record<string, unknown>) => ({
      id: r['id'],
      eventId: r['event_id'],
      documentId: r['document_id'],
      parentId: r['parent_id'],
      userId: r['user_id'],
      authorName: r['author_name'],
      authorEmail: r['author_email'],
      body: r['is_hidden'] ? '[hidden]' : r['body'],
      isHidden: r['is_hidden'],
      hiddenBy: r['hidden_by'],
      hiddenAt: r['hidden_at'],
      createdAt: r['created_at'],
      updatedAt: r['updated_at'],
    })),
  });
}

export async function addComment(req: Request, res: Response): Promise<Response> {
  const authReq = req as AuthRequest;
  const { eventId, documentId } = req.params;

  const event = await requireEventAccess(authReq, res, eventId, { allowMembers: true });
  if (!event) return res as Response;

  const ev = await loadEventCtx(eventId);
  if (!ev) return res.status(404).json({ error: 'Event not found.' });
  if (!ev.gallery_comments_enabled) {
    return res.status(403).json({ error: 'Comments are disabled for this event.' });
  }

  const photo = await loadPhotoCtx(eventId, documentId);
  if (!photo) return res.status(404).json({ error: 'Photo not found.' });
  if (!photo.allow_comments) {
    return res.status(403).json({ error: 'Comments are disabled for this photo.' });
  }

  const { body, parentId } = (req.body ?? {}) as { body?: unknown; parentId?: unknown };
  if (typeof body !== 'string' || !body.trim()) {
    return res.status(400).json({ error: 'body is required.' });
  }
  const safeBody = body.trim().substring(0, 2000);

  let parent: number | null = null;
  if (parentId !== undefined && parentId !== null && parentId !== '') {
    const n = Number(parentId);
    if (!Number.isFinite(n)) {
      return res.status(400).json({ error: 'parentId must be numeric.' });
    }
    const db = getDatabase();
    const existing = await db.get<{ id: number }>(
      'SELECT id FROM gallery_comments WHERE id = ? AND document_id = ?',
      [n, documentId],
    );
    if (!existing) return res.status(404).json({ error: 'Parent comment not found.' });
    parent = n;
  }

  const db = getDatabase();
  const result = await db.run(
    `INSERT INTO gallery_comments
       (event_id, document_id, parent_id, user_id, body)
     VALUES (?, ?, ?, ?, ?)
     RETURNING id`,
    [eventId, documentId, parent, authReq.user?.id ?? null, safeBody],
  );

  const created = await db.get(
    `SELECT id, event_id, document_id, parent_id, user_id, body, is_hidden, created_at
       FROM gallery_comments WHERE id = ?`,
    [result.lastID],
  );
  return res.status(201).json(created);
}

export async function moderateComment(req: Request, res: Response): Promise<Response> {
  const authReq = req as AuthRequest;
  const { eventId, commentId } = req.params;

  const event = await requireEventAccess(authReq, res, eventId, { allowMembers: false });
  if (!event) return res as Response;

  const { hide } = (req.body ?? {}) as { hide?: unknown };
  if (typeof hide !== 'boolean') {
    return res.status(400).json({ error: 'hide must be true or false.' });
  }

  const db = getDatabase();
  const existing = await db.get<{ id: number; is_hidden: boolean }>(
    'SELECT id, is_hidden FROM gallery_comments WHERE id = ? AND event_id = ?',
    [commentId, eventId],
  );
  if (!existing) return res.status(404).json({ error: 'Comment not found.' });

  if (hide) {
    await db.run(
      `UPDATE gallery_comments
          SET is_hidden = TRUE, hidden_by = ?, hidden_at = CURRENT_TIMESTAMP,
              updated_at = CURRENT_TIMESTAMP, updated_by = ?
        WHERE id = ?`,
      [authReq.user?.id ?? null, authReq.user?.id ?? null, commentId],
    );
  } else {
    await db.run(
      `UPDATE gallery_comments
          SET is_hidden = FALSE, hidden_by = NULL, hidden_at = NULL,
              updated_at = CURRENT_TIMESTAMP, updated_by = ?
        WHERE id = ?`,
      [authReq.user?.id ?? null, commentId],
    );
  }

  return res.json({ id: Number(commentId), isHidden: hide });
}

export async function deleteComment(req: Request, res: Response): Promise<Response> {
  const authReq = req as AuthRequest;
  const { eventId, commentId } = req.params;

  const event = await requireEventAccess(authReq, res, eventId, { allowMembers: true });
  if (!event) return res as Response;

  const db = getDatabase();
  const existing = await db.get<{ id: number; user_id: number | null }>(
    'SELECT id, user_id FROM gallery_comments WHERE id = ? AND event_id = ?',
    [commentId, eventId],
  );
  if (!existing) return res.status(404).json({ error: 'Comment not found.' });

  const isAuthor = authReq.user?.id && existing.user_id === authReq.user.id;
  const isOwner = event.created_by === authReq.user?.id;
  const isAdmin = authReq.user?.role_id === 3;
  if (!isAuthor && !isOwner && !isAdmin) {
    return res.status(403).json({ error: 'Only the author, event owner, or an admin can delete.' });
  }

  await db.run('DELETE FROM gallery_comments WHERE id = ?', [commentId]);
  return res.json({ message: 'Comment deleted.' });
}
