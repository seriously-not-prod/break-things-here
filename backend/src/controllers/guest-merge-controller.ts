/**
 * Guest deduplication and merge endpoints (#411, #435).
 */

import type { Request, Response } from 'express';
import { getDatabase, getPool } from '../db/database.js';
import { requireEventAccess } from '../utils/event-access.js';
import { logActivity } from './activity-feed-controller.js';
import {
  detectDuplicateClusters,
  type DuplicateCandidateRow,
} from '../utils/duplicate-detection.js';

interface AuthRequest extends Request {
  user?: { id: number; email: string; role_id: number };
}

interface RsvpRow extends DuplicateCandidateRow {
  event_id: number;
  notes: string | null;
  source: string | null;
  dietary_restriction: string | null;
  accessibility_needs: string | null;
  plus_one: boolean;
  plus_one_name: string | null;
  guest_group: string | null;
  rsvp_deadline: string | null;
  checked_in: boolean;
  checked_in_at: string | null;
  waitlist_position: number | null;
}

const RSVP_COLUMNS =
  'id, event_id, name, email, phone, status, guests, notes, source, ' +
  'dietary_restriction, accessibility_needs, plus_one, plus_one_name, ' +
  'guest_group, rsvp_deadline, checked_in, checked_in_at, waitlist_position, ' +
  'created_at, updated_at';

/** GET /api/events/:eventId/rsvps/duplicates */
export async function listDuplicates(req: Request, res: Response): Promise<Response> {
  const authReq = req as AuthRequest;
  const { eventId } = req.params;
  const event = await requireEventAccess(authReq, res, eventId, { ownerOnly: true });
  if (!event) return res as Response;

  const db = getDatabase();
  const rows = await db.all<DuplicateCandidateRow>(
    `SELECT id, name, email, phone, status, guests, created_at, updated_at
     FROM rsvps WHERE event_id = $1`,
    [eventId],
  );
  const clusters = detectDuplicateClusters(rows);
  return res.json({ clusters });
}

/**
 * POST /api/events/:eventId/rsvps/:id/merge
 * Body: { sourceRsvpIds: number[]; notes?: string }
 *
 * Combines `sourceRsvpIds` into the RSVP at `:id` (the survivor). Conflicts
 * are resolved with deterministic rules: the survivor's existing values win
 * unless they are null/empty, in which case the most-recently-updated source
 * value fills in. Counts (`guests`) are summed and capped to event capacity.
 * Each merged source row is snapshotted into `guest_merge_audit` and then
 * deleted. The whole operation runs in a single transaction.
 */
export async function mergeGuests(req: Request, res: Response): Promise<Response> {
  const authReq = req as AuthRequest;
  const { eventId, id: survivorIdParam } = req.params;
  const event = await requireEventAccess(authReq, res, eventId, { ownerOnly: true });
  if (!event) return res as Response;

  const survivorId = Number(survivorIdParam);
  if (!Number.isInteger(survivorId) || survivorId <= 0) {
    return res.status(400).json({ error: 'Invalid survivor RSVP id.' });
  }

  const { sourceRsvpIds, notes } = req.body as { sourceRsvpIds?: unknown; notes?: unknown };
  if (!Array.isArray(sourceRsvpIds) || sourceRsvpIds.length === 0) {
    return res.status(400).json({ error: 'sourceRsvpIds must be a non-empty array.' });
  }
  const sourceIds: number[] = [];
  for (const raw of sourceRsvpIds) {
    const n = Number(raw);
    if (!Number.isInteger(n) || n <= 0) {
      return res.status(400).json({ error: 'sourceRsvpIds must contain positive integers.' });
    }
    if (n === survivorId) {
      return res.status(400).json({ error: 'Survivor cannot be listed as a source.' });
    }
    if (!sourceIds.includes(n)) sourceIds.push(n);
  }

  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Lock survivor + sources to prevent concurrent edits during merge
    const ids = [survivorId, ...sourceIds];
    const placeholders = ids.map((_, i) => `$${i + 2}`).join(', ');
    const lockResult = await client.query<RsvpRow>(
      `SELECT ${RSVP_COLUMNS}
       FROM rsvps WHERE event_id = $1 AND id IN (${placeholders})
       FOR UPDATE`,
      [eventId, ...ids],
    );
    const rows = lockResult.rows;
    const survivor = rows.find((r) => r.id === survivorId);
    if (!survivor) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Survivor RSVP not found.' });
    }
    const sources = rows.filter((r) => r.id !== survivorId);
    if (sources.length !== sourceIds.length) {
      await client.query('ROLLBACK');
      return res
        .status(404)
        .json({ error: 'One or more source RSVPs were not found in this event.' });
    }

    // Compute merged scalar fields. Survivor wins; sources fill nulls (newest first).
    const sourcesByRecency = [...sources].sort((a, b) =>
      (b.updated_at ?? '').localeCompare(a.updated_at ?? ''),
    );

    type MergeableKey =
      | 'name'
      | 'email'
      | 'phone'
      | 'notes'
      | 'dietary_restriction'
      | 'accessibility_needs'
      | 'plus_one_name'
      | 'guest_group'
      | 'rsvp_deadline';

    const merged: Pick<RsvpRow, MergeableKey> = {
      name: survivor.name,
      email: survivor.email,
      phone: survivor.phone,
      notes: survivor.notes,
      dietary_restriction: survivor.dietary_restriction,
      accessibility_needs: survivor.accessibility_needs,
      plus_one_name: survivor.plus_one_name,
      guest_group: survivor.guest_group,
      rsvp_deadline: survivor.rsvp_deadline,
    };

    function isEmpty(v: unknown): boolean {
      if (v === null || v === undefined) return true;
      if (typeof v === 'string') return v.trim().length === 0 || v.trim() === 'None';
      return false;
    }

    for (const src of sourcesByRecency) {
      (Object.keys(merged) as MergeableKey[]).forEach((key) => {
        const cur = merged[key];
        const candidate = src[key];
        if (isEmpty(cur) && !isEmpty(candidate)) {
          (merged as Record<MergeableKey, string | null>)[key] = candidate;
        }
      });
    }

    const totalGuests = [survivor, ...sources].reduce(
      (sum, r) => sum + (Number(r.guests) || 1),
      0,
    );
    const goingAfterMerge = sources.some((s) => s.status === 'Going') || survivor.status === 'Going';
    const finalStatus = goingAfterMerge ? 'Going' : survivor.status;

    // Capacity check: sum of all 'Going' guests for the event after the merge
    // must fit within event.capacity (if set). We exclude all sources (they are
    // about to be deleted) and substitute the survivor's totalGuests.
    const cap = await client.query<{ capacity: number | null }>(
      'SELECT capacity FROM events WHERE id = $1 AND deleted_at IS NULL',
      [eventId],
    );
    const capacity = cap.rows[0]?.capacity ?? null;
    if (capacity !== null && finalStatus === 'Going') {
      const otherGoing = await client.query<{ total: number }>(
        `SELECT COALESCE(SUM(guests), 0)::int AS total FROM rsvps
         WHERE event_id = $1 AND status = 'Going' AND id NOT IN (${ids.map((_, i) => `$${i + 2}`).join(', ')})`,
        [eventId, ...ids],
      );
      const projected = (otherGoing.rows[0]?.total ?? 0) + totalGuests;
      if (projected > capacity) {
        await client.query('ROLLBACK');
        return res.status(409).json({
          error: 'Merge would exceed event capacity.',
          projected,
          capacity,
        });
      }
    }

    // Re-parent dependent rows to the survivor before deleting the sources.
    // seating_assignments has PRIMARY KEY (table_id, rsvp_id) — collisions are
    // possible if both the source and survivor are seated at the same table,
    // so we DELETE the source's row in that case to prevent an error.
    for (const src of sources) {
      await client.query(
        `DELETE FROM seating_assignments
           WHERE rsvp_id = $1
             AND table_id IN (SELECT table_id FROM seating_assignments WHERE rsvp_id = $2)`,
        [src.id, survivorId],
      );
      await client.query(
        `UPDATE seating_assignments SET rsvp_id = $1 WHERE rsvp_id = $2`,
        [survivorId, src.id],
      );
      await client.query(
        `DELETE FROM rsvp_question_responses
           WHERE rsvp_id = $1
             AND question_id IN (SELECT question_id FROM rsvp_question_responses WHERE rsvp_id = $2)`,
        [src.id, survivorId],
      );
      await client.query(
        `UPDATE rsvp_question_responses SET rsvp_id = $1 WHERE rsvp_id = $2`,
        [survivorId, src.id],
      );
      await client.query(
        `UPDATE rsvp_access_tokens SET revoked_at = CURRENT_TIMESTAMP
         WHERE rsvp_id = $1 AND revoked_at IS NULL`,
        [src.id],
      );

      // Snapshot then delete
      await client.query(
        `INSERT INTO guest_merge_audit
           (event_id, surviving_rsvp_id, merged_rsvp_id, merged_email, merged_name, merged_snapshot, merged_by, notes)
         VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8)`,
        [
          eventId,
          survivorId,
          src.id,
          src.email,
          src.name,
          JSON.stringify(src),
          authReq.user?.id ?? null,
          typeof notes === 'string' ? notes.trim() || null : null,
        ],
      );
      await client.query('DELETE FROM rsvps WHERE id = $1', [src.id]);
    }

    // Apply merged scalar fields + summed guest count to survivor
    await client.query(
      `UPDATE rsvps SET
         name = $1,
         email = $2,
         phone = $3,
         notes = $4,
         dietary_restriction = $5,
         accessibility_needs = $6,
         plus_one_name = $7,
         guest_group = $8,
         rsvp_deadline = $9,
         guests = $10,
         status = $11,
         updated_at = CURRENT_TIMESTAMP
       WHERE id = $12`,
      [
        merged.name,
        merged.email,
        merged.phone,
        merged.notes,
        merged.dietary_restriction,
        merged.accessibility_needs,
        merged.plus_one_name,
        merged.guest_group,
        merged.rsvp_deadline,
        totalGuests,
        finalStatus,
        survivorId,
      ],
    );

    await client.query('COMMIT');

    await logActivity(
      Number(eventId),
      authReq.user?.id ?? null,
      'guest_merged',
      `${sources.length} duplicate guest record${sources.length === 1 ? '' : 's'} merged into ${merged.name}`,
      `/events/${eventId}`,
    );

    const updated = await getDatabase().get<RsvpRow>(
      `SELECT ${RSVP_COLUMNS} FROM rsvps WHERE id = $1`,
      [survivorId],
    );
    return res.json({
      rsvp: updated,
      mergedSourceIds: sources.map((s) => s.id),
    });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    console.error('mergeGuests failed:', err);
    return res.status(500).json({ error: 'Merge failed.' });
  } finally {
    client.release();
  }
}

/** GET /api/events/:eventId/guest-merges  — read-only audit feed */
export async function listMergeAudit(req: Request, res: Response): Promise<Response> {
  const authReq = req as AuthRequest;
  const { eventId } = req.params;
  const event = await requireEventAccess(authReq, res, eventId, { ownerOnly: true });
  if (!event) return res as Response;
  const db = getDatabase();
  const rows = await db.all(
    `SELECT id, event_id, surviving_rsvp_id, merged_rsvp_id, merged_email, merged_name,
            merged_by, merged_at, notes
     FROM guest_merge_audit WHERE event_id = $1 ORDER BY merged_at DESC`,
    [eventId],
  );
  return res.json({ audit: rows });
}
