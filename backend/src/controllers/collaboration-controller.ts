/**
 * Collaboration Controller
 * Issues: #625 (WebSocket real-time sync), #626 (presence indicators),
 *         #627 (conflict resolution)
 */

import { Request, Response } from 'express';
import { getDatabase } from '../db/database.js';
import { requireEventAccess } from '../utils/event-access.js';
import { publishRealtimeEvent } from '../utils/realtime-bus.js';

interface AuthRequest extends Request {
  user?: { id: number; email: string; role_id: number };
}

const VALID_ENTITY_TYPES = new Set(['task', 'event', 'timeline_activity']);
const PRESENCE_TIMEOUT_SECS = 30;

// ── #626: Presence indicators ─────────────────────────────────────────────────

/** POST /api/presence */
export async function heartbeatPresence(req: Request, res: Response): Promise<Response> {
  const authReq = req as AuthRequest;
  if (!authReq.user) return res.status(401).json({ error: 'Unauthorized.' });

  const { entity_type, entity_id } = req.body as {
    entity_type?: string;
    entity_id?: number;
  };

  if (!entity_type || !VALID_ENTITY_TYPES.has(entity_type)) {
    return res
      .status(400)
      .json({ error: `entity_type must be one of: ${[...VALID_ENTITY_TYPES].join(', ')}` });
  }
  if (!entity_id || !Number.isInteger(Number(entity_id))) {
    return res.status(400).json({ error: 'entity_id must be a positive integer.' });
  }

  const db = getDatabase();
  await db.run(
    `INSERT INTO edit_sessions (entity_type, entity_id, user_id, last_seen_at)
     VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
     ON CONFLICT (entity_type, entity_id, user_id) DO UPDATE SET
       last_seen_at = CURRENT_TIMESTAMP`,
    [entity_type, Number(entity_id), authReq.user.id],
  );

  // Clean up stale sessions (older than PRESENCE_TIMEOUT_SECS)
  await db.run(
    `DELETE FROM edit_sessions
     WHERE last_seen_at < datetime('now', $1)`,
    [`-${PRESENCE_TIMEOUT_SECS} seconds`],
  );

  const active = await db.all(
    `SELECT es.user_id, COALESCE(u.display_name, u.email) AS display_name,
            es.started_at, es.last_seen_at
     FROM edit_sessions es
     JOIN users u ON u.id = es.user_id
     WHERE es.entity_type = $1 AND es.entity_id = $2`,
    [entity_type, Number(entity_id)],
  );

  publishRealtimeEvent({
    type: 'presence.heartbeat',
    occurredAt: new Date().toISOString(),
    entityType: entity_type,
    entityId: Number(entity_id),
    actorId: authReq.user?.id ?? null,
    payload: { presence: active },
  });

  return res.json({ presence: active });
}

/** GET /api/presence */
export async function getPresence(req: Request, res: Response): Promise<Response> {
  const authReq = req as AuthRequest;
  if (!authReq.user) return res.status(401).json({ error: 'Unauthorized.' });

  const { entity_type, entity_id } = req.query as { entity_type?: string; entity_id?: string };

  if (!entity_type || !VALID_ENTITY_TYPES.has(entity_type)) {
    return res
      .status(400)
      .json({ error: `entity_type must be one of: ${[...VALID_ENTITY_TYPES].join(', ')}` });
  }
  if (!entity_id) return res.status(400).json({ error: 'entity_id is required.' });

  const db = getDatabase();

  // Purge stale sessions before returning
  await db.run(`DELETE FROM edit_sessions WHERE last_seen_at < datetime('now', $1)`, [
    `-${PRESENCE_TIMEOUT_SECS} seconds`,
  ]);

  const active = await db.all(
    `SELECT es.user_id, COALESCE(u.display_name, u.email) AS display_name,
            es.started_at, es.last_seen_at
     FROM edit_sessions es
     JOIN users u ON u.id = es.user_id
     WHERE es.entity_type = $1 AND es.entity_id = $2`,
    [entity_type, Number(entity_id)],
  );

  return res.json({ presence: active });
}

/** DELETE /api/presence */
export async function leavePresence(req: Request, res: Response): Promise<Response> {
  const authReq = req as AuthRequest;
  if (!authReq.user) return res.status(401).json({ error: 'Unauthorized.' });

  // Accept params from query string (DELETE requests don't reliably carry bodies)
  const entity_type = (req.body?.entity_type ?? req.query?.entity_type) as string | undefined;
  const entity_id = (req.body?.entity_id ?? req.query?.entity_id) as number | string | undefined;

  const db = getDatabase();
  await db.run(
    'DELETE FROM edit_sessions WHERE entity_type = $1 AND entity_id = $2 AND user_id = $3',
    [entity_type, Number(entity_id), authReq.user.id],
  );

  publishRealtimeEvent({
    type: 'presence.leave',
    occurredAt: new Date().toISOString(),
    entityType: entity_type,
    entityId: Number(entity_id),
    actorId: authReq.user.id,
    payload: {},
  });

  return res.json({ ok: true });
}

// ── #625: WebSocket sync — event-level presence for modules ──────────────────

/** GET /api/events/:eventId/presence */
export async function getEventPresence(req: Request, res: Response): Promise<Response> {
  const authReq = req as AuthRequest;
  const { eventId } = req.params;

  const event = await requireEventAccess(authReq, res, eventId, { allowMembers: true });
  if (!event) return res as Response;

  const db = getDatabase();

  await db.run(`DELETE FROM edit_sessions WHERE last_seen_at < datetime('now', $1)`, [
    `-${PRESENCE_TIMEOUT_SECS} seconds`,
  ]);

  const active = await db.all(
    `SELECT es.entity_type, es.entity_id, es.user_id,
            COALESCE(u.display_name, u.email) AS display_name,
            es.last_seen_at
     FROM edit_sessions es
     JOIN users u ON u.id = es.user_id
     WHERE es.entity_id IN (
       SELECT id FROM tasks WHERE event_id = $1
       UNION ALL
       SELECT id FROM timeline_activities WHERE event_id = $2
       UNION ALL
       SELECT $3 AS id WHERE es.entity_type = 'event'
     )`,
    [eventId, eventId, eventId],
  );

  publishRealtimeEvent({
    type: 'presence.snapshot',
    occurredAt: new Date().toISOString(),
    eventId: Number(eventId),
    entityType: 'event',
    entityId: Number(eventId),
    actorId: authReq.user?.id ?? null,
    payload: { presence: active },
  });

  return res.json({ presence: active });
}
