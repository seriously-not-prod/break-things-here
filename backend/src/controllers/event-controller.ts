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
    
    res.json(event);
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
    
    const { title, date, location, description, status }: EventData = req.body;
    
    // Validation
    if (!title || !date || !location) {
      res.status(400).json({ error: 'Title, date, and location are required' });
      return;
    }
    
    if (status && !['Draft', 'Active', 'Completed'].includes(status)) {
      res.status(400).json({ error: 'Invalid status' });
      return;
    }
    
    const result = await db.run(`
      INSERT INTO events (title, date, location, description, status, created_by)
      VALUES (?, ?, ?, ?, ?, ?)
      RETURNING id
    `, [title, date, location, description || '', status || 'Draft', userId]);
    
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
    
    const { title, date, location, description, status }: EventData = req.body;
    
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
    if (status && !['Draft', 'Active', 'Completed'].includes(status)) {
      res.status(400).json({ error: 'Invalid status' });
      return;
    }
    
    await db.run(`
      UPDATE events 
      SET title = ?, date = ?, location = ?, description = ?, status = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [
      title || existingEvent.title,
      date || existingEvent.date,
      location || existingEvent.location,
      description !== undefined ? description : existingEvent.description,
      status || existingEvent.status,
      id
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
