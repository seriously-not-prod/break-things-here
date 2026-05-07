/**
 * RSVP access tokens (#411, #437).
 *
 * Each RSVP has at most one active token. The token is opaque (high-entropy
 * random), stored in `rsvp_access_tokens.token`, and used to render QR codes
 * and short-link URLs that resolve to the public guest RSVP page.
 *
 * The unauthenticated lookup endpoint exposes only the minimum information a
 * guest needs to confirm or update their RSVP: the event metadata, their own
 * RSVP row, and the list of custom questions/responses for the event.
 */

import type { Request, Response } from 'express';
import { randomBytes } from 'crypto';
import { getDatabase, type DatabaseAdapter } from '../db/database.js';
import { requireEventAccess } from '../utils/event-access.js';

interface AuthRequest extends Request {
  user?: { id: number; email: string; role_id: number };
}

const TOKEN_BYTES = 24; // 192 bits — base64url ≈ 32 chars

function newToken(): string {
  return randomBytes(TOKEN_BYTES)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/** Idempotent: returns the existing active token, or creates a new one. */
export async function ensureRsvpAccessToken(
  db: DatabaseAdapter,
  rsvpId: number,
): Promise<string> {
  const existing = await db.get<{ token: string }>(
    'SELECT token FROM rsvp_access_tokens WHERE rsvp_id = ? AND revoked_at IS NULL',
    [rsvpId],
  );
  if (existing) return existing.token;

  // Up to 3 attempts in case of an extremely unlikely token collision.
  for (let attempt = 0; attempt < 3; attempt++) {
    const candidate = newToken();
    try {
      await db.run(
        `INSERT INTO rsvp_access_tokens (rsvp_id, token)
         VALUES (?, ?)
         ON CONFLICT (rsvp_id) DO UPDATE SET token = EXCLUDED.token, revoked_at = NULL, created_at = CURRENT_TIMESTAMP`,
        [rsvpId, candidate],
      );
      return candidate;
    } catch (err) {
      // Likely a unique-token collision — try again
      if (attempt === 2) throw err;
    }
  }
  throw new Error('Could not allocate RSVP access token.');
}

/** POST /api/events/:eventId/rsvps/:id/token  — rotate or create */
export async function issueRsvpToken(req: Request, res: Response): Promise<Response> {
  const authReq = req as AuthRequest;
  const { eventId, id } = req.params;
  const event = await requireEventAccess(authReq, res, eventId, { ownerOnly: true });
  if (!event) return res as Response;

  const db = getDatabase();
  const rsvp = await db.get<{ id: number }>(
    'SELECT id FROM rsvps WHERE id = ? AND event_id = ?',
    [id, eventId],
  );
  if (!rsvp) return res.status(404).json({ error: 'RSVP not found.' });

  const rotate = req.body && (req.body as { rotate?: boolean }).rotate === true;
  if (rotate) {
    await db.run(
      'UPDATE rsvp_access_tokens SET revoked_at = CURRENT_TIMESTAMP WHERE rsvp_id = ? AND revoked_at IS NULL',
      [rsvp.id],
    );
  }
  const token = await ensureRsvpAccessToken(db, rsvp.id);
  return res.json({ token });
}

/** GET /api/public/rsvp/:token  — guest-facing lookup */
export async function lookupRsvpByToken(req: Request, res: Response): Promise<Response> {
  const { token } = req.params;
  if (!token || token.length < 16 || token.length > 64) {
    return res.status(404).json({ error: 'Token not found.' });
  }
  const db = getDatabase();
  const row = await db.get<{
    rsvp_id: number;
    event_id: number;
  }>(
    `SELECT t.rsvp_id, r.event_id
     FROM rsvp_access_tokens t
     JOIN rsvps r ON r.id = t.rsvp_id
     WHERE t.token = ? AND t.revoked_at IS NULL`,
    [token],
  );
  if (!row) return res.status(404).json({ error: 'Token not found.' });

  const rsvp = await db.get(
    `SELECT id, event_id, name, email, phone, status, guests, plus_one, plus_one_name,
            dietary_restriction, accessibility_needs, notes, waitlist_position, checked_in
     FROM rsvps WHERE id = ?`,
    [row.rsvp_id],
  );
  const event = await db.get(
    `SELECT id, title, description, location, date, end_date, capacity, currency_code
     FROM events WHERE id = ? AND deleted_at IS NULL`,
    [row.event_id],
  );
  if (!event) return res.status(404).json({ error: 'Event not found.' });

  const questions = await db.all(
    `SELECT q.id, q.prompt, q.question_type, q.options, q.required, q.sort_order,
            r.response
     FROM rsvp_questions q
     LEFT JOIN rsvp_question_responses r
       ON r.question_id = q.id AND r.rsvp_id = ?
     WHERE q.event_id = ?
     ORDER BY q.sort_order ASC, q.id ASC`,
    [row.rsvp_id, row.event_id],
  );

  return res.json({ rsvp, event, questions });
}
