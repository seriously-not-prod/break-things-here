import type { Request, Response } from 'express';
import { requireEventAccess } from '../utils/event-access.js';
import { subscribeRealtimeEvents } from '../utils/realtime-bus.js';

interface AuthRequest extends Request {
  user?: { id: number; email: string; role_id: number };
}

/** GET /api/events/:eventId/realtime/stream */
export async function streamEventRealtime(req: Request, res: Response): Promise<void> {
  const authReq = req as AuthRequest;
  const { eventId } = req.params;
  const event = await requireEventAccess(authReq, res, eventId, { allowMembers: true });
  if (!event) return;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();

  res.write(`event: ready\ndata: ${JSON.stringify({ eventId: Number(eventId) })}\n\n`);

  const unsubscribe = subscribeRealtimeEvents(res, { eventId: Number(eventId) });
  req.on('close', unsubscribe);
}
