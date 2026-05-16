/**
 * Event bulk-actions controller — story #410, task #433
 *
 * Endpoints:
 *   POST /api/events/bulk { action, event_ids }
 *
 * Supported actions:
 *   archive  -> sets status='Cancelled' (status is the closest to "archived" in the
 *               existing schema; events remain visible until soft-deleted)
 *   delete   -> soft-deletes (deleted_at = NOW)
 *   export   -> returns CSV of the requested events
 *
 * Permission rules per event:
 *   - Admins (role_id = 3) can act on any event.
 *   - Organizers (role_id = 2) can act only on events they created.
 *   - Lower roles get a per-event 403 entry.
 *
 * The endpoint is *partial-success*: each event returns its own status so the UI
 * can show successes and failures side-by-side without rolling everything back.
 */

import { Request, Response } from 'express';
import { getDatabase } from '../db/database.js';

interface AuthRequest extends Request {
  user?: { id: number; email: string; role_id: number };
}

interface EventRow {
  id: number;
  title: string;
  date: string;
  location: string | null;
  capacity: number | null;
  status: string;
  event_type: string | null;
  tags: string | null;
  created_by: number;
  deleted_at: string | null;
}

export type BulkAction = 'archive' | 'delete' | 'export';
const VALID_ACTIONS: BulkAction[] = ['archive', 'delete', 'export'];

interface BulkResultEntry {
  event_id: number;
  status: 'ok' | 'forbidden' | 'not_found' | 'error';
  message?: string;
}

function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function toCsv(events: EventRow[]): string {
  const headers = [
    'id',
    'title',
    'date',
    'location',
    'capacity',
    'status',
    'event_type',
    'tags',
  ];
  const rows = events.map((e) =>
    [e.id, e.title, e.date, e.location, e.capacity, e.status, e.event_type, e.tags]
      .map(csvEscape)
      .join(','),
  );
  return [headers.join(','), ...rows].join('\n');
}

function canActOnEvent(user: AuthRequest['user'], event: EventRow): boolean {
  if (!user) return false;
  // Admin (role_id === 3) can act on any event.
  if (user.role_id === 3) return true;
  // Lower roles (Attendee = 1) cannot run bulk actions even on events they
  // somehow own — bulk ops are an Organizer/Admin capability.
  if (user.role_id < 2) return false;
  // Organizers act only on events they created.
  return Number(event.created_by) === Number(user.id);
}

/** POST /api/events/bulk */
export async function bulkEventAction(req: Request, res: Response): Promise<void> {
  try {
    const authReq = req as AuthRequest;
    const user = authReq.user;
    if (!user) {
      res.status(401).json({ error: 'User not authenticated' });
      return;
    }

    const { action, event_ids } = (req.body ?? {}) as {
      action?: string;
      event_ids?: unknown[];
    };

    if (!action || !VALID_ACTIONS.includes(action as BulkAction)) {
      res.status(400).json({
        error: `action must be one of ${VALID_ACTIONS.join(', ')}`,
      });
      return;
    }

    if (!Array.isArray(event_ids) || event_ids.length === 0) {
      res.status(400).json({ error: 'event_ids must be a non-empty array' });
      return;
    }

    const ids = Array.from(
      new Set(
        event_ids
          .map((v) => Number(v))
          .filter((v) => Number.isFinite(v) && v > 0),
      ),
    );
    if (ids.length === 0) {
      res.status(400).json({ error: 'event_ids must contain at least one valid id' });
      return;
    }
    if (ids.length > 200) {
      res.status(400).json({ error: 'Cannot process more than 200 events at once' });
      return;
    }

    const db = getDatabase();
    const placeholders = ids.map(() => '$1').join(',');
    const events = await db.all<EventRow>(
      `SELECT id, title, date, location, capacity, status, event_type, tags,
              created_by, deleted_at
         FROM events
        WHERE id IN (${placeholders})
          AND deleted_at IS NULL`,
      ids,
    );

    const foundMap = new Map<number, EventRow>();
    for (const e of events) foundMap.set(Number(e.id), e);

    if (action === 'export') {
      const exportable: EventRow[] = [];
      const skipped: BulkResultEntry[] = [];
      for (const id of ids) {
        const ev = foundMap.get(id);
        if (!ev) {
          skipped.push({ event_id: id, status: 'not_found' });
          continue;
        }
        if (!canActOnEvent(user, ev)) {
          skipped.push({ event_id: id, status: 'forbidden' });
          continue;
        }
        exportable.push(ev);
      }

      // Always return CSV body even when nothing was exportable, so the client
      // can show the header. Permission/missing details are reported via headers.
      const csv = toCsv(exportable);
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="events-export-${Date.now()}.csv"`,
      );
      if (skipped.length > 0) {
        res.setHeader('X-Bulk-Skipped', JSON.stringify(skipped));
      }
      res.status(200).send(csv);
      return;
    }

    // archive / delete — partial success per event
    const results: BulkResultEntry[] = [];
    let successCount = 0;
    for (const id of ids) {
      const ev = foundMap.get(id);
      if (!ev) {
        results.push({ event_id: id, status: 'not_found' });
        continue;
      }
      if (!canActOnEvent(user, ev)) {
        results.push({ event_id: id, status: 'forbidden' });
        continue;
      }
      try {
        if (action === 'archive') {
          await db.run(
            `UPDATE events SET status = 'Cancelled', updated_at = CURRENT_TIMESTAMP
             WHERE id = $1`,
            [id],
          );
        } else if (action === 'delete') {
          await db.run(
            `UPDATE events
                SET deleted_at = CURRENT_TIMESTAMP,
                    updated_at = CURRENT_TIMESTAMP
              WHERE id = $1`,
            [id],
          );
        }
        results.push({ event_id: id, status: 'ok' });
        successCount += 1;
      } catch (err) {
        // Pass user-controlled values as separate console.error arguments rather
        // than interpolating them into the format string — keeps codeQL's
        // js/tainted-format-string scanner satisfied.
        console.error('Bulk action failed for event:', { action, id, err });
        results.push({
          event_id: id,
          status: 'error',
          message: err instanceof Error ? err.message : 'unknown error',
        });
      }
    }

    if (successCount > 0) {
      await db.run(
        'INSERT INTO audit_log (user_id, email, action, description, ip_address) VALUES ($1, $2, $3, $4, $5)',
        [
          user.id,
          user.email ?? null,
          `event.bulk.${action}`,
          `Bulk ${action} on ${successCount}/${ids.length} events: ${ids.join(',')}`,
          authReq.ip ?? null,
        ],
      );
    }

    res.json({ action, results, success: successCount, total: ids.length });
  } catch (error) {
    console.error('Bulk action failed:', error);
    res.status(500).json({ error: 'Bulk action failed' });
  }
}
