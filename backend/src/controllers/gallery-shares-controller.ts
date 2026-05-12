/**
 * Gallery Share Links (#619)
 *
 * Owner/admin/event-member generates a public share token that maps to either
 * the whole event gallery or a single album. The endpoint that resolves a
 * token (`GET /api/public/gallery/:token`) intentionally lives here so the
 * password-hash check is one hop from the token row.
 */

import { Request, Response } from 'express';
import crypto from 'crypto';
import bcrypt from 'bcrypt';
import { getDatabase } from '../db/database.js';
import { requireEventAccess } from '../utils/event-access.js';

interface AuthRequest extends Request {
  user?: { id: number; email: string; role_id: number };
}

interface ShareLinkRow {
  id: number;
  event_id: number;
  album_id: number | null;
  token: string;
  password_hash: string | null;
  allow_download: boolean;
  expires_at: string | null;
  view_count: number;
  last_viewed_at: string | null;
  revoked_at: string | null;
  created_by: number | null;
  created_at: string;
  updated_at: string;
}

function generateToken(): string {
  // 32-byte url-safe base64 → 43 chars, plenty of entropy.
  return crypto.randomBytes(32).toString('base64url');
}

function sanitiseLink(row: ShareLinkRow): Record<string, unknown> {
  return {
    id: row.id,
    eventId: row.event_id,
    albumId: row.album_id,
    token: row.token,
    requiresPassword: Boolean(row.password_hash),
    allowDownload: row.allow_download,
    expiresAt: row.expires_at,
    viewCount: row.view_count,
    lastViewedAt: row.last_viewed_at,
    revokedAt: row.revoked_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listShareLinks(req: Request, res: Response): Promise<Response> {
  const authReq = req as AuthRequest;
  const { eventId } = req.params;
  const event = await requireEventAccess(authReq, res, eventId, { allowMembers: true });
  if (!event) return res as Response;

  const db = getDatabase();
  const rows = await db.all<ShareLinkRow>(
    `SELECT id, event_id, album_id, token, password_hash, allow_download, expires_at,
            view_count, last_viewed_at, revoked_at, created_by, created_at, updated_at
       FROM gallery_share_links
      WHERE event_id = ?
      ORDER BY created_at DESC`,
    [eventId],
  );
  return res.json({ shareLinks: rows.map(sanitiseLink) });
}

export async function createShareLink(req: Request, res: Response): Promise<Response> {
  const authReq = req as AuthRequest;
  const { eventId } = req.params;
  const event = await requireEventAccess(authReq, res, eventId, { allowMembers: true });
  if (!event) return res as Response;

  const { albumId, password, allowDownload, expiresAt } = (req.body ?? {}) as {
    albumId?: unknown;
    password?: unknown;
    allowDownload?: unknown;
    expiresAt?: unknown;
  };

  let targetAlbumId: number | null = null;
  if (albumId !== undefined && albumId !== null && albumId !== '') {
    const n = Number(albumId);
    if (!Number.isFinite(n)) {
      return res.status(400).json({ error: 'albumId must be numeric.' });
    }
    const db = getDatabase();
    const album = await db.get<{ id: number }>(
      'SELECT id FROM gallery_albums WHERE id = ? AND event_id = ?',
      [n, eventId],
    );
    if (!album) return res.status(404).json({ error: 'Album not found.' });
    targetAlbumId = n;
  }

  let passwordHash: string | null = null;
  if (typeof password === 'string' && password.length > 0) {
    if (password.length < 6 || password.length > 200) {
      return res
        .status(400)
        .json({ error: 'password must be between 6 and 200 characters.' });
    }
    passwordHash = await bcrypt.hash(password, 10);
  }

  let expiresAtIso: string | null = null;
  if (expiresAt !== undefined && expiresAt !== null && expiresAt !== '') {
    const d = new Date(String(expiresAt));
    if (Number.isNaN(d.getTime())) {
      return res.status(400).json({ error: 'expiresAt is not a valid timestamp.' });
    }
    if (d.getTime() < Date.now()) {
      return res.status(400).json({ error: 'expiresAt must be in the future.' });
    }
    expiresAtIso = d.toISOString();
  }

  const db = getDatabase();
  const token = generateToken();
  const result = await db.run(
    `INSERT INTO gallery_share_links
       (event_id, album_id, token, password_hash, allow_download, expires_at, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     RETURNING id`,
    [
      eventId,
      targetAlbumId,
      token,
      passwordHash,
      allowDownload === undefined ? true : Boolean(allowDownload),
      expiresAtIso,
      authReq.user?.id ?? null,
    ],
  );

  const row = await db.get<ShareLinkRow>(
    `SELECT id, event_id, album_id, token, password_hash, allow_download, expires_at,
            view_count, last_viewed_at, revoked_at, created_by, created_at, updated_at
       FROM gallery_share_links WHERE id = ?`,
    [result.lastID],
  );
  if (!row) return res.status(500).json({ error: 'Failed to create share link.' });
  return res.status(201).json(sanitiseLink(row));
}

export async function revokeShareLink(req: Request, res: Response): Promise<Response> {
  const authReq = req as AuthRequest;
  const { eventId, id } = req.params;
  const event = await requireEventAccess(authReq, res, eventId, { allowMembers: true });
  if (!event) return res as Response;

  const db = getDatabase();
  const existing = await db.get<{ id: number; revoked_at: string | null }>(
    'SELECT id, revoked_at FROM gallery_share_links WHERE id = ? AND event_id = ?',
    [id, eventId],
  );
  if (!existing) return res.status(404).json({ error: 'Share link not found.' });
  if (existing.revoked_at) {
    return res.status(409).json({ error: 'Share link is already revoked.' });
  }

  await db.run(
    `UPDATE gallery_share_links
        SET revoked_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?`,
    [id],
  );
  return res.json({ message: 'Share link revoked.' });
}

/**
 * Public resolution endpoint. Token + optional password unlocks a filtered
 * view of the gallery. The response only includes items the link is allowed
 * to surface (album-scoped if albumId is set; only `public` or `event`-visible
 * items if the whole gallery is shared).
 */
export async function resolveShareLink(req: Request, res: Response): Promise<Response> {
  const { token } = req.params;
  // Passwords are only accepted in the request body, never the query string,
  // so they don't leak into access logs or browser history.
  const password =
    req.method === 'POST'
      ? (req.body as { password?: string } | undefined)?.password
      : undefined;

  if (!token || token.length > 100) {
    return res.status(400).json({ error: 'Invalid token.' });
  }

  const db = getDatabase();
  const link = await db.get<ShareLinkRow>(
    `SELECT id, event_id, album_id, token, password_hash, allow_download, expires_at,
            view_count, last_viewed_at, revoked_at
       FROM gallery_share_links WHERE token = ? AND revoked_at IS NULL`,
    [token],
  );
  if (!link) return res.status(404).json({ error: 'Share link not found or revoked.' });
  if (link.expires_at && new Date(link.expires_at).getTime() < Date.now()) {
    return res.status(410).json({ error: 'Share link has expired.' });
  }

  if (link.password_hash) {
    if (typeof password !== 'string' || !password) {
      return res.status(401).json({ error: 'Password required.', passwordRequired: true });
    }
    const ok = await bcrypt.compare(password, link.password_hash);
    if (!ok) return res.status(403).json({ error: 'Incorrect password.' });
  }

  // Build the visible items.
  const params: (string | number)[] = [link.event_id];
  let where = `event_id = ? AND moderation_status = 'approved' AND mime_type LIKE 'image/%'
               AND visibility IN ('event','public')`;
  if (link.album_id !== null) {
    where += ` AND album_id = ?`;
    params.push(link.album_id);
  }
  const items = await db.all(
    `SELECT id, original_name, file_name, mime_type, file_size, caption, album_id,
            thumbnail_url, medium_url, allow_download
       FROM event_documents
      WHERE ${where}
      ORDER BY created_at DESC
      LIMIT 500`,
    params,
  );

  // Track view.
  await db.run(
    `UPDATE gallery_share_links
        SET view_count = view_count + 1, last_viewed_at = CURRENT_TIMESTAMP,
            updated_at = CURRENT_TIMESTAMP
      WHERE id = ?`,
    [link.id],
  );

  return res.json({
    eventId: link.event_id,
    albumId: link.album_id,
    allowDownload: link.allow_download,
    expiresAt: link.expires_at,
    items: items.map((row: Record<string, unknown>) => ({
      id: row['id'],
      fileName: row['file_name'],
      originalName: row['original_name'],
      mimeType: row['mime_type'],
      fileSize: row['file_size'],
      caption: row['caption'],
      albumId: row['album_id'],
      thumbnailUrl: row['thumbnail_url'],
      mediumUrl: row['medium_url'],
      allowDownload: row['allow_download'],
      url: `/api/uploads/event-documents/${String(row['file_name']).replace(/[^a-zA-Z0-9._-]/g, '_')}`,
    })),
  });
}
