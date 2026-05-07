/**
 * Event Controller
 * Handles CRUD operations for festival events
 */

import { Request, Response } from 'express';
import { getDatabase } from '../db/database';

export interface EventData {
  title: string;
  date: string;
  location: string;
  description?: string;
  capacity?: number | null;
  status?: 'Draft' | 'Active' | 'Completed' | 'Cancelled';
  event_type?: string | null;
  is_public?: boolean;
  tags?: string | null;
  // Story #414 — map and waitlist
  latitude?: number | null;
  longitude?: number | null;
  waitlist_enabled?: boolean | null;
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
     WHERE r.event_id = e.id AND r.status = 'Going'
  ) AS going_count,
  (
    SELECT COALESCE(SUM(COALESCE(r.guests, 1)), 0)::int
      FROM rsvps r
     WHERE r.event_id = e.id AND r.status = 'Pending'
  ) AS pending_count
`;

const EVENT_BY_ID_SELECT_COLUMNS = `
  *,
  date AS event_date
`;

/**
 * Normalize an optional coordinate value.
 *
 * Returns:
 *   - the numeric value when valid and in range,
 *   - null when the input is null/undefined/empty (to clear the column),
 *   - 'invalid' when out of range or non-numeric (caller should reject the request).
 */
function normalizeCoordinate(
  value: unknown,
  min: number,
  max: number,
): number | null | 'invalid' {
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
    'INSERT INTO audit_log (user_id, email, action, description, ip_address) VALUES (?, ?, ?, ?, ?)',
    [req.user?.id ?? null, req.user?.email ?? null, action, description, req.ip ?? null],
  );
}

/**
 * Get all events
 *
 * Filters:
 *   ?owner=me                          — events created by the authenticated user
 *   ?status=Draft|Active|Completed     — single status
 *   ?q=keyword                         — quick search across title/description/location
 *   ?tags=tag1,tag2                    — comma-separated tag match (any-of)
 *
 * Advanced search — story #416, task #455:
 *   ?title_q=...                       — case-insensitive substring match on title
 *   ?location_q=...                    — case-insensitive substring match on location
 *   ?date_from=YYYY-MM-DD              — events on/after this date
 *   ?date_to=YYYY-MM-DD                — events on/before this date
 *   ?capacity_min=N                    — capacity >= N (or capacity IS NULL excluded)
 *   ?capacity_max=N                    — capacity <= N
 *   ?event_type=Concert                — exact event_type match
 *   ?has_waitlist=true|false           — waitlist_enabled flag
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
    };

    let query = `
      SELECT ${EVENT_SELECT_COLUMNS}
      FROM events e
      LEFT JOIN users u ON e.created_by = u.id
      WHERE e.deleted_at IS NULL
    `;
    const params: (string | number | boolean)[] = [];

    if (owner === 'me' && authReq.user?.id) {
      query += ' AND e.created_by = ?';
      params.push(authReq.user.id);
    }

    if (status) {
      query += ' AND e.status = ?';
      params.push(status);
    }

    if (q) {
      query += ' AND (e.title ILIKE ? OR e.description ILIKE ? OR e.location ILIKE ?)';
      const like = `%${q}%`;
      params.push(like, like, like);
    }

    if (tags) {
      const tagList = tags.split(',').map((t) => t.trim()).filter(Boolean);
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

    query += ' ORDER BY e.date DESC';

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
    
    const event = await db.get(`
      SELECT ${EVENT_SELECT_COLUMNS}
      FROM events e
      LEFT JOIN users u ON e.created_by = u.id
      WHERE e.id = ? AND e.deleted_at IS NULL
    `, [id]);
    
    if (!event) {
      res.status(404).json({ error: 'Event not found' });
      return;
    }
    
    const tasks = await db.all(
      `SELECT t.*, COALESCE(u.display_name, t.assignee_name) AS assignee_name
       FROM tasks t
       LEFT JOIN users u ON t.assigned_user_id = u.id
       WHERE t.event_id = ?
       ORDER BY t.due_date ASC, t.priority ASC`,
      [id],
    );
    const rsvps = await db.all('SELECT * FROM rsvps WHERE event_id = ? ORDER BY created_at DESC', [id]);
    const members = await db.all(
      `SELECT em.user_id, em.role, em.joined_at, u.display_name, u.email
       FROM event_members em
       JOIN users u ON u.id = em.user_id
       WHERE em.event_id = ? AND u.deleted_at IS NULL
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
      // support both 'date' and 'start_date' as field name
      date: _date, start_date,
      // support both 'location' and 'venue_name' as field name
      location: _location, venue_name,
      description,
      capacity,
      status,
      event_type,
      is_public,
      tags,
      latitude,
      longitude,
      waitlist_enabled,
    } = req.body as EventData & { start_date?: string; venue_name?: string };

    const date = _date || start_date;
    const location = _location || venue_name;

    // Validation
    if (!title || !date || !location) {
      res.status(400).json({ error: 'Title, date, and location are required' });
      return;
    }

    if (status && !['Draft', 'Active', 'Completed', 'Cancelled'].includes(status)) {
      res.status(400).json({ error: 'Invalid status. Must be Draft, Active, Completed, or Cancelled' });
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

    const result = await db.run(`
      INSERT INTO events (title, date, location, description, capacity, status, event_type, is_public, tags,
                          latitude, longitude, waitlist_enabled, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      RETURNING id
    `, [title, date, location, description ?? null, capacity ?? null, status || 'Draft',
        event_type ?? 'Other', is_public ?? false, tags ?? null,
        lat, lng, waitlist_enabled ?? false,
        userId]);
    
    const newEvent = await db.get(`SELECT ${EVENT_BY_ID_SELECT_COLUMNS} FROM events WHERE id = ?`, [result.lastID]);
    await db.run(
      'INSERT INTO audit_log (user_id, email, action, description, ip_address) VALUES (?, ?, ?, ?, ?)',
      [userId, userEmail ?? null, 'event.created', `Created event #${result.lastID}: ${title}`, authReq.ip ?? null],
    );
    
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
      date: _date, start_date,
      location: _location, venue_name,
      description,
      capacity,
      status,
      event_type,
      is_public,
      tags,
      latitude,
      longitude,
      waitlist_enabled,
    } = req.body as EventData & { start_date?: string; venue_name?: string };

    const date = _date || start_date;
    const location = _location || venue_name;

    // Check if event exists
    const existingEvent = await db.get('SELECT * FROM events WHERE id = ? AND deleted_at IS NULL', [id]);
    if (!existingEvent) {
      res.status(404).json({ error: 'Event not found' });
      return;
    }

    if (Number(existingEvent.created_by) !== Number(userId) && authReq.user?.role_id !== 3) {
      res.status(403).json({ error: 'Not authorised to edit this event.' });
      return;
    }

    if (status && !['Draft', 'Active', 'Completed', 'Cancelled'].includes(status)) {
      res.status(400).json({ error: 'Invalid status. Must be Draft, Active, Completed, or Cancelled' });
      return;
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

    await db.run(`
      UPDATE events
      SET title = ?, date = ?, location = ?, description = ?, capacity = ?, status = ?,
          event_type = ?, is_public = ?, tags = ?, latitude = ?, longitude = ?, waitlist_enabled = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [
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
      id,
    ]);
    
    const updatedEvent = await db.get(`SELECT ${EVENT_BY_ID_SELECT_COLUMNS} FROM events WHERE id = ?`, [id]);
    await db.run(
      'INSERT INTO audit_log (user_id, email, action, description, ip_address) VALUES (?, ?, ?, ?, ?)',
      [userId, authReq.user?.email ?? null, 'event.updated', `Updated event #${id}: ${updatedEvent?.title ?? existingEvent.title}`, authReq.ip ?? null],
    );
    
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
    
    const event = await db.get('SELECT * FROM events WHERE id = ? AND deleted_at IS NULL', [id]);
    if (!event) {
      res.status(404).json({ error: 'Event not found' });
      return;
    }
    
    if (Number(event.created_by) !== Number(userId) && authReq.user?.role_id !== 3) {
      res.status(403).json({ error: 'Not authorised to delete this event.' });
      return;
    }

    await db.run('UPDATE events SET deleted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [id]);
    await db.run(
      'INSERT INTO audit_log (user_id, email, action, description, ip_address) VALUES (?, ?, ?, ?, ?)',
      [userId, authReq.user?.email ?? null, 'event.deleted', `Soft-deleted event #${id}: ${event.title}`, authReq.ip ?? null],
    );
    
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

    const source = await db.get(
      'SELECT * FROM events WHERE id = ? AND deleted_at IS NULL',
      [id],
    );
    if (!source) {
      res.status(404).json({ error: 'Event not found' });
      return;
    }

    const result = await db.run(
      `INSERT INTO events
         (title, date, location, description, capacity, status,
          cover_image_url, event_type, is_public, rsvp_deadline, tags, created_by)
       VALUES (?, ?, ?, ?, ?, 'Draft', ?, ?, ?, ?, ?, ?)
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
        userId,
      ],
    );

    const newEventId: number = result.lastID as number;

    if (req.query['includeTasks'] === 'true') {
      const tasks = await db.all(
        'SELECT * FROM tasks WHERE event_id = ?',
        [id],
      );
      for (const task of tasks as Record<string, unknown>[]) {
        await db.run(
          `INSERT INTO tasks
             (event_id, title, notes, assignee_name, due_date, status, priority, created_by)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
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

    const newEvent = await db.get(`SELECT ${EVENT_BY_ID_SELECT_COLUMNS} FROM events WHERE id = ?`, [newEventId]);

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

    const event = await db.get(
      'SELECT * FROM events WHERE id = ? AND deleted_at IS NULL',
      [id],
    );
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

    await db.run(
      'UPDATE events SET cover_image_url = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [cover_image_url, id],
    );

    const updated = await db.get(`SELECT ${EVENT_BY_ID_SELECT_COLUMNS} FROM events WHERE id = ?`, [id]);
    res.json(updated);
  } catch (error) {
    console.error('Error setting cover image:', error);
    res.status(500).json({ error: 'Failed to set cover image' });
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

    const event = await db.get('SELECT * FROM events WHERE id = ? AND deleted_at IS NOT NULL', [id]);
    if (!event) {
      res.status(404).json({ error: 'Event not found' });
      return;
    }

    await db.run('UPDATE events SET deleted_at = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [id]);
    await db.run(
      'INSERT INTO audit_log (user_id, email, action, description, ip_address) VALUES (?, ?, ?, ?, ?)',
      [user.id, user.email, 'event.restored', `Restored event #${id}: ${event.title}`, authReq.ip ?? null],
    );

    res.json({ message: 'Event restored successfully' });
  } catch (error) {
    console.error('Error restoring event:', error);
    res.status(500).json({ error: 'Failed to restore event' });
  }
}
