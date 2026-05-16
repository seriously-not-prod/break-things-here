import { Response } from 'express';
import { getDatabase } from '../db/database.js';

interface EventAccessRequest {
  user?: { id: number; email: string; role_id: number };
}

interface EventAccessOptions {
  allowMembers?: boolean;
  ownerOnly?: boolean;
  minEventRole?: EventMemberRole;
  notFoundMessage?: string;
  forbiddenMessage?: string;
}

export type EventMemberRole = 'Owner' | 'Co-Organizer' | 'Helper' | 'Guest';

const EVENT_ROLE_WEIGHT: Record<EventMemberRole, number> = {
  Owner: 4,
  'Co-Organizer': 3,
  Helper: 2,
  Guest: 1,
};

function normalizeEventRole(role: string | null | undefined): EventMemberRole | null {
  const value = (role ?? '').trim().toLowerCase();
  if (value === 'owner') return 'Owner';
  if (value === 'co-organizer' || value === 'coorganizer') return 'Co-Organizer';
  if (value === 'helper' || value === 'member') return 'Helper';
  if (value === 'guest') return 'Guest';
  return null;
}

function hasMinimumEventRole(actual: EventMemberRole, required: EventMemberRole): boolean {
  return EVENT_ROLE_WEIGHT[actual] >= EVENT_ROLE_WEIGHT[required];
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
    'SELECT id, created_by, deleted_at FROM events WHERE id = $1 AND deleted_at IS NULL',
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
    const membership = await db.get<{ user_id: number; role: string }>(
      'SELECT user_id, role FROM event_members WHERE event_id = $1 AND user_id = $2',
      [eventId, req.user.id],
    );

    if (membership) {
      if (!options.minEventRole) {
        return event;
      }

      const normalized = normalizeEventRole(membership.role);
      if (normalized && hasMinimumEventRole(normalized, options.minEventRole)) {
        return event;
      }
    }
  }

  res.status(403).json({ error: options.forbiddenMessage ?? 'Not authorised for this event.' });
  return null;
}