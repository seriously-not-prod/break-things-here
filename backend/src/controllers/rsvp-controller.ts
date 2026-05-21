import { Request, Response } from 'express';
import { getDatabase } from '../db/database';
import {
  toCanonicalStatus,
  normalizeLegacyRsvpStatusInput,
  RSVP_STATUS_INPUT_ALIAS_LIST,
} from '../utils/rsvp-taxonomy';

export interface RsvpData {
  event_id: number;
  name: string;
  email: string;
  guests?: number;
  status?: string; // Legacy input aliases; mapped to canonical_status
}

/**
 * Get all RSVPs (optionally filtered by event)
 */
export async function getAllRsvps(req: Request, res: Response): Promise<void> {
  try {
    const db = getDatabase();
    const { event_id } = req.query;

    let query = 'SELECT * FROM rsvps';
    const params: any[] = [];

    if (event_id) {
      query += ' WHERE event_id = $1';
      params.push(event_id);
    }

    query += ' ORDER BY created_at DESC';

    const rsvps = await db.all(query, params);

    res.json(rsvps);
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

    const rsvp = await db.get('SELECT * FROM rsvps WHERE id = $1', [id]);

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

    if (
      email.length > 254 ||
      atIndex === -1 ||
      atIndex !== lastAtIndex ||
      atIndex === 0 ||
      lastDotIndex <= atIndex ||
      lastDotIndex === email.length - 1
    ) {
      res.status(400).json({ error: 'Invalid email format' });
      return;
    }

    // Check if event exists
    const event = await db.get('SELECT id FROM events WHERE id = $1', [event_id]);
    if (!event) {
      res.status(404).json({ error: 'Event not found' });
      return;
    }

    // Validate and normalize legacy status input to canonical status
    let normalizedStatus: string | null = null;
    if (status !== undefined) {
      const legacyForm = normalizeLegacyRsvpStatusInput(status);
      if (!legacyForm) {
        res.status(400).json({
          error: 'Invalid RSVP status.',
          allowed: RSVP_STATUS_INPUT_ALIAS_LIST,
        });
        return;
      }
      normalizedStatus = toCanonicalStatus(legacyForm);
    } else {
      normalizedStatus = 'pending';
    }

    // Check for duplicate RSVP
    const existing = await db.get('SELECT id FROM rsvps WHERE event_id = $1 AND email = $2', [
      event_id,
      email,
    ]);

    if (existing) {
      res.status(409).json({ error: 'RSVP already exists for this email' });
      return;
    }

    const result = await db.run(
      `
      INSERT INTO rsvps (event_id, name, email, guests, canonical_status)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id
    `,
      [event_id, name, email, guests || 1, normalizedStatus],
    );

    const newRsvp = await db.get('SELECT * FROM rsvps WHERE id = $1', [result.lastID]);

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
    const existingRsvp = await db.get('SELECT * FROM rsvps WHERE id = $1', [id]);
    if (!existingRsvp) {
      res.status(404).json({ error: 'RSVP not found' });
      return;
    }

    // Validation: normalize status alias to its canonical status value.
    let canonicalStatus: string | null = null;
    if (status !== undefined) {
      const legacyForm = normalizeLegacyRsvpStatusInput(status);
      if (!legacyForm) {
        res.status(400).json({
          error: 'Invalid RSVP status.',
          allowed: RSVP_STATUS_INPUT_ALIAS_LIST,
        });
        return;
      }
      canonicalStatus = toCanonicalStatus(legacyForm);
    }

    if (email) {
      // Email validation without regex to prevent ReDoS
      const atIndex = email.indexOf('@');
      const lastAtIndex = email.lastIndexOf('@');
      const lastDotIndex = email.lastIndexOf('.');

      if (
        email.length > 254 ||
        atIndex === -1 ||
        atIndex !== lastAtIndex ||
        atIndex === 0 ||
        lastDotIndex <= atIndex ||
        lastDotIndex === email.length - 1
      ) {
        res.status(400).json({ error: 'Invalid email format' });
        return;
      }
    }

    await db.run(
      `
      UPDATE rsvps
      SET name = $1, email = $2, guests = $3, canonical_status = $4, updated_at = CURRENT_TIMESTAMP
      WHERE id = $5
    `,
      [
        name || existingRsvp.name,
        email || existingRsvp.email,
        guests !== undefined ? guests : existingRsvp.guests,
        canonicalStatus || existingRsvp.canonical_status,
        id,
      ],
    );

    const updatedRsvp = await db.get('SELECT * FROM rsvps WHERE id = $1', [id]);

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

    const rsvp = await db.get('SELECT * FROM rsvps WHERE id = $1', [id]);
    if (!rsvp) {
      res.status(404).json({ error: 'RSVP not found' });
      return;
    }

    await db.run('DELETE FROM rsvps WHERE id = $1', [id]);

    res.json({ message: 'RSVP deleted successfully' });
  } catch (error) {
    console.error('Error deleting RSVP:', error);
    res.status(500).json({ error: 'Failed to delete RSVP' });
  }
}
