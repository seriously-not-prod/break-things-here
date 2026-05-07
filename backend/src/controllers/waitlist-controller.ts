/**
 * Waitlist promotion logic for over-capacity RSVPs (#413, #442).
 *
 * Waitlist semantics:
 *  - An RSVP is on the waitlist iff `waitlist_position` is non-null.
 *  - `status` is preserved (typically 'Going') so historical reporting reads
 *    like the user always intended to attend; the waitlist column simply
 *    answers "is this seat being held or queued?".
 *  - Position 1 is the next to be promoted. Positions are not guaranteed
 *    contiguous after manual edits, but `promoteWaitlistInternal` always
 *    promotes in ascending position order.
 *
 * Promotion is triggered:
 *  - explicitly via POST /events/:eventId/waitlist/promote
 *  - implicitly when capacity is increased or a 'Going' RSVP is removed —
 *    callers (events controller, rsvps controller) call `runPromotion()`.
 */

import type { Request, Response } from 'express';
import { getDatabase, getPool, type DatabaseAdapter } from '../db/database.js';
import { requireEventAccess } from '../utils/event-access.js';
import { logActivity } from './activity-feed-controller.js';

interface AuthRequest extends Request {
  user?: { id: number; email: string; role_id: number };
}

interface WaitlistedRow {
  id: number;
  event_id: number;
  name: string;
  email: string;
  guests: number;
  status: string;
  waitlist_position: number;
}

export interface PromotionResult {
  promoted: Array<{ id: number; name: string; email: string; guests: number }>;
  remainingCapacity: number | null;
  waitlistSize: number;
}

async function getEventCapacity(
  db: DatabaseAdapter,
  eventId: number,
): Promise<number | null> {
  const ev = await db.get<{ capacity: number | null }>(
    'SELECT capacity FROM events WHERE id = ? AND deleted_at IS NULL',
    [eventId],
  );
  return ev?.capacity ?? null;
}

async function getGoingTotal(
  db: DatabaseAdapter,
  eventId: number,
): Promise<number> {
  const row = await db.get<{ total: number }>(
    `SELECT COALESCE(SUM(guests), 0)::int AS total FROM rsvps
     WHERE event_id = ? AND status = 'Going' AND waitlist_position IS NULL`,
    [eventId],
  );
  return row?.total ?? 0;
}

/**
 * Move an RSVP onto the waitlist. Returns the assigned position.
 * No-ops when the RSVP is already waitlisted.
 */
export async function addToWaitlist(
  db: DatabaseAdapter,
  rsvpId: number,
  eventId: number,
): Promise<number> {
  const existing = await db.get<{ waitlist_position: number | null }>(
    'SELECT waitlist_position FROM rsvps WHERE id = ? AND event_id = ?',
    [rsvpId, eventId],
  );
  if (existing?.waitlist_position) return existing.waitlist_position;

  const max = await db.get<{ max: number | null }>(
    'SELECT MAX(waitlist_position) AS max FROM rsvps WHERE event_id = ?',
    [eventId],
  );
  const nextPos = (max?.max ?? 0) + 1;
  await db.run(
    `UPDATE rsvps
     SET waitlist_position = ?, waitlisted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    [nextPos, rsvpId],
  );
  return nextPos;
}

/**
 * Promote as many waitlisted guests as fit into the remaining capacity. Runs
 * inside the supplied client (or starts/commits its own transaction). Safe to
 * call repeatedly — if there is no spare capacity it's a no-op.
 */
export async function runPromotion(eventId: number): Promise<PromotionResult> {
  const pool = getPool();
  const client = await pool.connect();
  const promoted: PromotionResult['promoted'] = [];
  try {
    await client.query('BEGIN');

    const capRes = await client.query<{ capacity: number | null }>(
      'SELECT capacity FROM events WHERE id = $1 AND deleted_at IS NULL FOR UPDATE',
      [eventId],
    );
    const capacity = capRes.rows[0]?.capacity ?? null;
    const goingRes = await client.query<{ total: number }>(
      `SELECT COALESCE(SUM(guests), 0)::int AS total FROM rsvps
       WHERE event_id = $1 AND status = 'Going' AND waitlist_position IS NULL`,
      [eventId],
    );
    const going = goingRes.rows[0]?.total ?? 0;

    const waitlistRes = await client.query<WaitlistedRow>(
      `SELECT id, event_id, name, email, guests, status, waitlist_position
       FROM rsvps
       WHERE event_id = $1 AND waitlist_position IS NOT NULL
       ORDER BY waitlist_position ASC, id ASC
       FOR UPDATE`,
      [eventId],
    );

    let consumed = going;
    for (const row of waitlistRes.rows) {
      if (capacity !== null && consumed + row.guests > capacity) continue;
      consumed += row.guests;
      await client.query(
        `UPDATE rsvps SET waitlist_position = NULL, promoted_at = CURRENT_TIMESTAMP,
                          status = 'Going', updated_at = CURRENT_TIMESTAMP
         WHERE id = $1`,
        [row.id],
      );
      promoted.push({ id: row.id, name: row.name, email: row.email, guests: row.guests });
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }

  // Side effects (notifications, activity feed) live outside the transaction
  // so a downstream failure cannot roll back the promotion.
  for (const p of promoted) {
    await logActivity(
      eventId,
      null,
      'waitlist_promoted',
      `${p.name} promoted from the waitlist`,
      `/events/${eventId}/guests`,
    ).catch(() => undefined);
  }

  const db = getDatabase();
  const capacity = await getEventCapacity(db, eventId);
  const going = await getGoingTotal(db, eventId);
  const waitlistSize =
    (
      await db.get<{ n: number }>(
        'SELECT COUNT(*)::int AS n FROM rsvps WHERE event_id = ? AND waitlist_position IS NOT NULL',
        [eventId],
      )
    )?.n ?? 0;

  return {
    promoted,
    remainingCapacity: capacity === null ? null : Math.max(capacity - going, 0),
    waitlistSize,
  };
}

/** GET /api/events/:eventId/waitlist */
export async function listWaitlist(req: Request, res: Response): Promise<Response> {
  const authReq = req as AuthRequest;
  const { eventId } = req.params;
  const event = await requireEventAccess(authReq, res, eventId, { allowMembers: true });
  if (!event) return res as Response;

  const db = getDatabase();
  const rows = await db.all(
    `SELECT id, name, email, phone, guests, status, waitlist_position, waitlisted_at, created_at
     FROM rsvps
     WHERE event_id = ? AND waitlist_position IS NOT NULL
     ORDER BY waitlist_position ASC, id ASC`,
    [eventId],
  );
  const capacity = await getEventCapacity(db, Number(eventId));
  const going = await getGoingTotal(db, Number(eventId));
  return res.json({
    waitlist: rows,
    capacity,
    confirmedGuests: going,
    remainingCapacity: capacity === null ? null : Math.max(capacity - going, 0),
  });
}

/** POST /api/events/:eventId/waitlist  — add an existing RSVP to the waitlist */
export async function addRsvpToWaitlist(req: Request, res: Response): Promise<Response> {
  const authReq = req as AuthRequest;
  const { eventId } = req.params;
  const event = await requireEventAccess(authReq, res, eventId, { ownerOnly: true });
  if (!event) return res as Response;

  const { rsvpId } = (req.body ?? {}) as { rsvpId?: number };
  if (!Number.isInteger(rsvpId) || (rsvpId as number) <= 0) {
    return res.status(400).json({ error: 'rsvpId is required.' });
  }
  const db = getDatabase();
  const exists = await db.get<{ id: number }>(
    'SELECT id FROM rsvps WHERE id = ? AND event_id = ?',
    [rsvpId, eventId],
  );
  if (!exists) return res.status(404).json({ error: 'RSVP not found.' });
  const position = await addToWaitlist(db, rsvpId as number, Number(eventId));
  return res.status(201).json({ position });
}

/** POST /api/events/:eventId/waitlist/promote  — run promotion explicitly */
export async function promoteWaitlist(req: Request, res: Response): Promise<Response> {
  const authReq = req as AuthRequest;
  const { eventId } = req.params;
  const event = await requireEventAccess(authReq, res, eventId, { ownerOnly: true });
  if (!event) return res as Response;
  try {
    const result = await runPromotion(Number(eventId));
    return res.json(result);
  } catch (err) {
    console.error('promoteWaitlist failed:', err);
    return res.status(500).json({ error: 'Promotion failed.' });
  }
}

/** DELETE /api/events/:eventId/waitlist/:id  — remove an entry */
export async function removeFromWaitlist(req: Request, res: Response): Promise<Response> {
  const authReq = req as AuthRequest;
  const { eventId, id } = req.params;
  const event = await requireEventAccess(authReq, res, eventId, { ownerOnly: true });
  if (!event) return res as Response;
  const db = getDatabase();
  const row = await db.get<{ id: number }>(
    'SELECT id FROM rsvps WHERE id = ? AND event_id = ? AND waitlist_position IS NOT NULL',
    [id, eventId],
  );
  if (!row) return res.status(404).json({ error: 'Waitlist entry not found.' });
  await db.run(
    `UPDATE rsvps SET waitlist_position = NULL, waitlisted_at = NULL, updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    [id],
  );
  return res.json({ removed: true });
}
