import { Request, Response } from 'express';
import { getDatabase } from '../db/database.js';
import { requireEventAccess } from '../utils/event-access.js';

interface AuthRequest extends Request {
  user?: { id: number; email: string; role_id: number };
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
     WHERE em.event_id = ? AND u.deleted_at IS NULL
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
  if (!Number.isInteger(numericUserId)) return res.status(400).json({ error: 'user_id is required.' });

  const user = await db.get('SELECT id FROM users WHERE id = ? AND deleted_at IS NULL', [numericUserId]);
  if (!user) return res.status(404).json({ error: 'User not found.' });

  await db.run(
    `INSERT INTO event_members (event_id, user_id, role)
     VALUES (?, ?, ?)
     ON CONFLICT (event_id, user_id) DO UPDATE SET role = EXCLUDED.role`,
    [eventId, numericUserId, role || 'Member'],
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

  await db.run('DELETE FROM event_members WHERE event_id = ? AND user_id = ?', [eventId, userId]);
  return res.json({ message: 'Member removed.' });
}