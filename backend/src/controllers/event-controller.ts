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
  status: 'Draft' | 'Active' | 'Completed';
}

interface AuthRequest extends Request {
  user?: { id: number; email: string; role_id: number };
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
 */
export async function getAllEvents(req: Request, res: Response): Promise<void> {
  try {
    const db = getDatabase();
    const events = await db.all(`
      SELECT e.*, u.display_name as created_by_name
      FROM events e
      LEFT JOIN users u ON e.created_by = u.id
      WHERE e.deleted_at IS NULL
      ORDER BY e.date DESC
    `);
    
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
      SELECT e.*, u.display_name as created_by_name
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
      start_date,
      end_date,
      venue_name,
      address,
      location,
      description,
      capacity,
      status,
      event_type,
      is_public,
      cover_image_url,
      tags,
    } = req.body as Record<string, unknown>;
    
    // Validation
    if (!title || !start_date) {
      res.status(400).json({ error: 'Title and start_date are required' });
      return;
    }
    
    const VALID_STATUSES = ['Draft', 'Planning', 'Confirmed', 'Active', 'Completed', 'Cancelled'];
    if (status && !VALID_STATUSES.includes(String(status))) {
      res.status(400).json({ error: 'Invalid status' });
      return;
    }

    const VALID_TYPES = ['Birthday', 'Wedding', 'Corporate', 'Festival', 'Conference', 'Other'];
    if (event_type && !VALID_TYPES.includes(String(event_type))) {
      res.status(400).json({ error: 'Invalid event_type' });
      return;
    }
    
    const result = await db.run(`
      INSERT INTO events (title, description, event_type, status, start_date, end_date, venue_name, address, location, capacity, is_public, cover_image_url, tags, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      RETURNING id
    `, [
      String(title).trim(),
      description ? String(description) : null,
      event_type ? String(event_type) : 'Other',
      status ? String(status) : 'Draft',
      String(start_date),
      end_date ? String(end_date) : null,
      venue_name ? String(venue_name) : null,
      address ? String(address) : null,
      location ? String(location) : null,
      capacity ? Number(capacity) : null,
      is_public ? (is_public ? 1 : 0) : 1,
      cover_image_url ? String(cover_image_url) : null,
      tags ? String(tags) : null,
      userId,
    ]);
    
    const newEvent = await db.get('SELECT * FROM events WHERE id = ?', [result.lastID]);
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
      start_date,
      end_date,
      venue_name,
      address,
      location,
      description,
      capacity,
      status,
      event_type,
      is_public,
      cover_image_url,
      tags,
    } = req.body as Record<string, unknown>;
    
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
    
    // Validation
    const VALID_STATUSES = ['Draft', 'Planning', 'Confirmed', 'Active', 'Completed', 'Cancelled'];
    if (status && !VALID_STATUSES.includes(String(status))) {
      res.status(400).json({ error: 'Invalid status' });
      return;
    }

    const VALID_TYPES = ['Birthday', 'Wedding', 'Corporate', 'Festival', 'Conference', 'Other'];
    if (event_type && !VALID_TYPES.includes(String(event_type))) {
      res.status(400).json({ error: 'Invalid event_type' });
      return;
    }

    await db.run(`
      UPDATE events
      SET title = ?, description = ?, event_type = ?, status = ?, start_date = ?, end_date = ?, venue_name = ?, address = ?, location = ?, capacity = ?, is_public = ?, cover_image_url = ?, tags = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [
      title || existingEvent.title,
      description !== undefined ? description : existingEvent.description,
      event_type ? String(event_type) : existingEvent.event_type ?? 'Other',
      status ? String(status) : existingEvent.status,
      start_date ? String(start_date) : existingEvent.start_date,
      end_date ? String(end_date) : existingEvent.end_date,
      venue_name ? String(venue_name) : existingEvent.venue_name,
      address ? String(address) : existingEvent.address,
      location ? String(location) : existingEvent.location,
      capacity !== undefined ? Number(capacity) : existingEvent.capacity,
      typeof is_public !== 'undefined' ? (is_public ? 1 : 0) : existingEvent.is_public,
      cover_image_url ? String(cover_image_url) : existingEvent.cover_image_url,
      tags ? String(tags) : existingEvent.tags,
      id,
    ]);
    
    const updatedEvent = await db.get('SELECT * FROM events WHERE id = ?', [id]);
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
