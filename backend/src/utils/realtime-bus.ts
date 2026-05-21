import type { Response } from 'express';

export interface RealtimeEventEnvelope {
  type: string;
  occurredAt: string;
  eventId?: number | null;
  entityType?: string | null;
  entityId?: number | null;
  actorId?: number | null;
  payload: Record<string, unknown>;
}

interface RealtimeSubscriber {
  res: Response;
  eventId?: number;
  entityTypes?: Set<string>;
  heartbeat: NodeJS.Timeout;
}

const subscribers = new Set<RealtimeSubscriber>();

function matchesFilter(subscriber: RealtimeSubscriber, envelope: RealtimeEventEnvelope): boolean {
  if (
    subscriber.eventId !== undefined &&
    envelope.eventId !== undefined &&
    subscriber.eventId !== envelope.eventId
  ) {
    return false;
  }
  if (subscriber.eventId !== undefined && envelope.eventId === undefined) {
    return false;
  }
  if (subscriber.entityTypes && subscriber.entityTypes.size > 0) {
    if (!envelope.entityType || !subscriber.entityTypes.has(envelope.entityType)) {
      return false;
    }
  }
  return true;
}

export function subscribeRealtimeEvents(
  res: Response,
  options?: { eventId?: number; entityTypes?: string[] },
): () => void {
  const sub: RealtimeSubscriber = {
    res,
    eventId: options?.eventId,
    entityTypes: options?.entityTypes ? new Set(options.entityTypes) : undefined,
    heartbeat: setInterval(() => {
      try {
        res.write(`:hb ${Date.now()}\n\n`);
      } catch {
        /* noop */
      }
    }, 25_000),
  };
  subscribers.add(sub);

  return () => {
    clearInterval(sub.heartbeat);
    subscribers.delete(sub);
    try {
      res.end();
    } catch {
      /* noop */
    }
  };
}

export function publishRealtimeEvent(envelope: RealtimeEventEnvelope): void {
  const frame = `event: ${envelope.type}\ndata: ${JSON.stringify(envelope)}\n\n`;
  for (const sub of subscribers) {
    if (!matchesFilter(sub, envelope)) continue;
    try {
      sub.res.write(frame);
    } catch {
      clearInterval(sub.heartbeat);
      subscribers.delete(sub);
    }
  }
}
