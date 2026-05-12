/**
 * QR-based live check-in scanner workflow (#546, #589, #594, #595).
 *
 * The check-in scanner page on the frontend reads a guest's QR code (which
 * encodes their public RSVP URL `<PUBLIC_BASE_URL>/rsvp/<token>`) and POSTs
 * the token to this endpoint. The token resolves to a single RSVP row via
 * `rsvp_access_tokens.token`. We perform an idempotent check-in, capture an
 * `attendance_events` audit row, flag late arrivals when the event has
 * started, and emit an SSE event so the live attendance board updates in
 * real time.
 */
import type { Request, Response } from 'express';
import { getDatabase } from '../db/database.js';
import { requireEventAccess } from '../utils/event-access.js';
import { logActivity } from './activity-feed-controller.js';
import { broadcastAttendanceEvent } from './attendance-board-controller.js';

interface AuthRequest extends Request {
  user?: { id: number; email: string; role_id: number };
}

interface ScanResolveResult {
  rsvp: {
    id: number;
    event_id: number;
    name: string;
    email: string;
    status: string;
    canonical_status: string | null;
    checked_in: boolean;
    checked_in_at: string | null;
    late_arrival: boolean;
    arrival_delay_minutes: number | null;
  };
  alreadyCheckedIn: boolean;
}

function extractToken(input: string | undefined | null): string | null {
  if (!input) return null;
  const raw = String(input).trim();
  if (!raw) return null;
  // Accept either a bare token or a full URL — strip everything before the
  // last `/rsvp/` segment so QR payloads built from PUBLIC_BASE_URL also work.
  const match = raw.match(/\/rsvp\/([^/?#]+)/i);
  if (match?.[1]) return decodeURIComponent(match[1]);
  if (/^[A-Za-z0-9_-]{16,}$/.test(raw)) return raw;
  return null;
}

async function calculateLateArrival(
  eventId: number,
): Promise<{ isLate: boolean; delayMinutes: number | null }> {
  const db = getDatabase();
  const ev = await db.get<{ date: string | null }>(
    `SELECT date FROM events WHERE id = ?`,
    [eventId],
  );
  if (!ev?.date) return { isLate: false, delayMinutes: null };
  const start = new Date(ev.date);
  if (Number.isNaN(start.getTime())) return { isLate: false, delayMinutes: null };
  const now = new Date();
  const diffMs = now.getTime() - start.getTime();
  if (diffMs <= 0) return { isLate: false, delayMinutes: 0 };
  return { isLate: true, delayMinutes: Math.round(diffMs / 60000) };
}

/** POST /api/events/:eventId/checkin/scan  body: { token: string } */
export async function scanQr(req: Request, res: Response): Promise<Response> {
  const authReq = req as AuthRequest;
  const { eventId } = req.params;
  const event = await requireEventAccess(authReq, res, eventId, { allowMembers: true });
  if (!event) return res as Response;

  const token = extractToken((req.body?.token ?? req.body?.code) as string | undefined);
  if (!token) return res.status(400).json({ error: 'A scan token is required.' });

  const db = getDatabase();
  const tokenRow = await db.get<{ rsvp_id: number; revoked_at: string | null }>(
    `SELECT rsvp_id, revoked_at FROM rsvp_access_tokens WHERE token = ?`,
    [token],
  );
  if (!tokenRow) return res.status(404).json({ error: 'Unknown QR code.' });
  if (tokenRow.revoked_at) return res.status(410).json({ error: 'This QR code has been revoked.' });

  const rsvp = await db.get<ScanResolveResult['rsvp']>(
    `SELECT id, event_id, name, email, status, canonical_status, checked_in, checked_in_at,
            late_arrival, arrival_delay_minutes
     FROM rsvps WHERE id = ? AND event_id = ?`,
    [tokenRow.rsvp_id, eventId],
  );
  if (!rsvp) return res.status(404).json({ error: 'RSVP not found for this event.' });

  const alreadyCheckedIn = !!rsvp.checked_in;
  let updated = rsvp;

  if (!alreadyCheckedIn) {
    const late = await calculateLateArrival(Number(eventId));
    await db.run(
      `UPDATE rsvps
       SET checked_in = TRUE,
           checked_in_at = CURRENT_TIMESTAMP,
           canonical_status = 'checked_in',
           late_arrival = ?,
           arrival_delay_minutes = ?,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [late.isLate, late.delayMinutes, rsvp.id],
    );
    updated = (await db.get<ScanResolveResult['rsvp']>(
      `SELECT id, event_id, name, email, status, canonical_status, checked_in, checked_in_at,
              late_arrival, arrival_delay_minutes FROM rsvps WHERE id = ?`,
      [rsvp.id],
    )) ?? rsvp;

    await db.run(
      `INSERT INTO attendance_events (event_id, rsvp_id, action, source, actor_id, metadata)
       VALUES (?, ?, 'checked_in', 'qr_scan', ?, ?::jsonb)`,
      [
        eventId,
        rsvp.id,
        authReq.user?.id ?? null,
        JSON.stringify({ late: late.isLate, delay_minutes: late.delayMinutes }),
      ],
    ).catch(() => undefined);

    await logActivity(
      eventId,
      authReq.user?.id ?? null,
      'guest_checked_in',
      `${rsvp.name} scanned in${late.isLate ? ` (late by ${late.delayMinutes ?? '?'} min)` : ''}`,
      `/events/${eventId}`,
    ).catch(() => undefined);

    broadcastAttendanceEvent(Number(eventId), {
      type: 'checkin',
      rsvp: updated,
      timestamp: new Date().toISOString(),
    });
  } else {
    // Still record an audit row for "scan attempt after check-in" so we have a
    // record of duplicates from the door scanner.
    await db.run(
      `INSERT INTO attendance_events (event_id, rsvp_id, action, source, actor_id, metadata)
       VALUES (?, ?, 'scanned', 'qr_scan', ?, ?::jsonb)`,
      [eventId, rsvp.id, authReq.user?.id ?? null, JSON.stringify({ duplicate: true })],
    ).catch(() => undefined);
  }

  const result: ScanResolveResult = { rsvp: updated, alreadyCheckedIn };
  return res.status(alreadyCheckedIn ? 200 : 201).json(result);
}

/** POST /api/events/:eventId/checkin/:rsvpId/undo */
export async function undoCheckin(req: Request, res: Response): Promise<Response> {
  const authReq = req as AuthRequest;
  const { eventId, rsvpId } = req.params;
  const event = await requireEventAccess(authReq, res, eventId, { allowMembers: true });
  if (!event) return res as Response;
  const db = getDatabase();
  const rsvp = await db.get<{ id: number; canonical_status: string | null }>(
    `SELECT id, canonical_status FROM rsvps WHERE id = ? AND event_id = ?`,
    [rsvpId, eventId],
  );
  if (!rsvp) return res.status(404).json({ error: 'RSVP not found.' });
  await db.run(
    `UPDATE rsvps SET checked_in = FALSE, checked_in_at = NULL,
                     late_arrival = FALSE, arrival_delay_minutes = NULL,
                     canonical_status = CASE WHEN canonical_status = 'checked_in' THEN 'confirmed' ELSE canonical_status END,
                     updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    [rsvp.id],
  );
  await db.run(
    `INSERT INTO attendance_events (event_id, rsvp_id, action, source, actor_id)
     VALUES (?, ?, 'undo_checkin', 'manual', ?)`,
    [eventId, rsvp.id, authReq.user?.id ?? null],
  ).catch(() => undefined);
  broadcastAttendanceEvent(Number(eventId), {
    type: 'undo_checkin',
    rsvpId: rsvp.id,
    timestamp: new Date().toISOString(),
  });
  return res.json({ undone: true });
}

/** POST /api/events/:eventId/checkin/mark-no-show */
export async function markNoShow(req: Request, res: Response): Promise<Response> {
  const authReq = req as AuthRequest;
  const { eventId } = req.params;
  const event = await requireEventAccess(authReq, res, eventId, { ownerOnly: true });
  if (!event) return res as Response;
  const { rsvpIds } = (req.body ?? {}) as { rsvpIds?: number[] };
  if (!Array.isArray(rsvpIds) || rsvpIds.length === 0) {
    return res.status(400).json({ error: 'rsvpIds[] is required.' });
  }
  const db = getDatabase();
  const placeholders = rsvpIds.map(() => '?').join(', ');
  await db.run(
    `UPDATE rsvps SET canonical_status = 'no_show', updated_at = CURRENT_TIMESTAMP
     WHERE event_id = ? AND id IN (${placeholders}) AND checked_in = FALSE`,
    [eventId, ...rsvpIds],
  );
  for (const id of rsvpIds) {
    await db.run(
      `INSERT INTO attendance_events (event_id, rsvp_id, action, source, actor_id)
       VALUES (?, ?, 'no_show', 'manual', ?)`,
      [eventId, id, authReq.user?.id ?? null],
    ).catch(() => undefined);
  }
  return res.json({ marked: rsvpIds.length });
}
