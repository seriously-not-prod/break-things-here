/**
 * In-memory pub/sub hub for the unified real-time SSE stream (#809).
 *
 * Subscribers register a set of topics they care about plus their SSE
 * Response object. Publishers call `publish(topic, data)` which fans out to
 * matching subscribers and triggers a Postgres NOTIFY so other replica
 * processes receive the same event via the pg-bridge.
 *
 * `publishLocal()` is called by the pg-bridge when a NOTIFY arrives from
 * another replica — it fans out without re-triggering NOTIFY, preventing
 * infinite loops.
 */
import type { Response } from 'express';
import { logger } from '../../utils/logger.js';

// ---------------------------------------------------------------------------
// Topic types
// ---------------------------------------------------------------------------

export type RealtimeTopic = 'events' | 'tasks' | 'budgets' | 'activity' | 'presence';

export const VALID_TOPICS: ReadonlySet<RealtimeTopic> = new Set<RealtimeTopic>([
  'events',
  'tasks',
  'budgets',
  'activity',
  'presence',
]);

export interface HubMessage {
  topic: RealtimeTopic;
  /** Discriminator for the specific event kind, e.g. "event.updated" */
  type: string;
  payload: Record<string, unknown>;
  occurredAt: string;
}

// ---------------------------------------------------------------------------
// Subscriber
// ---------------------------------------------------------------------------

interface HubSubscriber {
  /** Unique identity so we can safely delete without structural comparison. */
  readonly id: symbol;
  readonly topics: ReadonlySet<RealtimeTopic>;
  readonly res: Response;
  heartbeat: ReturnType<typeof setInterval>;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Send a SSE comment every 30 s to keep the TCP connection alive. */
const HEARTBEAT_INTERVAL_MS = 30_000;

// ---------------------------------------------------------------------------
// RealtimeHub
// ---------------------------------------------------------------------------

export class RealtimeHub {
  private readonly subscribers = new Set<HubSubscriber>();

  // ── Public API ──────────────────────────────────────────────────────────

  /**
   * Fan out a message to all local subscribers that have opted in to the
   * message's topic. Called by the pg-bridge for cross-replica events so a
   * second NOTIFY is NOT triggered.
   */
  publishLocal(message: HubMessage): void {
    const frame = `event: ${message.type}\ndata: ${JSON.stringify(message)}\n\n`;
    for (const sub of this.subscribers) {
      if (!sub.topics.has(message.topic)) continue;
      try {
        sub.res.write(frame);
      } catch (err) {
        logger.warn('[hub] write error — removing subscriber', { err: String(err) });
        this.removeSubscriber(sub);
      }
    }
  }

  /**
   * Publish a message to local subscribers AND notify other replicas via
   * Postgres LISTEN/NOTIFY.  The pg-bridge import is lazy to avoid a circular
   * dependency at module initialisation time.
   */
  async publish(message: HubMessage): Promise<void> {
    this.publishLocal(message);
    try {
      const { notifyReplicas } = await import('./pg-bridge.js');
      await notifyReplicas(message);
    } catch (err) {
      // Cross-replica sync is best-effort: log the failure but keep serving
      // local subscribers normally.
      logger.warn('[hub] PG NOTIFY failed — continuing without cross-replica sync', { err: String(err) });
    }
  }

  /**
   * Register an SSE response as a subscriber for the given topics.
   *
   * @returns An unsubscribe function — call it when the client disconnects.
   */
  subscribe(topics: RealtimeTopic[], res: Response): () => void {
    const sub: HubSubscriber = {
      id: Symbol(),
      topics: new Set(topics),
      res,
      heartbeat: setInterval(() => {
        try {
          res.write(`:hb ${Date.now()}\n\n`);
        } catch {
          this.removeSubscriber(sub);
        }
      }, HEARTBEAT_INTERVAL_MS),
    };
    this.subscribers.add(sub);
    return () => this.removeSubscriber(sub);
  }

  /** Number of currently active subscribers. Useful for health checks / tests. */
  get size(): number {
    return this.subscribers.size;
  }

  // ── Private helpers ─────────────────────────────────────────────────────

  private removeSubscriber(sub: HubSubscriber): void {
    if (!this.subscribers.has(sub)) return;
    clearInterval(sub.heartbeat);
    this.subscribers.delete(sub);
    try {
      sub.res.end();
    } catch {
      /* connection already closed */
    }
  }
}

/** Singleton hub shared across the entire process. */
export const hub = new RealtimeHub();
