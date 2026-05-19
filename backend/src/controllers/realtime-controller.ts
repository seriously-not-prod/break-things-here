import type { Request, Response } from 'express';
import { requireEventAccess } from '../utils/event-access.js';
import { subscribeRealtimeEvents } from '../utils/realtime-bus.js';
import { hub, VALID_TOPICS, type RealtimeTopic } from '../services/realtime/hub.js';

interface AuthRequest extends Request {
  user?: { id: number; email: string; role_id: number };
}

// ---------------------------------------------------------------------------
// Legacy event-scoped stream — back-compat (#809)
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Unified multiplexed stream (#809)
// ---------------------------------------------------------------------------

/**
 * GET /api/realtime/stream?topics=events,tasks,budgets,activity,presence
 *
 * Returns an SSE stream that multiplexes the requested topics.  The `topics`
 * query parameter is a comma-separated list of valid topic names.  Unknown
 * topic names are silently ignored; if no valid topics remain after filtering
 * a 400 is returned.
 *
 * Each SSE frame uses the message `type` field as the event name so clients
 * can attach topic-specific `EventSource.addEventListener` listeners.
 * A `:hb` comment is sent every 30 s to keep the TCP connection alive.
 */
export function streamRealtime(req: Request, res: Response): void {
  const rawTopics = typeof req.query.topics === 'string' ? req.query.topics : '';

  // Split, sanitise, and filter to known topics only — prevents open-ended
  // subscription attempts with arbitrary strings.
  const requestedTopics = rawTopics
    .split(',')
    .map((t) => t.trim().toLowerCase())
    .filter((t): t is RealtimeTopic => VALID_TOPICS.has(t as RealtimeTopic));

  if (requestedTopics.length === 0) {
    res.status(400).json({
      error: 'topics query parameter is required.',
      validTopics: Array.from(VALID_TOPICS),
    });
    return;
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();

  // Send an initial `ready` event so the client knows the stream is active.
  res.write(`event: ready\ndata: ${JSON.stringify({ topics: requestedTopics })}\n\n`);

  const unsubscribe = hub.subscribe(requestedTopics, res);
  req.on('close', unsubscribe);
}
