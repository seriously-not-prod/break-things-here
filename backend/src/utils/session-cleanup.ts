/**
 * Stale Session Cleanup Job
 *
 * Periodically purges expired sessions from the database to prevent
 * unbounded table growth. Runs on a configurable interval after server start.
 *
 * Addresses: #253 (Story)
 */

import { getDatabase } from '../db/database.js';
import logger from './logger.js';

/** Default cleanup interval: 15 minutes. */
const DEFAULT_INTERVAL_MS = 15 * 60 * 1000;

let cleanupTimer: ReturnType<typeof setInterval> | null = null;

/**
 * Deletes all sessions where expires_at is in the past.
 * Returns the number of deleted rows.
 */
export async function purgeExpiredSessions(): Promise<number> {
  const db = getDatabase();
  const result = await db.run(
    'DELETE FROM sessions WHERE expires_at < CURRENT_TIMESTAMP',
  );
  if (result.changes > 0) {
    logger.info({ purged: result.changes }, `Purged ${result.changes} expired session(s)`);
  }
  return result.changes;
}

/**
 * Starts the periodic cleanup job.
 *
 * @param intervalMs - How often to run (defaults to 15 minutes)
 */
export function startSessionCleanup(intervalMs?: number): void {
  const interval = intervalMs ?? DEFAULT_INTERVAL_MS;

  // Prevent duplicate timers
  if (cleanupTimer) return;

  // Run once immediately on startup
  purgeExpiredSessions().catch((err) => {
    logger.error({ err }, 'Session cleanup failed on startup');
  });

  cleanupTimer = setInterval(() => {
    purgeExpiredSessions().catch((err) => {
      logger.error({ err }, 'Session cleanup failed');
    });
  }, interval);

  // Allow Node to exit even if timer is running
  if (cleanupTimer.unref) {
    cleanupTimer.unref();
  }

  logger.info({ intervalMs: interval }, 'Session cleanup job started');
}

/**
 * Stops the periodic cleanup job. Useful for tests and graceful shutdown.
 */
export function stopSessionCleanup(): void {
  if (cleanupTimer) {
    clearInterval(cleanupTimer);
    cleanupTimer = null;
  }
}
