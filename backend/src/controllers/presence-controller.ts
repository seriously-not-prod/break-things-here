/**
 * Presence Controller — heartbeat and presence list endpoints (#811).
 *
 * POST /api/user-presence/heartbeat  — 30s heartbeat from frontend
 * DELETE /api/user-presence/leave    — explicit leave on logout/tab close
 * GET /api/user-presence/online      — list currently online/idle users
 */
import type { Request, Response } from 'express';
import { recordHeartbeat, recordLeave, getOnlineUsers } from '../services/realtime/presence.js';

interface AuthRequest extends Request {
  user?: { id: number; email: string; role_id: number };
}

/**
 * POST /api/user-presence/heartbeat
 * Called by the frontend every 30s to signal the user is still active.
 */
export async function heartbeat(req: Request, res: Response): Promise<Response> {
  const authReq = req as AuthRequest;
  if (!authReq.user) return res.status(401).json({ error: 'Unauthorized.' });

  await recordHeartbeat(authReq.user.id);
  return res.json({ ok: true });
}

/**
 * DELETE /api/user-presence/leave
 * Called on logout or when the tab/window is closed (via navigator.sendBeacon fallback).
 */
export async function leave(req: Request, res: Response): Promise<Response> {
  const authReq = req as AuthRequest;
  if (!authReq.user) return res.status(401).json({ error: 'Unauthorized.' });

  await recordLeave(authReq.user.id);
  return res.json({ ok: true });
}

/**
 * GET /api/user-presence/online
 * Returns list of currently online and idle users.
 */
export function online(req: Request, res: Response): Response {
  const authReq = req as AuthRequest;
  if (!authReq.user) return res.status(401).json({ error: 'Unauthorized.' });

  const users = getOnlineUsers();
  return res.json({ users });
}
