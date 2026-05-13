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
import { getDatabase, type DatabaseAdapter } from '../db/database.js';
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
  db: DatabaseAdapter,
  eventId: number,
): Promise<{ isLate: boolean; delayMinutes: number | null }> {
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

async function runInTransaction<T>(fn: (_tx: DatabaseAdapter) => Promise<T>): Promise<T> {
  const db = getDatabase();
  if (typeof db.transaction === 'function') {
    return db.transaction(fn);
  }
  // Fallback for adapters without a transaction implementation (e.g. test
  // doubles). Callers still get atomic logic on the production adapter.
  return fn(db);
}

function validateRsvpIdArray(input: unknown): { ok: true; ids: number[] } | { ok: false; error: string } {
  if (!Array.isArray(input) || input.length === 0) {
    return { ok: false, error: 'rsvpIds[] is required.' };
  }
  const safe = input.filter((id) => Number.isInteger(id) && (id as number) > 0) as number[];
  if (safe.length !== input.length) {
    return { ok: false, error: 'Invalid rsvpIds.' };
  }
  return { ok: true, ids: safe };
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

  let alreadyCheckedIn = false;
  let updated: ScanResolveResult['rsvp'] | null = null;
  let lateInfo: { isLate: boolean; delayMinutes: number | null } = { isLate: false, delayMinutes: null };
  let previousCanonicalStatus: string | null = null;

  try {
    const txResult = await runInTransaction(async (tx) => {
      const rsvp = await tx.get<ScanResolveResult['rsvp']>(
        `SELECT id, event_id, name, email, status, canonical_status, checked_in, checked_in_at,
                late_arrival, arrival_delay_minutes
         FROM rsvps WHERE id = ? AND event_id = ?`,
        [tokenRow.rsvp_id, eventId],
      );
      if (!rsvp) return { kind: 'not-found' as const };
      previousCanonicalStatus = rsvp.canonical_status;
      const dupe = !!rsvp.checked_in;
      if (dupe) {
        // Idempotent: still record an audit row for the duplicate scan, but
        // perform NO writes to the rsvp row itself.
        await tx.run(
          `INSERT INTO attendance_events (event_id, rsvp_id, action, source, actor_id, metadata)
           VALUES (?, ?, 'scanned', 'qr_scan', ?, ?::jsonb)`,
          [eventId, rsvp.id, authReq.user?.id ?? null, JSON.stringify({ duplicate: true })],
        );
        return { kind: 'duplicate' as const, rsvp };
      }
      const late = await calculateLateArrival(tx, Number(eventId));
      await tx.run(
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
      const fresh = (await tx.get<ScanResolveResult['rsvp']>(
        `SELECT id, event_id, name, email, status, canonical_status, checked_in, checked_in_at,
                late_arrival, arrival_delay_minutes FROM rsvps WHERE id = ?`,
        [rsvp.id],
      )) ?? rsvp;
      // Capture the previous canonical status in the audit row so undoCheckin
      // can restore it precisely (#PR-644 critical fix).
      await tx.run(
        `INSERT INTO attendance_events (event_id, rsvp_id, action, source, actor_id, metadata)
         VALUES (?, ?, 'checked_in', 'qr_scan', ?, ?::jsonb)`,
        [
          eventId,
          rsvp.id,
          authReq.user?.id ?? null,
          JSON.stringify({
            late: late.isLate,
            delay_minutes: late.delayMinutes,
            previous_canonical_status: previousCanonicalStatus,
          }),
        ],
      );
      return { kind: 'checked-in' as const, rsvp: fresh, late };
    });

    if (txResult.kind === 'not-found') {
      return res.status(404).json({ error: 'RSVP not found for this event.' });
    }
    alreadyCheckedIn = txResult.kind === 'duplicate';
    updated = txResult.rsvp;
    if (txResult.kind === 'checked-in') lateInfo = txResult.late;
  } catch (err) {
    console.error('[qr-checkin] scan transaction failed:', err);
    return res.status(500).json({ error: 'Failed to record check-in.' });
  }

  // Post-commit side effects: activity feed + SSE broadcast. Failures here
  // must not undo the persisted state, but they are logged.
  if (!alreadyCheckedIn && updated) {
    await logActivity(
      eventId,
      authReq.user?.id ?? null,
      'guest_checked_in',
      `${updated.name} scanned in${lateInfo.isLate ? ` (late by ${lateInfo.delayMinutes ?? '?'} min)` : ''}`,
      `/events/${eventId}`,
    ).catch((err) => console.error('[qr-checkin] activity log failed:', err));

    broadcastAttendanceEvent(Number(eventId), {
      type: 'checkin',
      rsvp: updated,
      timestamp: new Date().toISOString(),
    });
  }

  const result: ScanResolveResult = { rsvp: updated!, alreadyCheckedIn };
  return res.status(alreadyCheckedIn ? 200 : 201).json(result);
}

/** POST /api/events/:eventId/checkin/:rsvpId/undo */
export async function undoCheckin(req: Request, res: Response): Promise<Response> {
  const authReq = req as AuthRequest;
  const { eventId, rsvpId } = req.params;
  const event = await requireEventAccess(authReq, res, eventId, { allowMembers: true });
  if (!event) return res as Response;

  // Reject non-numeric route ids early so we never feed garbage to the DB.
  const numericRsvpId = Number(rsvpId);
  if (!Number.isInteger(numericRsvpId) || numericRsvpId <= 0) {
    return res.status(400).json({ error: 'Invalid rsvpId.' });
  }

  try {
    const result = await runInTransaction(async (tx) => {
      const rsvp = await tx.get<{ id: number; canonical_status: string | null; checked_in: boolean }>(
        `SELECT id, canonical_status, checked_in FROM rsvps WHERE id = ? AND event_id = ?`,
        [numericRsvpId, eventId],
      );
      if (!rsvp) return { kind: 'not-found' as const };

      // Restore the canonical status captured during the most recent
      // `checked_in` audit row. If the metadata is missing (e.g. legacy data
      // pre-fix), fall back to 'confirmed' since the guest had to be confirmed
      // to scan in.
      const audit = await tx.get<{ metadata: { previous_canonical_status?: string | null } | null }>(
        `SELECT metadata FROM attendance_events
          WHERE event_id = ? AND rsvp_id = ? AND action = 'checked_in'
          ORDER BY occurred_at DESC, id DESC
          LIMIT 1`,
        [eventId, numericRsvpId],
      );
      const previous = audit?.metadata?.previous_canonical_status;
      const restoreTo = previous && previous !== 'checked_in' ? previous : 'confirmed';

      const update = await tx.run(
        `UPDATE rsvps SET checked_in = FALSE, checked_in_at = NULL,
                         late_arrival = FALSE, arrival_delay_minutes = NULL,
                         canonical_status = ?,
                         updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [restoreTo, rsvp.id],
      );
      await tx.run(
        `INSERT INTO attendance_events (event_id, rsvp_id, action, source, actor_id, metadata)
         VALUES (?, ?, 'undo_checkin', 'manual', ?, ?::jsonb)`,
        [
          eventId,
          rsvp.id,
          authReq.user?.id ?? null,
          JSON.stringify({ restored_canonical_status: restoreTo }),
        ],
      );
      return { kind: 'ok' as const, changes: update.changes, restoreTo };
    });

    if (result.kind === 'not-found') {
      return res.status(404).json({ error: 'RSVP not found.' });
    }
    broadcastAttendanceEvent(Number(eventId), {
      type: 'undo_checkin',
      rsvpId: numericRsvpId,
      restoredCanonicalStatus: result.restoreTo,
      timestamp: new Date().toISOString(),
    });
    return res.json({ undone: true, canonical_status: result.restoreTo });
  } catch (err) {
    console.error('[qr-checkin] undo transaction failed:', err);
    return res.status(500).json({ error: 'Failed to undo check-in.' });
  }
}

/** POST /api/events/:eventId/checkin/mark-no-show */
export async function markNoShow(req: Request, res: Response): Promise<Response> {
  const authReq = req as AuthRequest;
  const { eventId } = req.params;
  const event = await requireEventAccess(authReq, res, eventId, { ownerOnly: true });
  if (!event) return res as Response;
  const { rsvpIds } = (req.body ?? {}) as { rsvpIds?: unknown };
  const validated = validateRsvpIdArray(rsvpIds);
  if (!validated.ok) {
    return res.status(400).json({ error: validated.error });
  }
  const ids = validated.ids;
  try {
    const result = await runInTransaction(async (tx) => {
      const placeholders = ids.map(() => '?').join(', ');
      const upd = await tx.run(
        `UPDATE rsvps SET canonical_status = 'no_show', updated_at = CURRENT_TIMESTAMP
         WHERE event_id = ? AND id IN (${placeholders}) AND checked_in = FALSE`,
        [eventId, ...ids],
      );
      for (const id of ids) {
        await tx.run(
          `INSERT INTO attendance_events (event_id, rsvp_id, action, source, actor_id)
           VALUES (?, ?, 'no_show', 'manual', ?)`,
          [eventId, id, authReq.user?.id ?? null],
        );
      }
      return upd.changes;
    });
    return res.json({ marked: result });
  } catch (err) {
    console.error('[qr-checkin] mark-no-show transaction failed:', err);
    return res.status(500).json({ error: 'Failed to mark no-show.' });
  }
}
