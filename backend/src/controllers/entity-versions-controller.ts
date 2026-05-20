/**
 * Entity Versions Controller
 * Issue: #629 — Version history and rollback for critical entities
 */

import { Request, Response } from 'express';
import { getDatabase } from '../db/database.js';
import { requireEventAccess } from '../utils/event-access.js';
import { publishRealtimeEvent } from '../utils/realtime-bus.js';

interface AuthRequest extends Request {
  user?: { id: number; email: string; role_id: number };
}

const SUPPORTED_ENTITY_TYPES = new Set(['task', 'timeline_activity', 'event', 'rsvp']);

const RESTORE_FIELD_MAP: Record<string, string[]> = {
  task: [
    'title',
    'notes',
    'due_date',
    'status',
    'priority',
    'assignee_name',
    'assigned_user_id',
    'estimated_hours',
  ],
  timeline_activity: [
    'title',
    'description',
    'start_time',
    'end_time',
    'planned_start_time',
    'planned_end_time',
    'status',
    'location',
    'sort_order',
    'buffer_before_mins',
    'buffer_after_mins',
  ],
  event: [
    'title',
    'date',
    'location',
    'description',
    'capacity',
    'status',
    'event_type',
    'is_public',
    'tags',
    'latitude',
    'longitude',
    'waitlist_enabled',
    'gallery_comments_enabled',
    'gallery_guest_uploads',
    'gallery_public',
    'storage_quota_bytes',
    'event_time',
    'rsvp_deadline',
    'archived_at',
    'deleted_at',
  ],
  rsvp: [
    'name',
    'email',
    'phone',
    'guests',
    'status',
    'notes',
    'source',
    'checked_in',
    'checked_in_at',
    'late_arrival',
    'arrival_delay_minutes',
    'dietary_restriction',
    'accessibility_needs',
    'plus_one',
    'plus_one_name',
    'guest_group',
    'rsvp_deadline',
    'company',
    'title',
    'relation_type',
    'age_group',
    'address_line1',
    'address_line2',
    'city',
    'state_region',
    'postal_code',
    'country',
    'emergency_contact_name',
    'emergency_contact_phone',
    'meal_choice',
    'canonical_status',
    'profile_completeness',
    'unsubscribed_at',
    'seating_group_id',
    'waitlist_position',
  ],
};

const RESTORE_TABLE_MAP: Record<string, string> = {
  task: 'tasks',
  timeline_activity: 'timeline_activities',
  event: 'events',
  rsvp: 'rsvps',
};

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
    const eventId =
      typeof snapshot.event_id === 'number'
        ? snapshot.event_id
        : Number(snapshot.event_id ?? entityId);
    publishRealtimeEvent({
      type: 'version.captured',
      occurredAt: new Date().toISOString(),
      eventId: Number.isFinite(eventId) ? eventId : undefined,
      entityType,
      entityId,
      actorId: changedBy,
      payload: { version: nextVersion, changeNote: changeNote ?? null },
    });
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
    return res
      .status(400)
      .json({ error: `entity_type must be one of: ${[...SUPPORTED_ENTITY_TYPES].join(', ')}` });
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
/** POST /api/events/:eventId/rsvps/:entityId/rollback */
/** POST /api/events/:eventId/rollback */
export async function rollbackEntityVersion(req: Request, res: Response): Promise<Response> {
  const authReq = req as AuthRequest;
  const { eventId, entityId } = req.params;
  const { version_id, entity_type } = req.body as { version_id?: number; entity_type?: string };

  if (!version_id) return res.status(400).json({ error: 'version_id is required.' });
  const resolvedType = entity_type ?? 'task';
  if (!SUPPORTED_ENTITY_TYPES.has(resolvedType)) {
    return res
      .status(400)
      .json({ error: `entity_type must be one of: ${[...SUPPORTED_ENTITY_TYPES].join(', ')}` });
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

  const table = RESTORE_TABLE_MAP[resolvedType];
  const allowedFields = RESTORE_FIELD_MAP[resolvedType];
  if (!table || !allowedFields) {
    return res
      .status(400)
      .json({ error: `Rollback not supported for entity type: ${resolvedType}` });
  }

  const sets = allowedFields.filter((f) => snapshot[f] !== undefined).map((f) => `${f} = ?`);
  const vals = allowedFields
    .filter((f) => snapshot[f] !== undefined)
    .map((f) => snapshot[f] as string | number | boolean | null);

  if (resolvedType !== 'rsvp') {
    sets.push('version = version + 1');
  }
  sets.push('updated_at = CURRENT_TIMESTAMP');
  vals.push(entityId);

  await db.run(`UPDATE ${table} SET ${sets.join(', ')} WHERE id = $1`, vals);
  const restored = await db.get(`SELECT * FROM ${table} WHERE id = $1`, [entityId]);
  await captureEntityVersion(
    resolvedType,
    Number(entityId),
    snapshot,
    authReq.user?.id ?? null,
    `Rolled back to version #${version_id}`,
  );
  publishRealtimeEvent({
    type: 'version.rolled_back',
    occurredAt: new Date().toISOString(),
    eventId: Number(eventId),
    entityType: resolvedType,
    entityId: Number(entityId),
    actorId: authReq.user?.id ?? null,
    payload: { version_id, entity: restored ?? null },
  });
  return res.json({ entity: restored, rolled_back_to_version: version_id });
}
