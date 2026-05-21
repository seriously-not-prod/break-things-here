/**
 * Background job to permanently purge soft-deleted events (#778)
 *
 * Removes events where archived_at < NOW() - INTERVAL '$retention',
 * logs each purge to audit_log with row count and deleted IDs,
 * and supports dry-run mode for testing.
 */

import { getDatabase } from '../db/database.js';
import { logger } from '../utils/logger.js';

/**
 * Parse retention period from environment or use default
 * @returns retention period in milliseconds
 */
function getRetentionMs(): number {
  const retentionDays = parseInt(process.env.PURGE_RETENTION_DAYS ?? '30', 10);
  if (Number.isNaN(retentionDays) || retentionDays < 1) {
    logger.warn('[PurgeDeletedEvents] Invalid PURGE_RETENTION_DAYS, defaulting to 30 days');
    return 30 * 24 * 60 * 60 * 1000;
  }
  return retentionDays * 24 * 60 * 60 * 1000;
}

/**
 * Check if dry-run mode is enabled
 * @returns true if PURGE_DRY_RUN=true
 */
function isDryRun(): boolean {
  return process.env.PURGE_DRY_RUN === 'true';
}

/**
 * Permanently purge soft-deleted events older than retention window.
 * Logs each purge action to audit_log with row count and event IDs.
 * Supports dry-run mode that logs only without deleting.
 */
export async function purgeDeletedEvents(): Promise<void> {
  try {
    const db = getDatabase();
    const retentionMs = getRetentionMs();
    const cutoff = new Date(Date.now() - retentionMs).toISOString();
    const dryRun = isDryRun();

    // Find events older than retention window
    const eventsToDelete = await db.all<{
      id: number;
      title: string;
      archived_at: string;
    }>(
      `SELECT id, title, archived_at
       FROM events
       WHERE archived_at IS NOT NULL AND archived_at < $1
       ORDER BY archived_at ASC`,
      [cutoff],
    );

    if (eventsToDelete.length === 0) {
      logger.debug('[PurgeDeletedEvents] No events to purge');
      return;
    }

    const eventIds = eventsToDelete.map((e) => e.id);
    const deletedEventTitles = eventsToDelete.map((e) => `"${e.title}"(${e.id})`).join(', ');

    if (dryRun) {
      logger.info('[PurgeDeletedEvents] [DRY-RUN] Would purge', {
        count: eventsToDelete.length,
        eventIds,
        cutoffDate: cutoff,
      });

      // Log dry-run to audit_log
      await db.run(
        `INSERT INTO audit_log (action, description, context)
         VALUES ($1, $2, $3)`,
        [
          'PURGE_DELETED_EVENTS_DRY_RUN',
          `Dry-run: Would delete ${eventsToDelete.length} archived events`,
          JSON.stringify({
            count: eventsToDelete.length,
            event_ids: eventIds,
            cutoff_date: cutoff,
            retention_days: parseInt(process.env.PURGE_RETENTION_DAYS ?? '30', 10),
          }),
        ],
      );

      return;
    }

    // Delete events and related data (uses CASCADE deletes)
    // Events have cascading deletes, so removing events also removes related data:
    // tasks, rsvps, guests, schedules, galleries, etc.
    const result = await db.run(
      `DELETE FROM events
       WHERE id = ANY($1)`,
      [eventIds],
    );

    const deletedCount = result.changes ?? 0;

    // Log purge to audit_log
    await db.run(
      `INSERT INTO audit_log (action, description, context, severity)
       VALUES ($1, $2, $3, $4)`,
      [
        'PURGE_DELETED_EVENTS',
        `Permanently deleted ${deletedCount} archived events: ${deletedEventTitles}`,
        JSON.stringify({
          count: deletedCount,
          event_ids: eventIds,
          cutoff_date: cutoff,
          retention_days: parseInt(process.env.PURGE_RETENTION_DAYS ?? '30', 10),
        }),
        'INFO',
      ],
    );

    logger.info('[PurgeDeletedEvents] Purge complete', {
      count: deletedCount,
      eventIds,
      cutoffDate: cutoff,
    });
  } catch (err) {
    logger.error('[PurgeDeletedEvents] Purge failed', { error: String(err) });
  }
}
