/**
 * RSVP Controller
 * Handles CRUD operations for event RSVPs
 */

import { Request, Response } from 'express';
import { getDatabase } from '../db/database';
import { parsePagination, buildPaginatedResponse } from '../utils/pagination';
import { auditFromRequest } from '../utils/audit';

export interface RsvpData {
  event_id: number;
  name: string;
  email: string;
  guests?: number;
  status: 'Pending' | 'Confirmed' | 'Declined';
}

/**
 * Get all RSVPs — supports pagination via ?page=&limit= and optional
 * ?event_id= filter. Returns { data, total, page, limit } envelope.
 */
export async function getAllRsvps(req: Request, res: Response): Promise<void> {
  try {
    const db = getDatabase();
    const { event_id } = req.query;
    const pagination = parsePagination(req.query as Record<string, unknown>);

    const whereClause = event_id ? 'WHERE event_id = ?' : '';
    const countParams = event_id ? [event_id] : [];

    const countRow = await db.get(
      `SELECT COUNT(*) AS count FROM rsvps ${whereClause}`,
      countParams,
    );
    const total = (countRow?.count as number) ?? 0;

    const dataParams: unknown[] = event_id
      ? [event_id, pagination.limit, pagination.offset]
      : [pagination.limit, pagination.offset];

    const rsvps = await db.all(
      `SELECT * FROM rsvps ${whereClause} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      dataParams,
    );

    res.json(buildPaginatedResponse(rsvps, Number(total), pagination));
  } catch (error) {
    console.error('Error fetching RSVPs:', error);
    res.status(500).json({ error: 'Failed to fetch RSVPs' });
  }
}

/**
 * Get a single RSVP by ID
 */
export async function getRsvpById(req: Request, res: Response): Promise<void> {
  try {
    const db = getDatabase();
    const { id } = req.params;
    
    const rsvp = await db.get('SELECT * FROM rsvps WHERE id = ?', [id]);
    
    if (!rsvp) {
      res.status(404).json({ error: 'RSVP not found' });
      return;
    }
    
    res.json(rsvp);
  } catch (error) {
    console.error('Error fetching RSVP:', error);
    res.status(500).json({ error: 'Failed to fetch RSVP' });
  }
}

/**
 * Submit a new RSVP (public endpoint - no auth required)
 */
export async function submitRsvp(req: Request, res: Response): Promise<void> {
  try {
    const db = getDatabase();
    const { event_id, name, email, guests, status }: RsvpData = req.body;
    
    // Validation
    if (!event_id || !name || !email) {
      res.status(400).json({ error: 'Event ID, name, and email are required' });
      return;
    }
    
    // Email validation without regex to prevent ReDoS
    const atIndex = email.indexOf('@');
    const lastAtIndex = email.lastIndexOf('@');
    const lastDotIndex = email.lastIndexOf('.');
    
    if (email.length > 254 || 
        atIndex === -1 || 
        atIndex !== lastAtIndex || 
        atIndex === 0 || 
        lastDotIndex <= atIndex || 
        lastDotIndex === email.length - 1) {
      res.status(400).json({ error: 'Invalid email format' });
      return;
    }
    
    // Check if event exists
    const event = await db.get('SELECT id FROM events WHERE id = ?', [event_id]);
    if (!event) {
      res.status(404).json({ error: 'Event not found' });
      return;
    }
    
    if (status && !['Pending', 'Confirmed', 'Declined'].includes(status)) {
      res.status(400).json({ error: 'Invalid status' });
      return;
    }
    
    // Check for duplicate RSVP
    const existing = await db.get(
      'SELECT id FROM rsvps WHERE event_id = ? AND email = ?',
      [event_id, email]
    );
    
    if (existing) {
      res.status(409).json({ error: 'RSVP already exists for this email' });
      return;
    }
    
    const result = await db.run(`
      INSERT INTO rsvps (event_id, name, email, guests, status)
      VALUES (?, ?, ?, ?, ?)
      RETURNING id
    `, [event_id, name, email, guests || 1, status || 'Pending']);
    
    const newRsvp = await db.get('SELECT * FROM rsvps WHERE id = ?', [result.lastID]);
    
    res.status(201).json(newRsvp);
  } catch (error) {
    console.error('Error submitting RSVP:', error);
    res.status(500).json({ error: 'Failed to submit RSVP' });
  }
}

/**
 * Update an existing RSVP (requires auth)
 */
export async function updateRsvp(req: Request, res: Response): Promise<void> {
  try {
    const db = getDatabase();
    const { id } = req.params;
    const userId = (req as any).user?.id;
    
    if (!userId) {
      res.status(401).json({ error: 'User not authenticated' });
      return;
    }
    
    const { name, email, guests, status } = req.body;
    
    // Check if RSVP exists
    const existingRsvp = await db.get('SELECT * FROM rsvps WHERE id = ?', [id]);
    if (!existingRsvp) {
      res.status(404).json({ error: 'RSVP not found' });
      return;
    }
    
    // Validation
    if (status && !['Pending', 'Confirmed', 'Declined'].includes(status)) {
      res.status(400).json({ error: 'Invalid status' });
      return;
    }
    
    if (email) {
      // Email validation without regex to prevent ReDoS
      const atIndex = email.indexOf('@');
      const lastAtIndex = email.lastIndexOf('@');
      const lastDotIndex = email.lastIndexOf('.');
      
      if (email.length > 254 || 
          atIndex === -1 || 
          atIndex !== lastAtIndex || 
          atIndex === 0 || 
          lastDotIndex <= atIndex || 
          lastDotIndex === email.length - 1) {
        res.status(400).json({ error: 'Invalid email format' });
        return;
      }
    }
    
    await db.run(`
      UPDATE rsvps 
      SET name = ?, email = ?, guests = ?, status = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [
      name || existingRsvp.name,
      email || existingRsvp.email,
      guests !== undefined ? guests : existingRsvp.guests,
      status || existingRsvp.status,
      id
    ]);
    
    const updatedRsvp = await db.get('SELECT * FROM rsvps WHERE id = ?', [id]);

    // Log status change if it changed (#271)
    if (status && status !== existingRsvp.status) {
      await auditFromRequest(
        req,
        'rsvp.status_changed',
        `RSVP #${id} status changed from "${existingRsvp.status}" to "${status}"`,
      );
    }

    res.json(updatedRsvp);
  } catch (error) {
    console.error('Error updating RSVP:', error);
    res.status(500).json({ error: 'Failed to update RSVP' });
  }
}

/**
 * Delete an RSVP (requires auth)
 */
export async function deleteRsvp(req: Request, res: Response): Promise<void> {
  try {
    const db = getDatabase();
    const { id } = req.params;
    const userId = (req as any).user?.id;
    
    if (!userId) {
      res.status(401).json({ error: 'User not authenticated' });
      return;
    }
    
    const rsvp = await db.get('SELECT * FROM rsvps WHERE id = ?', [id]);
    if (!rsvp) {
      res.status(404).json({ error: 'RSVP not found' });
      return;
    }
    
    await db.run('DELETE FROM rsvps WHERE id = ?', [id]);
    
    res.json({ message: 'RSVP deleted successfully' });
  } catch (error) {
    console.error('Error deleting RSVP:', error);
    res.status(500).json({ error: 'Failed to delete RSVP' });
  }
}
