/**
 * Activity Feed Controller
 * Handles listing and logging activity feed entries for events.
 * BRD 3.12
 */

import { Request, Response } from 'express';
import { getDatabase } from '../db/database.js';

interface AuthRequest extends Request {
  user?: { id: number; email: string; role_id: number };
}

/**
 * GET /api/events/:eventId/feed
 * Returns last 50 activity_feed rows for the event, ordered newest first.
 * Joined with users.display_name as actor_name.
 */
export async function listFeed(req: Request, res: Response): Promise<void> {
  try {
    const db = getDatabase();
    const { eventId } = req.params;

    const event = await db.get(
      'SELECT id FROM events WHERE id = ? AND deleted_at IS NULL',
      [eventId],
    );
    if (!event) {
      res.status(404).json({ error: 'Event not found.' });
      return;
    }

    const feed = await db.all(
      `SELECT af.id,
              af.event_id,
              af.user_id,
              af.action_type,
              af.description,
              af.link,
              af.created_at,
              u.display_name AS actor_name
       FROM activity_feed af
       LEFT JOIN users u ON af.user_id = u.id
       WHERE af.event_id = ?
       ORDER BY af.created_at DESC
       LIMIT 50`,
      [eventId],
    );

    res.json({ feed });
  } catch (error) {
    console.error('Error fetching activity feed:', error);
    res.status(500).json({ error: 'Failed to fetch activity feed.' });
  }
}

/**
 * Inserts a new activity_feed row.
 * Called from other controllers when key actions occur (RSVP, tasks, expenses, check-in).
 * Never throws — silently logs on failure so callers are not disrupted.
 */
export async function logActivity(
  eventId: number | string,
  userId: number | null,
  actionType: string,
  description: string,
  link?: string,
): Promise<void> {
  try {
    const db = getDatabase();
    await db.run(
      `INSERT INTO activity_feed (event_id, user_id, action_type, description, link)
       VALUES (?, ?, ?, ?, ?)`,
      [eventId, userId ?? null, actionType, description, link ?? null],
    );
  } catch (err) {
    console.error('logActivity failed (non-fatal):', err);
  }
}
