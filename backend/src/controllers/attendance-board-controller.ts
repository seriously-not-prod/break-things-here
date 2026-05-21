/**
 * Real-time attendance board (#595).
 *
 * Exposes:
 *  - `GET /events/:eventId/attendance/summary` — point-in-time stats
 *  - `GET /events/:eventId/attendance/stream` — server-sent events stream
 *
 * The stream is fed by `broadcastAttendanceEvent()` which the QR scan
 * controller calls after every state change. Stream payloads carry the rsvp
 * row delta + a `summary` snapshot so the dashboard does not need to
 * re-query on every event.
 *
 * NB: this is intentionally lightweight — a single Node process holds all
 * subscribers in memory. For horizontal scale the broker would move to
 * Redis pub/sub; the broadcaster API is shaped to make that swap drop-in.
 */
import type { Request, Response } from 'express';
import { getDatabase } from '../db/database.js';
import { requireEventAccess } from '../utils/event-access.js';
import { publishRealtimeEvent } from '../utils/realtime-bus.js';

interface AuthRequest extends Request {
  user?: { id: number; email: string; role_id: number };
}

type Subscriber = {
  eventId: number;
  res: Response;
  heartbeat: NodeJS.Timeout;
};

const subscribers = new Set<Subscriber>();

interface AttendanceStats {
  invited: number;
  confirmed: number;
  declined: number;
  pending: number;
  waitlist: number;
  checked_in: number;
  no_show: number;
  late_arrivals: number;
  attendance_rate: number;
}

export async function computeAttendanceStats(eventId: number): Promise<AttendanceStats> {
  const db = getDatabase();
  // Single GROUP BY query — no full RSVP table load, scales linearly with
  // distinct statuses per event (typically <10) instead of guest count.
  const rows = await db.all<{
    canonical_status: string | null;
    count: string | number;
    checked_in_count: string | number;
    late_count: string | number;
  }>(
    `SELECT COALESCE(LOWER(canonical_status), 'pending') AS canonical_status,
            COUNT(*) AS count,
            SUM(CASE WHEN checked_in THEN 1 ELSE 0 END) AS checked_in_count,
            SUM(CASE WHEN late_arrival THEN 1 ELSE 0 END) AS late_count
       FROM rsvps
      WHERE event_id = $1
      GROUP BY COALESCE(LOWER(canonical_status), 'pending')`,
    [eventId],
  );
  const stats: AttendanceStats = {
    invited: 0,
    confirmed: 0,
    declined: 0,
    pending: 0,
    waitlist: 0,
    checked_in: 0,
    no_show: 0,
    late_arrivals: 0,
    attendance_rate: 0,
  };
  for (const r of rows) {
    const count = Number(r.count);
    const checkedIn = Number(r.checked_in_count);
    const late = Number(r.late_count);
    stats.invited += count;
    stats.checked_in += checkedIn;
    stats.late_arrivals += late;
    const c = r.canonical_status ?? 'pending';
    if (c === 'confirmed') stats.confirmed += count;
    else if (c === 'declined' || c === 'cancelled') stats.declined += count;
    else if (c === 'waitlist') stats.waitlist += count;
    else if (c === 'no_show') stats.no_show += count;
    else if (c === 'pending' || c === 'maybe') stats.pending += count;
    else if (c === 'checked_in') stats.confirmed += count; // checked-in implies prior confirmed
  }
  stats.attendance_rate =
    stats.confirmed > 0 ? Math.round((stats.checked_in / stats.confirmed) * 100) : 0;
  return stats;
}

/** GET /api/events/:eventId/attendance/summary */
export async function getAttendanceSummary(req: Request, res: Response): Promise<Response> {
  const authReq = req as AuthRequest;
  const { eventId } = req.params;
  const event = await requireEventAccess(authReq, res, eventId, { allowMembers: true });
  if (!event) return res as Response;
  const stats = await computeAttendanceStats(Number(eventId));
  return res.json({ stats });
}

/** GET /api/events/:eventId/attendance/recent — last 50 check-in events */
export async function listRecentAttendanceEvents(req: Request, res: Response): Promise<Response> {
  const authReq = req as AuthRequest;
  const { eventId } = req.params;
  const event = await requireEventAccess(authReq, res, eventId, { allowMembers: true });
  if (!event) return res as Response;
  const db = getDatabase();
  const rows = await db.all(
    `SELECT a.id, a.action, a.source, a.occurred_at, a.metadata,
            r.id AS rsvp_id, r.name, r.email, r.late_arrival, r.arrival_delay_minutes
     FROM attendance_events a
     JOIN rsvps r ON r.id = a.rsvp_id
     WHERE a.event_id = $1
     ORDER BY a.occurred_at DESC
     LIMIT 50`,
    [eventId],
  );
  return res.json({ events: rows });
}

/** GET /api/events/:eventId/attendance/stream — SSE for live updates */
export async function streamAttendance(req: Request, res: Response): Promise<void> {
  const authReq = req as AuthRequest;
  const { eventId } = req.params;
  const event = await requireEventAccess(authReq, res, eventId, { allowMembers: true });
  if (!event) return;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();

  // Send an initial summary so the dashboard can render immediately.
  try {
    const stats = await computeAttendanceStats(Number(eventId));
    res.write(`event: summary\ndata: ${JSON.stringify({ stats })}\n\n`);
  } catch {
    /* ignore — stream still useful for upcoming check-ins */
  }

  const heartbeat = setInterval(() => {
    try {
      res.write(`:hb ${Date.now()}\n\n`);
    } catch {
      /* noop */
    }
  }, 25_000);

  const sub: Subscriber = { eventId: Number(eventId), res, heartbeat };
  subscribers.add(sub);

  req.on('close', () => {
    clearInterval(heartbeat);
    subscribers.delete(sub);
    try {
      res.end();
    } catch {
      /* noop */
    }
  });
}

/** Called by other controllers to push a new event onto the SSE stream. */
export function broadcastAttendanceEvent(eventId: number, payload: Record<string, unknown>): void {
  publishRealtimeEvent({
    type: 'attendance',
    occurredAt: new Date().toISOString(),
    eventId,
    entityType: 'attendance_event',
    entityId: null,
    actorId: typeof payload.actorId === 'number' ? payload.actorId : null,
    payload,
  });
  const body = `event: attendance\ndata: ${JSON.stringify(payload)}\n\n`;
  // Recompute summary asynchronously and push as a second SSE frame so
  // subscribers stay in sync without an extra round-trip.
  for (const sub of subscribers) {
    if (sub.eventId !== eventId) continue;
    try {
      sub.res.write(body);
    } catch {
      try {
        clearInterval(sub.heartbeat);
      } catch {
        /* noop */
      }
      subscribers.delete(sub);
    }
  }
  void computeAttendanceStats(eventId)
    .then((stats) => {
      const summaryFrame = `event: summary\ndata: ${JSON.stringify({ stats })}\n\n`;
      for (const sub of subscribers) {
        if (sub.eventId !== eventId) continue;
        try {
          sub.res.write(summaryFrame);
        } catch {
          /* noop */
        }
      }
    })
    .catch(() => undefined);
}
