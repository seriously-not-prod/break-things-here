/**
 * User Presence Service — online/offline/idle state management (#811).
 *
 * Maintains an in-memory map of user presence with periodic DB snapshots.
 * Publishes join/leave diffs over the SSE `presence` topic so subscribers
 * see real-time status changes.
 *
 * State transitions:
 *   - online: heartbeat received within last 60s
 *   - idle:   no heartbeat for 15 minutes
 *   - offline: no heartbeat for 30 minutes (row deleted or status set)
 */
import { getDatabase } from '../../db/database.js';
import { hub } from './hub.js';
import { logger } from '../../utils/logger.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PresenceStatus = 'online' | 'idle' | 'offline';

export interface UserPresenceEntry {
  userId: number;
  status: PresenceStatus;
  lastSeenAt: string;
  connectedAt: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** After 15 minutes of no heartbeat, user transitions to idle. */
const IDLE_THRESHOLD_MS = 15 * 60 * 1000;

/** After 30 minutes of no heartbeat, user is considered offline. */
const OFFLINE_THRESHOLD_MS = 30 * 60 * 1000;

/** Run the sweep every 60 seconds. */
const SWEEP_INTERVAL_MS = 60_000;

// ---------------------------------------------------------------------------
// In-memory presence map (single-replica; pg-bridge syncs cross-replica)
// ---------------------------------------------------------------------------

const presenceMap = new Map<number, { lastSeenAt: number; connectedAt: number }>();
let sweepTimer: ReturnType<typeof setInterval> | null = null;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Record a heartbeat for the given user. If the user was not previously
 * online, broadcasts a `presence.join` diff.
 */
export async function recordHeartbeat(userId: number): Promise<void> {
  const now = Date.now();
  const existing = presenceMap.get(userId);
  const wasOnline = existing !== undefined && computeStatus(existing.lastSeenAt, now) === 'online';

  presenceMap.set(userId, {
    lastSeenAt: now,
    connectedAt: existing?.connectedAt ?? now,
  });

  // Persist to DB (upsert)
  try {
    const db = getDatabase();
    await db.run(
      `INSERT INTO user_presence (user_id, status, last_seen_at, connected_at)
       VALUES ($1, 'online', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
       ON CONFLICT (user_id) DO UPDATE SET
         status = 'online',
         last_seen_at = CURRENT_TIMESTAMP`,
      [userId],
    );
  } catch (err) {
    logger.warn('[presence] DB upsert failed', { err: String(err) });
  }

  // Broadcast join if this is a new online user
  if (!wasOnline) {
    await hub.publish({
      topic: 'presence',
      type: 'presence.join',
      payload: { userId, status: 'online' },
      occurredAt: new Date(now).toISOString(),
    });
  }
}

/**
 * Explicitly mark a user as offline (e.g. on logout or disconnect).
 * Broadcasts a `presence.leave` diff.
 */
export async function recordLeave(userId: number): Promise<void> {
  presenceMap.delete(userId);

  try {
    const db = getDatabase();
    await db.run(
      `UPDATE user_presence SET status = 'offline', last_seen_at = CURRENT_TIMESTAMP
       WHERE user_id = $1`,
      [userId],
    );
  } catch (err) {
    logger.warn('[presence] DB leave update failed', { err: String(err) });
  }

  await hub.publish({
    topic: 'presence',
    type: 'presence.leave',
    payload: { userId, status: 'offline' },
    occurredAt: new Date().toISOString(),
  });
}

/**
 * Return the current presence list with computed statuses.
 */
export function getOnlineUsers(): UserPresenceEntry[] {
  const now = Date.now();
  const result: UserPresenceEntry[] = [];

  for (const [userId, entry] of presenceMap) {
    const status = computeStatus(entry.lastSeenAt, now);
    if (status === 'offline') continue; // exclude offline users from list
    result.push({
      userId,
      status,
      lastSeenAt: new Date(entry.lastSeenAt).toISOString(),
      connectedAt: new Date(entry.connectedAt).toISOString(),
    });
  }

  return result;
}

/**
 * Initialize the presence sweep timer. Call once at server start.
 */
export function initPresenceSweep(): void {
  if (sweepTimer) return;
  sweepTimer = setInterval(runSweep, SWEEP_INTERVAL_MS);
}

/**
 * Stop the presence sweep timer. Call on graceful shutdown.
 */
export function stopPresenceSweep(): void {
  if (sweepTimer) {
    clearInterval(sweepTimer);
    sweepTimer = null;
  }
}

/**
 * Hydrate in-memory map from DB on startup (recover after restart).
 */
export async function hydrateFromDb(): Promise<void> {
  try {
    const db = getDatabase();
    const rows = await db.all<{ user_id: number; last_seen_at: string; connected_at: string }>(
      `SELECT user_id, last_seen_at, connected_at FROM user_presence WHERE status != 'offline'`,
      [],
    );
    for (const row of rows) {
      presenceMap.set(row.user_id, {
        lastSeenAt: new Date(row.last_seen_at).getTime(),
        connectedAt: new Date(row.connected_at).getTime(),
      });
    }
  } catch (err) {
    logger.warn('[presence] hydrate from DB failed — starting with empty map', {
      err: String(err),
    });
  }
}

// ---------------------------------------------------------------------------
// Internals (exported for testing)
// ---------------------------------------------------------------------------

export function computeStatus(lastSeenAt: number, now: number): PresenceStatus {
  const elapsed = now - lastSeenAt;
  if (elapsed >= OFFLINE_THRESHOLD_MS) return 'offline';
  if (elapsed >= IDLE_THRESHOLD_MS) return 'idle';
  return 'online';
}

/**
 * Sweep stale entries: transition idle → offline, broadcast leave diffs.
 */
async function runSweep(): Promise<void> {
  const now = Date.now();
  const toRemove: number[] = [];

  for (const [userId, entry] of presenceMap) {
    const status = computeStatus(entry.lastSeenAt, now);
    if (status === 'offline') {
      toRemove.push(userId);
    }
  }

  for (const userId of toRemove) {
    presenceMap.delete(userId);
    try {
      const db = getDatabase();
      await db.run(`UPDATE user_presence SET status = 'offline' WHERE user_id = $1`, [userId]);
    } catch {
      /* best-effort */
    }
    await hub.publish({
      topic: 'presence',
      type: 'presence.leave',
      payload: { userId, status: 'offline' },
      occurredAt: new Date(now).toISOString(),
    });
  }
}

/** Expose for testing only — clear in-memory state. */
export function _resetForTest(): void {
  presenceMap.clear();
  stopPresenceSweep();
}
