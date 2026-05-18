/**
 * Entity Versions Controller
 * Issue: #629 — Version history and rollback for critical entities
 */

import { Request, Response } from 'express';
import { getDatabase } from '../db/database.js';
import { requireEventAccess } from '../utils/event-access.js';

interface AuthRequest extends Request {
  user?: { id: number; email: string; role_id: number };
}

const SUPPORTED_ENTITY_TYPES = new Set(['task', 'timeline_activity', 'event']);

// ── Internal helper — called from other controllers before mutations ──────────

export async function captureEntityVersion(
  entityType: string,
  entityId: number,
  snapshot: Record<string, unknown>,
  changedBy: number | null,
  changeNote?: string,
): Promise<void> {
  if (!SUPPORTED_ENTITY_TYPES.has(entityType)) return;
  try {
    const db = getDatabase();
    const latest = await db.get<{ version: number }>(
      'SELECT MAX(version) AS version FROM entity_versions WHERE entity_type = $1 AND entity_id = $2',
      [entityType, entityId],
    );
    const nextVersion = (latest?.version ?? 0) + 1;
    await db.run(
      `INSERT INTO entity_versions (entity_type, entity_id, version, snapshot, changed_by, change_note)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [entityType, entityId, nextVersion, JSON.stringify(snapshot), changedBy, changeNote ?? null],
    );
  } catch (err) {
    console.error('captureEntityVersion failed:', err);
  }
}

// ── Route handlers ────────────────────────────────────────────────────────────

/** GET /api/events/:eventId/tasks/:entityId/versions */
/** GET /api/events/:eventId/timeline/:entityId/versions */
export async function listEntityVersions(req: Request, res: Response): Promise<Response> {
  const authReq = req as AuthRequest;
  const { eventId, entityId } = req.params;
  const { entity_type } = req.query as { entity_type?: string };

  const resolvedType = entity_type ?? 'task';
  if (!SUPPORTED_ENTITY_TYPES.has(resolvedType)) {
    return res.status(400).json({ error: `entity_type must be one of: ${[...SUPPORTED_ENTITY_TYPES].join(', ')}` });
  }

  const event = await requireEventAccess(authReq, res, eventId, { allowMembers: true });
  if (!event) return res as Response;

  const db = getDatabase();
  const versions = await db.all(
    `SELECT ev.id, ev.version, ev.changed_by, ev.change_note, ev.created_at,
            COALESCE(u.display_name, u.email) AS changed_by_name
     FROM entity_versions ev
     LEFT JOIN users u ON u.id = ev.changed_by
     WHERE ev.entity_type = $1 AND ev.entity_id = $2
     ORDER BY ev.version DESC`,
    [resolvedType, entityId],
  );

  return res.json({ versions });
}

/** GET /api/entity-versions/:id */
export async function getEntityVersion(req: Request, res: Response): Promise<Response> {
  const authReq = req as AuthRequest;
  if (!authReq.user) return res.status(401).json({ error: 'Unauthorized.' });

  const { id } = req.params;
  const db = getDatabase();

  const version = await db.get(
    `SELECT ev.*, COALESCE(u.display_name, u.email) AS changed_by_name
     FROM entity_versions ev
     LEFT JOIN users u ON u.id = ev.changed_by
     WHERE ev.id = $1`,
    [id],
  );

  if (!version) return res.status(404).json({ error: 'Version not found.' });
  return res.json({ version });
}

/** POST /api/events/:eventId/tasks/:entityId/rollback */
/** POST /api/events/:eventId/timeline/:entityId/rollback */
export async function rollbackEntityVersion(req: Request, res: Response): Promise<Response> {
  const authReq = req as AuthRequest;
  const { eventId, entityId } = req.params;
  const { version_id, entity_type } = req.body as { version_id?: number; entity_type?: string };

  if (!version_id) return res.status(400).json({ error: 'version_id is required.' });
  const resolvedType = entity_type ?? 'task';
  if (!SUPPORTED_ENTITY_TYPES.has(resolvedType)) {
    return res.status(400).json({ error: `entity_type must be one of: ${[...SUPPORTED_ENTITY_TYPES].join(', ')}` });
  }

  const event = await requireEventAccess(authReq, res, eventId, { allowMembers: true });
  if (!event) return res as Response;

  const db = getDatabase();
  const versionRow = await db.get<{ snapshot: string; entity_type: string; entity_id: number }>(
    'SELECT * FROM entity_versions WHERE id = $1 AND entity_type = $2 AND entity_id = $3',
    [version_id, resolvedType, entityId],
  );

  if (!versionRow) {
    return res.status(404).json({ error: 'Version snapshot not found.' });
  }

  const snapshot = JSON.parse(versionRow.snapshot) as Record<string, unknown>;

  if (resolvedType === 'task') {
    const allowedFields = [
      'title', 'notes', 'due_date', 'status', 'priority',
      'assignee_name', 'assigned_user_id', 'estimated_hours',
    ];
    const sets = allowedFields
      .filter((f) => snapshot[f] !== undefined)
      .map((f) => `${f} = ?`);
    const vals = allowedFields
      .filter((f) => snapshot[f] !== undefined)
      .map((f) => snapshot[f] as string | number | null);

    sets.push('version = version + 1', 'updated_at = CURRENT_TIMESTAMP');
    vals.push(entityId);

    await db.run(`UPDATE tasks SET ${sets.join(', ')} WHERE id = $1`, vals);
    const restored = await db.get('SELECT * FROM tasks WHERE id = $1', [entityId]);
    // Capture the rollback as a new version
    await captureEntityVersion(resolvedType, Number(entityId), snapshot, authReq.user?.id ?? null, `Rolled back to version #${version_id}`);
    return res.json({ entity: restored, rolled_back_to_version: version_id });
  }

  if (resolvedType === 'timeline_activity') {
    const allowedFields = [
      'title', 'description', 'start_time', 'end_time',
      'planned_start_time', 'planned_end_time', 'status',
      'location', 'sort_order', 'buffer_before_mins', 'buffer_after_mins',
    ];
    const sets = allowedFields
      .filter((f) => snapshot[f] !== undefined)
      .map((f) => `${f} = ?`);
    const vals = allowedFields
      .filter((f) => snapshot[f] !== undefined)
      .map((f) => snapshot[f] as string | number | null);

    sets.push('version = version + 1', 'updated_at = CURRENT_TIMESTAMP');
    vals.push(entityId);

    await db.run(`UPDATE timeline_activities SET ${sets.join(', ')} WHERE id = $1`, vals);
    const restored = await db.get('SELECT * FROM timeline_activities WHERE id = $1', [entityId]);
    await captureEntityVersion(resolvedType, Number(entityId), snapshot, authReq.user?.id ?? null, `Rolled back to version #${version_id}`);
    return res.json({ entity: restored, rolled_back_to_version: version_id });
  }

  return res.status(400).json({ error: `Rollback not supported for entity type: ${resolvedType}` });
}
