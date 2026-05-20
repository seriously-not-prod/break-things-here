import { Request, Response } from 'express';
import { getDatabase } from '../db/database.js';
import { requireEventAccess } from '../utils/event-access.js';

interface AuthRequest extends Request {
  user?: { id: number; email: string; role_id: number };
}

function normalizeIncomingEventRole(
  rawRole: string | undefined,
): 'Owner' | 'Co-Organizer' | 'Helper' | 'Guest' {
  const normalized = (rawRole ?? '').trim().toLowerCase();
  if (!normalized) return 'Helper';
  if (normalized === 'owner') return 'Owner';
  if (normalized === 'co-organizer' || normalized === 'coorganizer') return 'Co-Organizer';
  if (normalized === 'helper' || normalized === 'member') return 'Helper';
  if (normalized === 'guest') return 'Guest';
  throw new Error('Invalid event role. Allowed values: Owner, Co-Organizer, Helper, Guest.');
}

/** GET /api/events/:eventId/members */
export async function listMembers(req: Request, res: Response): Promise<Response> {
  const authReq = req as AuthRequest;
  const db = getDatabase();
  const { eventId } = req.params;
  const event = await requireEventAccess(authReq, res, eventId, {
    allowMembers: true,
    forbiddenMessage: 'Not authorised to view members for this event.',
  });
  if (!event) return res as Response;

  const members = await db.all(
    `SELECT em.user_id, em.role, em.joined_at, u.display_name, u.email
     FROM event_members em
     JOIN users u ON u.id = em.user_id
     WHERE em.event_id = $1 AND u.deleted_at IS NULL
     ORDER BY em.joined_at DESC`,
    [eventId],
  );

  const availableUsers = await db.all(
    `SELECT u.id AS user_id, u.display_name, u.email, r.name AS role_name
     FROM users u
     LEFT JOIN roles r ON r.id = u.role_id
     WHERE u.deleted_at IS NULL
     ORDER BY u.display_name ASC`,
  );

  return res.json({ members, availableUsers });
}

/** POST /api/events/:eventId/members */
export async function addMember(req: Request, res: Response): Promise<Response> {
  const authReq = req as AuthRequest;
  const db = getDatabase();
  const { eventId } = req.params;
  const { user_id, role } = req.body as { user_id?: number; role?: string };

  const event = await requireEventAccess(authReq, res, eventId, {
    ownerOnly: true,
    forbiddenMessage: 'Not authorised to manage members for this event.',
  });
  if (!event) return res as Response;

  const numericUserId = Number(user_id);
  if (!Number.isInteger(numericUserId))
    return res.status(400).json({ error: 'user_id is required.' });

  const user = await db.get('SELECT id FROM users WHERE id = $1 AND deleted_at IS NULL', [
    numericUserId,
  ]);
  if (!user) return res.status(404).json({ error: 'User not found.' });

  let eventRole: 'Owner' | 'Co-Organizer' | 'Helper' | 'Guest';
  try {
    eventRole = normalizeIncomingEventRole(role);
  } catch (error) {
    return res
      .status(400)
      .json({ error: error instanceof Error ? error.message : 'Invalid event role.' });
  }

  await db.run(
    `INSERT INTO event_members (event_id, user_id, role)
     VALUES ($1, $2, $3)
     ON CONFLICT (event_id, user_id) DO UPDATE SET role = EXCLUDED.role`,
    [eventId, numericUserId, eventRole],
  );

  return res.status(201).json({ message: 'Member added.' });
}

/** DELETE /api/events/:eventId/members/:userId */
export async function removeMember(req: Request, res: Response): Promise<Response> {
  const authReq = req as AuthRequest;
  const db = getDatabase();
  const { eventId, userId } = req.params;

  const event = await requireEventAccess(authReq, res, eventId, {
    ownerOnly: true,
    forbiddenMessage: 'Not authorised to manage members for this event.',
  });
  if (!event) return res as Response;

  await db.run('DELETE FROM event_members WHERE event_id = $1 AND user_id = $2', [eventId, userId]);
  return res.json({ message: 'Member removed.' });
}
