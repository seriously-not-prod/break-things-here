import { Request, Response } from 'express';
import { getDatabase } from '../db/database';
import {
  toCanonicalStatus,
  normalizeLegacyRsvpStatusInput,
  RSVP_STATUS_INPUT_ALIAS_LIST,
} from '../utils/rsvp-taxonomy';
import { logger } from '../utils/logger';
import { validateEmailFormat } from '../utils/auth-helpers';

interface AuthRequest extends Request {
  user?: { id: number; email: string; role_id: number };
}

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
    const params: (string | number)[] = [];

    if (event_id) {
      query += ' WHERE event_id = $1';
      params.push(String(event_id));
    }

    query += ' ORDER BY created_at DESC';

    const rsvps = await db.all(query, params);

    res.json(rsvps);
  } catch (error) {
    logger.error('Error fetching RSVPs', { error });
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
    logger.error('Error fetching RSVP', { error, id: req.params.id });
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

    if (!validateEmailFormat(email)) {
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
    logger.error('Error submitting RSVP', { error });
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
    const userId = (req as AuthRequest).user?.id;

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

    if (email && !validateEmailFormat(email)) {
      res.status(400).json({ error: 'Invalid email format' });
      return;
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
    logger.error('Error updating RSVP', { error, id: req.params.id });
    res.status(500).json({ error: 'Failed to update RSVP' });
  }
}

/**
 * Delete an RSVP (requires auth — user must own the RSVP or be an event admin)
 */
export async function deleteRsvp(req: Request, res: Response): Promise<void> {
  try {
    const db = getDatabase();
    const { id } = req.params;
    const user = (req as AuthRequest).user;

    if (!user) {
      res.status(401).json({ error: 'User not authenticated' });
      return;
    }

    const rsvp = await db.get<{ id: number; event_id: number; email: string }>(
      'SELECT id, event_id, email FROM rsvps WHERE id = $1',
      [id],
    );
    if (!rsvp) {
      res.status(404).json({ error: 'RSVP not found' });
      return;
    }

    // Authorization: allow if user is admin (role_id >= 3) or event creator
    if (user.role_id < 3) {
      const event = await db.get<{ created_by: number }>(
        'SELECT created_by FROM events WHERE id = $1',
        [rsvp.event_id],
      );
      if (!event || event.created_by !== user.id) {
        res.status(403).json({ error: 'Not authorised to delete this RSVP' });
        return;
      }
    }

    await db.run('DELETE FROM rsvps WHERE id = $1', [id]);

    res.json({ message: 'RSVP deleted successfully' });
  } catch (error) {
    logger.error('Error deleting RSVP', { error, id: req.params.id });
    res.status(500).json({ error: 'Failed to delete RSVP' });
  }
}
