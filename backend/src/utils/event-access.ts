import { Response } from 'express';
import { getDatabase } from '../db/database.js';

interface EventAccessRequest {
  user?: { id: number; email: string; role_id: number };
}

interface EventAccessOptions {
  allowMembers?: boolean;
  ownerOnly?: boolean;
  notFoundMessage?: string;
  forbiddenMessage?: string;
}

export interface AuthorizedEvent {
  id: number;
  created_by: number;
  deleted_at: string | null;
}

export async function requireEventAccess(
  req: EventAccessRequest,
  res: Response,
  eventId: string,
  options: EventAccessOptions = {},
): Promise<AuthorizedEvent | null> {
  if (!req.user) {
    res.status(401).json({ error: 'Authentication required.' });
    return null;
  }

  const numericId = parseInt(eventId, 10);
  if (isNaN(numericId) || numericId <= 0) {
    res.status(400).json({ error: 'Invalid event ID.' });
    return null;
  }

  const db = getDatabase();
  const event = await db.get<AuthorizedEvent>(
    'SELECT id, created_by, deleted_at FROM events WHERE id = ? AND deleted_at IS NULL',
    [eventId],
  );

  if (!event) {
    res.status(404).json({ error: options.notFoundMessage ?? 'Event not found.' });
    return null;
  }

  const isAdmin = req.user.role_id >= 3;
  const isOwner = event.created_by === req.user.id;

  if (isAdmin || isOwner) {
    return event;
  }

  if (options.ownerOnly) {
    res.status(403).json({ error: options.forbiddenMessage ?? 'Not authorised for this event.' });
    return null;
  }

  if (options.allowMembers) {
    const membership = await db.get<{ user_id: number }>(
      'SELECT user_id FROM event_members WHERE event_id = ? AND user_id = ?',
      [eventId, req.user.id],
    );

    if (membership) {
      return event;
    }
  }

  res.status(403).json({ error: options.forbiddenMessage ?? 'Not authorised for this event.' });
  return null;
}