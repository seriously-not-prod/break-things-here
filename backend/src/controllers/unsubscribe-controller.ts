/**
 * Public unsubscribe endpoint (#545, #590).
 *
 * Receives `GET/POST /api/public/unsubscribe/:token` from emails. Sets
 * `rsvps.unsubscribed_at` so future bulk sends skip the recipient. Returns a
 * minimal HTML confirmation page when called via GET (browser click) and
 * JSON when called via POST (API/AJAX). Idempotent — repeated calls are
 * safe and report the latest state.
 */
import type { Request, Response } from 'express';
import { getDatabase } from '../db/database.js';

interface RsvpRow {
  id: number;
  event_id: number;
  name: string;
  email: string;
  unsubscribed_at: string | null;
}

function htmlBody(message: string): string {
  return `<!doctype html>
<html><head><meta charset="utf-8"><title>Email preferences</title>
<style>body{font-family:system-ui,Segoe UI,sans-serif;max-width:520px;margin:80px auto;padding:0 16px;color:#1f2937}
h1{font-size:1.4rem;margin-bottom:.5rem}p{line-height:1.5;color:#4b5563}</style></head>
<body><h1>Email preferences updated</h1><p>${message}</p></body></html>`;
}

async function applyUnsubscribe(token: string): Promise<RsvpRow | null> {
  const db = getDatabase();
  const row = await db.get<RsvpRow>(
    `SELECT id, event_id, name, email, unsubscribed_at FROM rsvps WHERE unsubscribe_token = ?`,
    [token],
  );
  if (!row) return null;
  if (!row.unsubscribed_at) {
    await db.run(
      `UPDATE rsvps SET unsubscribed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [row.id],
    );
    return { ...row, unsubscribed_at: new Date().toISOString() };
  }
  return row;
}

/** GET /api/public/unsubscribe/:token */
export async function getUnsubscribe(req: Request, res: Response): Promise<Response> {
  const { token } = req.params;
  const row = await applyUnsubscribe(token);
  if (!row) {
    res.status(404);
    return res.type('html').send(htmlBody('We could not find your record. The link may have expired.'));
  }
  return res.type('html').send(
    htmlBody(`You have been unsubscribed. We will no longer send invitation, reminder, or template-based emails to <strong>${row.email}</strong>.`),
  );
}

/** POST /api/public/unsubscribe/:token */
export async function postUnsubscribe(req: Request, res: Response): Promise<Response> {
  const { token } = req.params;
  const row = await applyUnsubscribe(token);
  if (!row) return res.status(404).json({ error: 'Token not found.' });
  return res.json({
    email: row.email,
    unsubscribed_at: row.unsubscribed_at,
  });
}

/** POST /api/public/unsubscribe/:token/resubscribe — admin re-enable via guest action */
export async function resubscribe(req: Request, res: Response): Promise<Response> {
  const { token } = req.params;
  const db = getDatabase();
  const row = await db.get<RsvpRow>(
    `SELECT id, event_id, name, email, unsubscribed_at FROM rsvps WHERE unsubscribe_token = ?`,
    [token],
  );
  if (!row) return res.status(404).json({ error: 'Token not found.' });
  await db.run(
    `UPDATE rsvps SET unsubscribed_at = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
    [row.id],
  );
  return res.json({ email: row.email, unsubscribed_at: null });
}
