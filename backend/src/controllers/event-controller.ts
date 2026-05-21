/**
 * Event Controller
 * Handles CRUD operations for festival events
 */

import { Request, Response } from 'express';
import path from 'path';
import { getDatabase } from '../db/database';
import { captureEntityVersion } from './entity-versions-controller.js';
import {
  EVENT_STATUSES,
  EventStatus,
  describeInvalidTransition,
  isValidStatus,
  validateEventDate,
} from '../utils/event-lifecycle.js';
import { buildCoverRenditionUrls, materialiseRenditions } from '../utils/image-processing.js';
import { publishRealtimeEvent } from '../utils/realtime-bus.js';
import { geocodeAddress } from '../services/geocoding/index.js';

export interface EventData {
  title: string;
  date: string;
  location: string;
  description?: string;
  capacity?: number | null;
  status?: EventStatus;
  event_type?: string | null;
  is_public?: boolean;
  tags?: string | null;
  // Story #414 — map and waitlist
  latitude?: number | null;
  longitude?: number | null;
  waitlist_enabled?: boolean | null;
  // BRD v2 (#618, #621, #622)
  gallery_comments_enabled?: boolean | null;
  gallery_guest_uploads?: boolean | null;
  gallery_public?: boolean | null;
  storage_quota_bytes?: number | null;
  // Story #664, Item 10 — required event time field (HH:MM)
  event_time?: string | null;
}

interface AuthRequest extends Request {
  user?: { id: number; email: string; role_id: number };
}

// Note on going_count/pending_count: scalar subqueries run once per event row.
// For typical event counts (<1k) this is fine; if a future workload exposes a
// hot list, swap to a single LEFT JOIN rsvps … GROUP BY e.id with conditional
// SUM-CASE so the aggregate is computed in one pass.
const EVENT_SELECT_COLUMNS = `
  e.*,
  e.date AS event_date,
  u.display_name as created_by_name,
  u.display_name as creator_name,
  (
    SELECT COALESCE(SUM(COALESCE(r.guests, 1)), 0)::int
      FROM rsvps r
     WHERE r.event_id = e.id AND r.canonical_status = 'confirmed'
  ) AS going_count,
  (
    SELECT COALESCE(SUM(COALESCE(r.guests, 1)), 0)::int
      FROM rsvps r
     WHERE r.event_id = e.id AND r.canonical_status = 'pending'
  ) AS pending_count
`;

const EVENT_BY_ID_SELECT_COLUMNS = `
  *,
  date AS event_date
`;

const EVENT_RESTORE_WINDOW_DAYS = 30;
const EVENT_RESTORE_WINDOW_MS = EVENT_RESTORE_WINDOW_DAYS * 24 * 60 * 60 * 1000;

/**
 * Normalize an optional coordinate value.
 *
 * Returns:
 *   - the numeric value when valid and in range,
 *   - null when the input is null/undefined/empty (to clear the column),
 *   - 'invalid' when out of range or non-numeric (caller should reject the request).
 */
function normalizeCoordinate(value: unknown, min: number, max: number): number | null | 'invalid' {
  if (value === null || value === undefined || value === '') return null;
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return 'invalid';
  if (n < min || n > max) return 'invalid';
  return n;
}

async function recordEventAudit(
  db: ReturnType<typeof getDatabase>,
  req: AuthRequest,
  action: string,
  description: string,
): Promise<void> {
  await db.run(
    'INSERT INTO audit_log (user_id, email, action, description, ip_address) VALUES ($1, $2, $3, $4, $5)',
    [req.user?.id ?? null, req.user?.email ?? null, action, description, req.ip ?? null],
  );
}

/**
 * Get all events
 *
 * Filters:
 *   ?owner=me                          — events created by the authenticated user
 *   ?status=Draft|Active|Completed     — single status (or comma-separated list — #580)
 *   ?q=keyword                         — quick search across title/description/location
 *   ?tags=tag1,tag2                    — comma-separated tag match (any-of)
 *   ?archived=true|false|only          — include archived (#578); default excludes archived
 *
 * Advanced search — story #416, task #455 + BRD v2 (#581):
 *   ?title_q=...                       — case-insensitive substring match on title
 *   ?location_q=...                    — case-insensitive substring match on location
 *   ?date_from=YYYY-MM-DD              — events on/after this date
 *   ?date_to=YYYY-MM-DD                — events on/before this date
 *   ?capacity_min=N                    — capacity >= N (or capacity IS NULL excluded)
 *   ?capacity_max=N                    — capacity <= N
 *   ?event_type=Concert                — exact event_type match
 *   ?has_waitlist=true|false           — waitlist_enabled flag
 *   ?created_by=N                      — events created by user N
 *   ?sort=date_asc|date_desc|title_asc|title_desc|created_desc — sort order (#580)
 *   ?view=list|grid|calendar|timeline  — UX hint; backend returns same rows but
 *                                        this is recorded in audit for power-user nav (#580)
 */
export async function getAllEvents(req: Request, res: Response): Promise<void> {
  try {
    const db = getDatabase();
    const authReq = req as AuthRequest;
    const {
      owner,
      tags,
      status,
      q,
      title_q,
      location_q,
      date_from,
      date_to,
      capacity_min,
      capacity_max,
      event_type,
      has_waitlist,
      archived,
      created_by,
      sort,
    } = req.query as {
      owner?: string;
      tags?: string;
      status?: string;
      q?: string;
      title_q?: string;
      location_q?: string;
      date_from?: string;
      date_to?: string;
      capacity_min?: string;
      capacity_max?: string;
      event_type?: string;
      has_waitlist?: string;
      archived?: string;
      created_by?: string;
      sort?: string;
    };

    let query = `
      SELECT ${EVENT_SELECT_COLUMNS}
      FROM events e
      LEFT JOIN users u ON e.created_by = u.id
      WHERE e.deleted_at IS NULL
    `;
    const params: (string | number | boolean)[] = [];

    // Archive filter (#540, #578).
    // Default: exclude archived rows so existing dashboards stay clean.
    // archived=true  → include archived alongside active.
    // archived=only  → only archived.
    if (archived === 'only') {
      query += ' AND e.archived_at IS NOT NULL';
    } else if (archived !== 'true') {
      query += ' AND e.archived_at IS NULL';
    }

    // Event-based access control: non-admin users (role_id < 3) can only see
    // events they created or are explicitly a member of.
    const isAdmin = authReq.user && authReq.user.role_id >= 3;
    if (!isAdmin && authReq.user?.id) {
      query +=
        ' AND (e.created_by = ? OR EXISTS (SELECT 1 FROM event_members em WHERE em.event_id = e.id AND em.user_id = ?))';
      params.push(authReq.user.id, authReq.user.id);
    }

    if (owner === 'me' && authReq.user?.id) {
      query += ' AND e.created_by = ?';
      params.push(authReq.user.id);
    }

    if (status) {
      // Accept comma-separated list of statuses (#580 view filters).
      const statusList = String(status)
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      const valid = statusList.filter((s): s is EventStatus => isValidStatus(s));
      if (valid.length === 1) {
        query += ' AND e.status = ?';
        params.push(valid[0]);
      } else if (valid.length > 1) {
        const placeholders = valid.map(() => '?').join(',');
        query += ` AND e.status IN (${placeholders})`;
        valid.forEach((s) => params.push(s));
      }
    }

    if (q) {
      query += ' AND (e.title ILIKE ? OR e.description ILIKE ? OR e.location ILIKE ?)';
      const like = `%${q}%`;
      params.push(like, like, like);
    }

    if (tags) {
      const tagList = tags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);
      if (tagList.length > 0) {
        const tagConditions = tagList
          .map(() => "(',' || COALESCE(e.tags, '') || ',') ILIKE ?")
          .join(' OR ');
        query += ` AND (${tagConditions})`;
        tagList.forEach((tag) => params.push(`%,${tag},%`));
      }
    }

    // Advanced search filters (issue #455)
    if (title_q) {
      query += ' AND e.title ILIKE ?';
      params.push(`%${title_q}%`);
    }
    if (location_q) {
      query += ' AND e.location ILIKE ?';
      params.push(`%${location_q}%`);
    }
    if (date_from) {
      query += ' AND e.date >= ?';
      params.push(date_from);
    }
    if (date_to) {
      query += ' AND e.date <= ?';
      params.push(date_to);
    }
    if (capacity_min !== undefined && capacity_min !== '') {
      const min = Number(capacity_min);
      if (Number.isFinite(min)) {
        query += ' AND e.capacity IS NOT NULL AND e.capacity >= ?';
        params.push(min);
      }
    }
    if (capacity_max !== undefined && capacity_max !== '') {
      const max = Number(capacity_max);
      if (Number.isFinite(max)) {
        query += ' AND e.capacity IS NOT NULL AND e.capacity <= ?';
        params.push(max);
      }
    }
    if (event_type) {
      query += ' AND e.event_type = ?';
      params.push(event_type);
    }
    if (has_waitlist === 'true') {
      query += ' AND e.waitlist_enabled = TRUE';
    } else if (has_waitlist === 'false') {
      query += ' AND COALESCE(e.waitlist_enabled, FALSE) = FALSE';
    }
    if (created_by !== undefined && created_by !== '') {
      const cb = Number(created_by);
      if (Number.isFinite(cb)) {
        query += ' AND e.created_by = ?';
        params.push(cb);
      }
    }

    // Sort (#580, #581). Whitelist sort keys to avoid SQL injection.
    const sortMap: Record<string, string> = {
      date_asc: 'e.date ASC',
      date_desc: 'e.date DESC',
      title_asc: 'e.title ASC',
      title_desc: 'e.title DESC',
      created_desc: 'e.created_at DESC',
      created_asc: 'e.created_at ASC',
    };
    const orderBy = sort && sortMap[sort] ? sortMap[sort] : 'e.date DESC';
    query += ` ORDER BY ${orderBy}`;

    const events = await db.all(query, params);
    res.json(events);
  } catch (error) {
    console.error('Error fetching events:', error);
    res.status(500).json({ error: 'Failed to fetch events' });
  }
}

/**
 * Get a single event by ID
 */
export async function getEventById(req: Request, res: Response): Promise<void> {
  try {
    const db = getDatabase();
    const { id } = req.params;

    const event = await db.get(
      `
      SELECT ${EVENT_SELECT_COLUMNS}
      FROM events e
      LEFT JOIN users u ON e.created_by = u.id
      WHERE e.id = $1 AND e.deleted_at IS NULL
    `,
      [id],
    );

    if (!event) {
      res.status(404).json({ error: 'Event not found' });
      return;
    }

    const tasks = await db.all(
      `SELECT t.*, COALESCE(u.display_name, t.assignee_name) AS assignee_name
       FROM tasks t
       LEFT JOIN users u ON t.assigned_user_id = u.id
       WHERE t.event_id = $1
       ORDER BY t.due_date ASC, t.priority ASC`,
      [id],
    );
    const rsvps = await db.all('SELECT * FROM rsvps WHERE event_id = $1 ORDER BY created_at DESC', [
      id,
    ]);
    const members = await db.all(
      `SELECT em.user_id, em.role, em.joined_at, u.display_name, u.email
       FROM event_members em
       JOIN users u ON u.id = em.user_id
       WHERE em.event_id = $1 AND u.deleted_at IS NULL
       ORDER BY em.joined_at DESC`,
      [id],
    );
    const availableUsers = await db.all(
      `SELECT u.id AS user_id, u.display_name, u.email, r.name AS role_name
       FROM users u
       LEFT JOIN roles r ON r.id = u.role_id
       WHERE u.deleted_at IS NULL
       ORDER BY u.display_name ASC`,
    );

    res.json({ event, tasks, rsvps, members, availableUsers });
  } catch (error) {
    console.error('Error fetching event:', error);
    res.status(500).json({ error: 'Failed to fetch event' });
  }
}

/**
 * Create a new event
 */
export async function createEvent(req: Request, res: Response): Promise<void> {
  try {
    const db = getDatabase();
    const authReq = req as AuthRequest;
    const userId = authReq.user?.id;
    const userEmail = authReq.user?.email;

    if (!userId) {
      res.status(401).json({ error: 'User not authenticated' });
      return;
    }

    const {
      title,
      // support both 'date', 'event_date', and 'start_date' as field name
      date: _date,
      event_date,
      start_date,
      // support both 'location' and 'venue_name' as field name
      location: _location,
      venue_name,
      description,
      capacity,
      status,
      event_type,
      is_public,
      tags,
      latitude,
      longitude,
      waitlist_enabled,
      event_time,
    } = req.body as EventData & { start_date?: string; venue_name?: string; event_date?: string };

    const date = _date || event_date || start_date;
    const location = _location || venue_name;

    // Validation
    if (!title || !date || !location) {
      res.status(400).json({ error: 'Title, date, and location are required' });
      return;
    }

    // Validate event_time format (HH:MM) — required for new events.
    if (!event_time) {
      res.status(400).json({ error: 'event_time is required (HH:MM format)' });
      return;
    }
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(event_time)) {
      res.status(400).json({ error: 'event_time must be in HH:MM format (e.g. 09:00, 14:30)' });
      return;
    }

    // Lifecycle: validate status against the full BRD v2 set (#575).
    if (status && !isValidStatus(status)) {
      res.status(400).json({
        error: `Invalid status. Must be one of: ${EVENT_STATUSES.join(', ')}`,
      });
      return;
    }
    const initialStatus: EventStatus = (status as EventStatus) || 'Draft';

    // Date validation (#574). New events must be today or future, unless
    // explicitly created as a historical (Completed/Cancelled) record.
    const dateError = validateEventDate(date, {
      isCreate: true,
      status: initialStatus,
    });
    if (dateError) {
      res.status(400).json({ error: dateError });
      return;
    }

    const lat = normalizeCoordinate(latitude, -90, 90);
    if (lat === 'invalid') {
      res.status(400).json({ error: 'latitude must be between -90 and 90' });
      return;
    }
    const lng = normalizeCoordinate(longitude, -180, 180);
    if (lng === 'invalid') {
      res.status(400).json({ error: 'longitude must be between -180 and 180' });
      return;
    }

    const result = await db.run(
      `
      INSERT INTO events (title, date, location, description, capacity, status, event_type, is_public, tags,
                          latitude, longitude, waitlist_enabled, event_time, created_by, updated_by)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
      RETURNING id
    `,
      [
        title,
        date,
        location,
        description ?? null,
        capacity ?? null,
        initialStatus,
        event_type ?? 'Other',
        is_public ?? false,
        tags ?? null,
        lat,
        lng,
        waitlist_enabled ?? false,
        event_time,
        userId,
        userId,
      ],
    );

    const newEvent = await db.get(
      `SELECT ${EVENT_BY_ID_SELECT_COLUMNS} FROM events WHERE id = $1`,
      [result.lastID],
    );
    if (newEvent?.id) {
      await captureEntityVersion(
        'event',
        Number(newEvent.id),
        newEvent as Record<string, unknown>,
        userId ?? null,
        'Event created',
      );
    }
    await db.run(
      'INSERT INTO audit_log (user_id, email, action, description, ip_address) VALUES ($1, $2, $3, $4, $5)',
      [
        userId,
        userEmail ?? null,
        'event.created',
        `Created event #${result.lastID}: ${title}`,
        authReq.ip ?? null,
      ],
    );
    publishRealtimeEvent({
      type: 'event.created',
      occurredAt: new Date().toISOString(),
      eventId: Number(result.lastID),
      entityType: 'event',
      entityId: Number(result.lastID),
      actorId: userId,
      payload: { title },
    });

    res.status(201).json(newEvent);
  } catch (error) {
    console.error('Error creating event:', error);
    res.status(500).json({ error: 'Failed to create event' });
  }
}

/**
 * Update an existing event
 */
export async function updateEvent(req: Request, res: Response): Promise<void> {
  try {
    const db = getDatabase();
    const { id } = req.params;
    const authReq = req as AuthRequest;
    const userId = authReq.user?.id;

    if (!userId) {
      res.status(401).json({ error: 'User not authenticated' });
      return;
    }

    const {
      title,
      date: _date,
      event_date,
      start_date,
      location: _location,
      venue_name,
      description,
      capacity,
      status,
      event_type,
      is_public,
      tags,
      latitude,
      longitude,
      waitlist_enabled,
      gallery_comments_enabled,
      gallery_guest_uploads,
      gallery_public,
      storage_quota_bytes,
      event_time,
    } = req.body as EventData & { start_date?: string; venue_name?: string; event_date?: string };

    const date = _date || event_date || start_date;
    const location = _location || venue_name;

    // Check if event exists
    const existingEvent = await db.get(
      'SELECT * FROM events WHERE id = $1 AND deleted_at IS NULL',
      [id],
    );
    if (!existingEvent) {
      res.status(404).json({ error: 'Event not found' });
      return;
    }

    if (Number(existingEvent.created_by) !== Number(userId) && authReq.user?.role_id !== 3) {
      res.status(403).json({ error: 'Not authorised to edit this event.' });
      return;
    }

    // Archived events cannot be edited until unarchived (#540, #578).
    if (existingEvent['archived_at']) {
      res.status(409).json({ error: 'Archived events must be unarchived before editing.' });
      return;
    }

    if (status && !isValidStatus(status)) {
      res.status(400).json({
        error: `Invalid status. Must be one of: ${EVENT_STATUSES.join(', ')}`,
      });
      return;
    }

    // Enforce legal status transitions (#575).
    if (status && status !== existingEvent['status']) {
      const isAdmin = authReq.user?.role_id === 3;
      const transitionError = describeInvalidTransition(
        existingEvent['status'] as EventStatus,
        status as EventStatus,
        isAdmin,
      );
      if (transitionError) {
        res.status(400).json({ error: transitionError });
        return;
      }
    }

    // Date validation on update (#574).
    if (date) {
      const dateError = validateEventDate(date, {
        isCreate: false,
        currentDate: existingEvent['date'] as string,
        status: (status as EventStatus) || (existingEvent['status'] as EventStatus),
      });
      if (dateError) {
        res.status(400).json({ error: dateError });
        return;
      }
    }

    let nextLat: number | null | undefined = existingEvent['latitude'] as number | null;
    if (latitude !== undefined) {
      const result = normalizeCoordinate(latitude, -90, 90);
      if (result === 'invalid') {
        res.status(400).json({ error: 'latitude must be between -90 and 90' });
        return;
      }
      nextLat = result;
    }
    let nextLng: number | null | undefined = existingEvent['longitude'] as number | null;
    if (longitude !== undefined) {
      const result = normalizeCoordinate(longitude, -180, 180);
      if (result === 'invalid') {
        res.status(400).json({ error: 'longitude must be between -180 and 180' });
        return;
      }
      nextLng = result;
    }

    // Storage quota override (#622) — only admins may raise the quota.
    let nextQuota = existingEvent['storage_quota_bytes'] as number | undefined;
    if (storage_quota_bytes !== undefined && storage_quota_bytes !== null) {
      const q = Number(storage_quota_bytes);
      if (!Number.isFinite(q) || q < 0) {
        res.status(400).json({ error: 'storage_quota_bytes must be a non-negative number.' });
        return;
      }
      const currentQuota = Number(existingEvent['storage_quota_bytes'] ?? 0);
      if (q > currentQuota && authReq.user?.role_id !== 3) {
        res.status(403).json({ error: 'Only admins can increase the storage quota.' });
        return;
      }
      nextQuota = q;
    }

    // Validate event_time format (HH:MM) if provided.
    if (event_time !== undefined && event_time !== null) {
      if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(event_time)) {
        res.status(400).json({ error: 'event_time must be in HH:MM format (e.g. 09:00, 14:30)' });
        return;
      }
    }
    const nextEventTime =
      event_time !== undefined
        ? event_time
        : ((existingEvent['event_time'] as string | null) ?? null);

    await db.run(
      `
      UPDATE events
      SET title = $1, date = $2, location = $3, description = $4, capacity = $5, status = $6,
          event_type = $7, is_public = $8, tags = $9, latitude = $10, longitude = $11, waitlist_enabled = $12,
          gallery_comments_enabled = $13, gallery_guest_uploads = $14, gallery_public = $15,
          storage_quota_bytes = $16, event_time = $17,
          updated_by = $18, updated_at = CURRENT_TIMESTAMP
      WHERE id = $19
    `,
      [
        title || existingEvent.title,
        date || existingEvent.date,
        location || existingEvent.location,
        description !== undefined ? description : existingEvent.description,
        capacity !== undefined ? capacity : existingEvent.capacity,
        status || existingEvent.status,
        event_type !== undefined ? event_type : existingEvent.event_type,
        is_public !== undefined ? is_public : existingEvent.is_public,
        tags !== undefined ? tags : existingEvent.tags,
        nextLat,
        nextLng,
        waitlist_enabled !== undefined ? waitlist_enabled : existingEvent['waitlist_enabled'],
        gallery_comments_enabled !== undefined
          ? Boolean(gallery_comments_enabled)
          : ((existingEvent['gallery_comments_enabled'] as boolean | undefined) ?? true),
        gallery_guest_uploads !== undefined
          ? Boolean(gallery_guest_uploads)
          : ((existingEvent['gallery_guest_uploads'] as boolean | undefined) ?? false),
        gallery_public !== undefined
          ? Boolean(gallery_public)
          : ((existingEvent['gallery_public'] as boolean | undefined) ?? false),
        nextQuota,
        nextEventTime,
        userId,
        id,
      ],
    );

    const updatedEvent = await db.get(
      `SELECT ${EVENT_BY_ID_SELECT_COLUMNS} FROM events WHERE id = $1`,
      [id],
    );
    if (updatedEvent?.id) {
      await captureEntityVersion(
        'event',
        Number(updatedEvent.id),
        updatedEvent as Record<string, unknown>,
        userId ?? null,
        'Event updated',
      );
    }
    await db.run(
      'INSERT INTO audit_log (user_id, email, action, description, ip_address) VALUES ($1, $2, $3, $4, $5)',
      [
        userId,
        authReq.user?.email ?? null,
        'event.updated',
        `Updated event #${id}: ${updatedEvent?.title ?? existingEvent.title}`,
        authReq.ip ?? null,
      ],
    );
    publishRealtimeEvent({
      type: 'event.updated',
      occurredAt: new Date().toISOString(),
      eventId: Number(id),
      entityType: 'event',
      entityId: Number(id),
      actorId: userId,
      payload: { title: updatedEvent?.title ?? existingEvent.title },
    });

    res.json(updatedEvent);
  } catch (error) {
    console.error('Error updating event:', error);
    res.status(500).json({ error: 'Failed to update event' });
  }
}

/**
 * Delete an event
 */
export async function deleteEvent(req: Request, res: Response): Promise<void> {
  try {
    const db = getDatabase();
    const { id } = req.params;
    const authReq = req as AuthRequest;
    const userId = authReq.user?.id;

    if (!userId) {
      res.status(401).json({ error: 'User not authenticated' });
      return;
    }

    const event = await db.get('SELECT * FROM events WHERE id = $1 AND deleted_at IS NULL', [id]);
    if (!event) {
      res.status(404).json({ error: 'Event not found' });
      return;
    }

    if (Number(event.created_by) !== Number(userId) && authReq.user?.role_id !== 3) {
      res.status(403).json({ error: 'Not authorised to delete this event.' });
      return;
    }

    await captureEntityVersion(
      'event',
      Number(id),
      event as Record<string, unknown>,
      userId ?? null,
      'Event deleted',
    );
    await db.run(
      'UPDATE events SET deleted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = $1',
      [id],
    );
    await db.run(
      'INSERT INTO audit_log (user_id, email, action, description, ip_address) VALUES ($1, $2, $3, $4, $5)',
      [
        userId,
        authReq.user?.email ?? null,
        'event.deleted',
        `Soft-deleted event #${id}: ${event.title}`,
        authReq.ip ?? null,
      ],
    );
    publishRealtimeEvent({
      type: 'event.deleted',
      occurredAt: new Date().toISOString(),
      eventId: Number(id),
      entityType: 'event',
      entityId: Number(id),
      actorId: userId,
      payload: { title: event.title },
    });

    res.json({ message: 'Event deleted successfully' });
  } catch (error) {
    console.error('Error deleting event:', error);
    res.status(500).json({ error: 'Failed to delete event' });
  }
}

/**
 * Clone an existing event — POST /api/events/:id/clone
 * Creates a new event row with title='Copy of X' and status='Draft'.
 * Pass ?includeTasks=true to copy tasks as well.
 */
export async function cloneEvent(req: Request, res: Response): Promise<void> {
  try {
    const db = getDatabase();
    const { id } = req.params;
    const authReq = req as AuthRequest;
    const userId = authReq.user?.id;

    if (!userId) {
      res.status(401).json({ error: 'User not authenticated' });
      return;
    }

    const source = await db.get('SELECT * FROM events WHERE id = $1 AND deleted_at IS NULL', [id]);
    if (!source) {
      res.status(404).json({ error: 'Event not found' });
      return;
    }

    const result = await db.run(
      `INSERT INTO events
         (title, date, location, description, capacity, status,
          cover_image_url, event_type, is_public, rsvp_deadline, tags, event_time, created_by)
       VALUES ($1, $2, $3, $4, $5, 'Draft', $6, $7, $8, $9, $10, $11, $12)
       RETURNING id`,
      [
        `Copy of ${source.title as string}`,
        source.date,
        source.location,
        source.description,
        source.capacity,
        source.cover_image_url ?? null,
        source.event_type ?? null,
        source.is_public ?? false,
        source.rsvp_deadline ?? null,
        source.tags ?? null,
        source.event_time ?? null,
        userId,
      ],
    );

    const newEventId: number = result.lastID as number;

    if (req.query['includeTasks'] === 'true') {
      const tasks = await db.all('SELECT * FROM tasks WHERE event_id = ?', [id]);
      for (const task of tasks as Record<string, unknown>[]) {
        await db.run(
          `INSERT INTO tasks
             (event_id, title, notes, assignee_name, due_date, status, priority, created_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            newEventId,
            task['title'],
            task['notes'] ?? null,
            task['assignee_name'] ?? null,
            task['due_date'] ?? null,
            task['status'] ?? 'Pending',
            task['priority'] ?? 'Medium',
            userId,
          ],
        );
      }
    }

    const newEvent = await db.get(
      `SELECT ${EVENT_BY_ID_SELECT_COLUMNS} FROM events WHERE id = $1`,
      [newEventId],
    );

    await recordEventAudit(
      db,
      authReq,
      'event.cloned',
      `Cloned event #${id} as new event #${newEventId}: ${source.title as string}`,
    );

    res.status(201).json(newEvent);
  } catch (error) {
    console.error('Error cloning event:', error);
    res.status(500).json({ error: 'Failed to clone event' });
  }
}

/**
 * Set cover image URL — PATCH /api/events/:id/cover
 * Body: { cover_image_url: string }
 * The image itself is uploaded via the existing documents endpoint;
 * this endpoint just records the URL reference.
 */
export async function setCoverImage(req: Request, res: Response): Promise<void> {
  try {
    const db = getDatabase();
    const { id } = req.params;
    const authReq = req as AuthRequest;
    const userId = authReq.user?.id;

    if (!userId) {
      res.status(401).json({ error: 'User not authenticated' });
      return;
    }

    const event = await db.get('SELECT * FROM events WHERE id = $1 AND deleted_at IS NULL', [id]);
    if (!event) {
      res.status(404).json({ error: 'Event not found' });
      return;
    }

    const { cover_image_url } = req.body as { cover_image_url?: string };
    if (!cover_image_url || typeof cover_image_url !== 'string') {
      res.status(400).json({ error: 'cover_image_url is required' });
      return;
    }

    // Only allow relative URLs or same-origin absolute URLs to prevent SSRF
    if (cover_image_url.startsWith('http://') || cover_image_url.startsWith('https://')) {
      const allowed = process.env['ALLOWED_COVER_IMAGE_ORIGIN'];
      if (!allowed || !cover_image_url.startsWith(allowed)) {
        res.status(400).json({ error: 'Absolute URLs are not permitted for cover images.' });
        return;
      }
    }

    // Cover image resize pipeline (#541, #576). Stash derived URLs in JSONB.
    // Only synthesise renditions when the URL points at a local uploaded file.
    const fileName = cover_image_url.startsWith('/api/uploads/event-documents/')
      ? path.basename(cover_image_url)
      : null;
    let renditions: ReturnType<typeof buildCoverRenditionUrls> | null = null;
    if (fileName) {
      renditions = buildCoverRenditionUrls(fileName);
      try {
        const UPLOADS_DIR = path.resolve('uploads/event-documents');
        await materialiseRenditions(UPLOADS_DIR, fileName);
      } catch (err) {
        // Failure to materialise renditions is non-fatal — we still record metadata.
        console.warn('[cover-resize] materialiseRenditions failed:', err);
      }
    }

    await db.run(
      `UPDATE events
          SET cover_image_url = $1, cover_image_sizes = $2::jsonb,
              updated_by = $3, updated_at = CURRENT_TIMESTAMP
        WHERE id = $4`,
      [cover_image_url, renditions ? JSON.stringify(renditions) : null, userId, id],
    );

    const updated = await db.get(`SELECT ${EVENT_BY_ID_SELECT_COLUMNS} FROM events WHERE id = $1`, [
      id,
    ]);
    res.json(updated);
  } catch (error) {
    console.error('Error setting cover image:', error);
    res.status(500).json({ error: 'Failed to set cover image' });
  }
}

/**
 * Archive an event — POST /api/events/:id/archive
 *
 * Archival is distinct from delete and from Cancelled status (#540, #578):
 *   - Event row remains active and queryable via ?archived=only.
 *   - Status is not changed; archived events keep their lifecycle state.
 *   - Mutating endpoints reject archived events until unarchived.
 *   - Owner or admin may archive.
 */
export async function archiveEvent(req: Request, res: Response): Promise<void> {
  try {
    const db = getDatabase();
    const { id } = req.params;
    const authReq = req as AuthRequest;
    const user = authReq.user;

    if (!user) {
      res.status(401).json({ error: 'User not authenticated' });
      return;
    }

    const event = await db.get(
      'SELECT id, title, created_by, archived_at FROM events WHERE id = $1 AND deleted_at IS NULL',
      [id],
    );
    if (!event) {
      res.status(404).json({ error: 'Event not found' });
      return;
    }

    if (Number(event.created_by) !== Number(user.id) && user.role_id !== 3) {
      res.status(403).json({ error: 'Not authorised to archive this event.' });
      return;
    }

    if (event.archived_at) {
      res.status(409).json({ error: 'Event is already archived.' });
      return;
    }

    const { reason } = (req.body ?? {}) as { reason?: unknown };
    const safeReason =
      typeof reason === 'string' && reason.trim() ? reason.trim().substring(0, 500) : null;

    await db.run(
      `UPDATE events
         SET archived_at = CURRENT_TIMESTAMP, archived_by = $1, archive_reason = $2,
             updated_by = $3, updated_at = CURRENT_TIMESTAMP
       WHERE id = $4`,
      [user.id, safeReason, user.id, id],
    );
    await recordEventAudit(
      db,
      authReq,
      'event.archived',
      `Archived event #${id}: ${event.title}${safeReason ? ` — ${safeReason}` : ''}`,
    );

    const updated = await db.get(`SELECT ${EVENT_BY_ID_SELECT_COLUMNS} FROM events WHERE id = $1`, [
      id,
    ]);
    if (updated?.id) {
      await captureEntityVersion(
        'event',
        Number(updated.id),
        updated as Record<string, unknown>,
        user.id ?? null,
        'Event archived',
      );
    }
    publishRealtimeEvent({
      type: 'event.archived',
      occurredAt: new Date().toISOString(),
      eventId: Number(id),
      entityType: 'event',
      entityId: Number(id),
      actorId: user.id,
      payload: { reason: safeReason },
    });
    res.json(updated);
  } catch (error) {
    console.error('Error archiving event:', error);
    res.status(500).json({ error: 'Failed to archive event' });
  }
}

/**
 * Unarchive an event — POST /api/events/:id/unarchive
 */
export async function unarchiveEvent(req: Request, res: Response): Promise<void> {
  try {
    const db = getDatabase();
    const { id } = req.params;
    const authReq = req as AuthRequest;
    const user = authReq.user;

    if (!user) {
      res.status(401).json({ error: 'User not authenticated' });
      return;
    }

    const event = await db.get(
      'SELECT id, title, created_by, archived_at FROM events WHERE id = $1',
      [id],
    );
    if (!event) {
      res.status(404).json({ error: 'Event not found' });
      return;
    }

    if (Number(event.created_by) !== Number(user.id) && user.role_id !== 3) {
      res.status(403).json({ error: 'Not authorised to unarchive this event.' });
      return;
    }

    if (!event.archived_at) {
      res.status(409).json({ error: 'Event is not archived.' });
      return;
    }

    await db.run(
      `UPDATE events
         SET archived_at = NULL, archived_by = NULL, archive_reason = NULL,
             updated_by = $1, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2`,
      [user.id, id],
    );
    await recordEventAudit(
      db,
      authReq,
      'event.unarchived',
      `Unarchived event #${id}: ${event.title}`,
    );

    const updated = await db.get(`SELECT ${EVENT_BY_ID_SELECT_COLUMNS} FROM events WHERE id = $1`, [
      id,
    ]);
    if (updated?.id) {
      await captureEntityVersion(
        'event',
        Number(updated.id),
        updated as Record<string, unknown>,
        user.id ?? null,
        'Event unarchived',
      );
    }
    publishRealtimeEvent({
      type: 'event.unarchived',
      occurredAt: new Date().toISOString(),
      eventId: Number(id),
      entityType: 'event',
      entityId: Number(id),
      actorId: user.id,
      payload: {},
    });
    res.json(updated);
  } catch (error) {
    console.error('Error unarchiving event:', error);
    res.status(500).json({ error: 'Failed to unarchive event' });
  }
}

/**
 * Restore a soft-deleted event
 */
export async function restoreEvent(req: Request, res: Response): Promise<void> {
  try {
    const db = getDatabase();
    const { id } = req.params;
    const authReq = req as AuthRequest;
    const user = authReq.user;

    if (!user) {
      res.status(401).json({ error: 'User not authenticated' });
      return;
    }

    if (user.role_id !== 3) {
      res.status(403).json({ error: 'Only admins can restore events' });
      return;
    }

    const event = await db.get('SELECT * FROM events WHERE id = $1 AND deleted_at IS NOT NULL', [
      id,
    ]);
    if (!event) {
      res.status(404).json({ error: 'Event not found' });
      return;
    }

    const deletedAtRaw = event.deleted_at as string | Date | null | undefined;
    const deletedAt = deletedAtRaw ? new Date(deletedAtRaw) : null;
    if (!deletedAt || Number.isNaN(deletedAt.getTime())) {
      res
        .status(409)
        .json({ error: 'Event cannot be restored due to invalid deletion timestamp.' });
      return;
    }

    const restoreDeadline = new Date(deletedAt.getTime() + EVENT_RESTORE_WINDOW_MS);
    if (Date.now() > restoreDeadline.getTime()) {
      res.status(410).json({
        error: `Restore window expired. Events can only be restored within ${EVENT_RESTORE_WINDOW_DAYS} days of deletion.`,
        deleted_at: deletedAt.toISOString(),
        restore_deadline: restoreDeadline.toISOString(),
      });
      return;
    }

    await db.run(
      'UPDATE events SET deleted_at = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = $1',
      [id],
    );
    await db.run(
      'INSERT INTO audit_log (user_id, email, action, description, ip_address) VALUES ($1, $2, $3, $4, $5)',
      [
        user.id,
        user.email,
        'event.restored',
        `Restored event #${id}: ${event.title}`,
        authReq.ip ?? null,
      ],
    );
    const restoredEvent = await db.get(
      `SELECT ${EVENT_BY_ID_SELECT_COLUMNS} FROM events WHERE id = $1`,
      [id],
    );
    if (restoredEvent?.id) {
      await captureEntityVersion(
        'event',
        Number(restoredEvent.id),
        restoredEvent as Record<string, unknown>,
        user.id ?? null,
        'Event restored',
      );
    }
    publishRealtimeEvent({
      type: 'event.restored',
      occurredAt: new Date().toISOString(),
      eventId: Number(id),
      entityType: 'event',
      entityId: Number(id),
      actorId: user.id,
      payload: {},
    });

    res.json({ message: 'Event restored successfully' });
  } catch (error) {
    console.error('Error restoring event:', error);
    res.status(500).json({ error: 'Failed to restore event' });
  }
}

/**
 * POST /api/geocode — task #806 (no event context)
 *
 * Stateless geocoding helper used by the create-event form. Returns the
 * top match without persisting anything. Returns 422 when nothing matches.
 */
export async function geocodeAddressOnly(req: Request, res: Response): Promise<void> {
  try {
    const authReq = req as AuthRequest;
    if (!authReq.user?.id) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }
    const { address } = req.body as { address?: string };
    const trimmed = typeof address === 'string' ? address.trim() : '';
    if (!trimmed) {
      res.status(400).json({ error: 'address is required.' });
      return;
    }
    const result = await geocodeAddress(trimmed);
    if (!result) {
      res.status(422).json({
        error: 'No geocoding match for the supplied address.',
        address: trimmed,
        provider: null,
      });
      return;
    }
    res.json({
      latitude: result.latitude,
      longitude: result.longitude,
      display_name: result.display_name,
      provider: result.provider,
      persisted: false,
    });
  } catch (error) {
    console.error('Error geocoding address:', error);
    res.status(500).json({ error: 'Failed to geocode address.' });
  }
}

/**
 * POST /api/events/:id/geocode — task #806
 *
 * Accepts `{ address, persist? }`. Resolves the address via the configured
 * geocoding adapter chain (default: Nominatim). When `persist === true`,
 * stores the coords on the event record. Falls through to a 422 response
 * when no provider can match — callers display the plain address text.
 */
export async function geocodeEventLocation(req: Request, res: Response): Promise<void> {
  try {
    const db = getDatabase();
    const { id } = req.params;
    const authReq = req as AuthRequest;
    const userId = authReq.user?.id;
    if (!userId) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }

    const { address, persist } = req.body as { address?: string; persist?: boolean };
    const trimmed = typeof address === 'string' ? address.trim() : '';
    if (!trimmed) {
      res.status(400).json({ error: 'address is required.' });
      return;
    }

    const event = await db.get<{ id: number; created_by: number }>(
      `SELECT id, created_by FROM events WHERE id = $1 AND deleted_at IS NULL`,
      [id],
    );
    if (!event) {
      res.status(404).json({ error: 'Event not found.' });
      return;
    }

    const result = await geocodeAddress(trimmed);
    if (!result) {
      res.status(422).json({
        error: 'No geocoding match for the supplied address.',
        address: trimmed,
        provider: null,
      });
      return;
    }

    if (persist) {
      await db.run(
        `UPDATE events SET latitude = $1, longitude = $2, updated_at = CURRENT_TIMESTAMP, updated_by = $3 WHERE id = $4`,
        [result.latitude, result.longitude, userId, id],
      );
    }

    res.json({
      latitude: result.latitude,
      longitude: result.longitude,
      display_name: result.display_name,
      provider: result.provider,
      persisted: Boolean(persist),
    });
  } catch (error) {
    console.error('Error geocoding event location:', error);
    res.status(500).json({ error: 'Failed to geocode address.' });
  }
}
