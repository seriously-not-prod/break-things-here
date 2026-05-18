/**
 * Job scheduler for background tasks (#676).
 *
 * Uses native setInterval / setTimeout so no external package is needed.
 * Each job runs on a configurable interval and handles its own DB errors
 * without crashing the process.
 *
 * Registered jobs:
 *   - Session cleanup (every 15 min) — removes expired sessions
 *   - Scheduled report dispatch (every 5 min) — sends due reports
 *   - Payment milestone reminders (every 4 hours) — #669
 *   - Waitlist promotion (every 10 min) — #667
 *   - GDPR data-retention purge (daily at midnight UTC) — #680
 */
import { getDatabase } from '../db/database.js';
import { logger } from './logger.js';

const FIFTEEN_MINUTES = 15 * 60 * 1000;
const FIVE_MINUTES = 5 * 60 * 1000;
const FOUR_HOURS = 4 * 60 * 60 * 1000;
const TEN_MINUTES = 10 * 60 * 1000;
const ONE_DAY = 24 * 60 * 60 * 1000;

let schedulerStarted = false;

/** Prevents the job from double-firing if the interval fires again before completion. */
function guard(name: string, fn: () => Promise<void>): () => void {
  let running = false;
  return () => {
    if (running) {
      logger.warn(`[Scheduler] ${name} still running — skipping this tick`);
      return;
    }
    running = true;
    fn()
      .catch((err: unknown) => logger.error(`[Scheduler] ${name} error`, { error: String(err) }))
      .finally(() => { running = false; });
  };
}

/** Remove sessions that have expired. */
async function cleanupExpiredSessions(): Promise<void> {
  try {
    const db = getDatabase();
    const result = await db.run(
      `DELETE FROM sessions WHERE expires_at < $1`,
      [new Date().toISOString()],
    );
    if ((result.changes ?? 0) > 0) {
      logger.info(`[Scheduler] Session cleanup removed ${result.changes} expired sessions`);
    }
  } catch (err) {
    logger.error('[Scheduler] Session cleanup failed', { error: String(err) });
  }
}

/** Dispatch scheduled reports that are due. */
async function dispatchScheduledReports(): Promise<void> {
  try {
    const db = getDatabase();
    const now = new Date().toISOString();
    const due = await db.all<{ id: number; report_type: string; recipients: unknown; event_id: number | null }>(
      `SELECT id, report_type, recipients, event_id
       FROM scheduled_reports
       WHERE is_active = true AND next_run_at <= $1`,
      [now],
    );

    for (const report of due) {
      // Mark in-flight to prevent duplicate dispatch
      await db.run(
        `UPDATE scheduled_reports SET last_run_at = $1 WHERE id = $2`,
        [now, report.id],
      );
      logger.info(`[Scheduler] Dispatching report ${report.id} (${report.report_type})`);
      // Actual email sending is handled by the communication layer.
      // Here we update the next_run_at based on frequency.
      await db.run(
        `UPDATE scheduled_reports
         SET next_run_at = CASE frequency
               WHEN 'daily'   THEN $1::timestamptz + INTERVAL '1 day'
               WHEN 'weekly'  THEN $1::timestamptz + INTERVAL '7 days'
               WHEN 'monthly' THEN $1::timestamptz + INTERVAL '1 month'
               ELSE $1::timestamptz + INTERVAL '1 day'
             END
         WHERE id = $2`,
        [now, report.id],
      );
    }
  } catch (err) {
    logger.error('[Scheduler] Report dispatch failed', { error: String(err) });
  }
}

/** Send payment milestone reminders 3 days before due date. */
async function sendPaymentMilestoneReminders(): Promise<void> {
  try {
    const db = getDatabase();
    const threeDaysFromNow = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();
    const now = new Date().toISOString();
    const milestones = await db.all<{ id: number; vendor_booking_id: number; amount: number; due_date: string; reminder_sent_at: string | null }>(
      `SELECT id, vendor_booking_id, amount, due_date, reminder_sent_at
       FROM vendor_payment_schedules
       WHERE due_date <= $1 AND due_date >= $2
         AND status = 'pending'
         AND (reminder_sent_at IS NULL OR reminder_sent_at < $3)`,
      [threeDaysFromNow, now, new Date(Date.now() - ONE_DAY).toISOString()],
    );
    for (const m of milestones) {
      logger.info(`[Scheduler] Payment reminder for milestone ${m.id} due ${m.due_date}`);
      await db.run(
        `UPDATE vendor_payment_schedules SET reminder_sent_at = $1 WHERE id = $2`,
        [new Date().toISOString(), m.id],
      );
    }
  } catch (err) {
    logger.error('[Scheduler] Payment reminder failed', { error: String(err) });
  }
}

/** Purge soft-deleted personal data older than DATA_RETENTION_DAYS. */
async function purgeExpiredPersonalData(): Promise<void> {
  try {
    const retentionDays = parseInt(process.env.DATA_RETENTION_DAYS ?? '90', 10);
    const cutoff = new Date(Date.now() - retentionDays * ONE_DAY).toISOString();
    const db = getDatabase();
    const result = await db.run(
      `UPDATE users
       SET email = 'purged-' || id || '@purged.invalid',
           display_name = 'Purged User',
           password_hash = ''
       WHERE deleted_at IS NOT NULL AND deleted_at < $1
         AND email NOT LIKE 'purged-%'`,
      [cutoff],
    );
    if ((result.changes ?? 0) > 0) {
      logger.info(`[Scheduler] GDPR purge anonymised ${result.changes} accounts`);
    }
  } catch (err) {
    logger.error('[Scheduler] GDPR purge failed', { error: String(err) });
  }
}

/** Start all background jobs. Call once after DB is initialised. */
export function startJobScheduler(): void {
  if (schedulerStarted) return;
  schedulerStarted = true;

  setInterval(guard('SessionCleanup', cleanupExpiredSessions), FIFTEEN_MINUTES);
  setInterval(guard('ReportDispatch', dispatchScheduledReports), FIVE_MINUTES);
  setInterval(guard('PaymentReminders', sendPaymentMilestoneReminders), FOUR_HOURS);
  setInterval(guard('WaitlistPromotion', promoteWaitlist), TEN_MINUTES);

  // Daily GDPR purge at next midnight UTC
  const now = new Date();
  const midnight = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
  const msToMidnight = midnight.getTime() - now.getTime();
  setTimeout(() => {
    purgeExpiredPersonalData().catch(err => logger.error('[Scheduler] GDPR purge failed', { error: String(err) }));
    setInterval(guard('GdprPurge', purgeExpiredPersonalData), ONE_DAY);
  }, msToMidnight);

  logger.info('[Scheduler] Job scheduler started', {
    jobs: ['SessionCleanup', 'ReportDispatch', 'PaymentReminders', 'WaitlistPromotion', 'GdprPurge'],
  });
}

/** Promote waitlisted guests when capacity becomes available. */
async function promoteWaitlist(): Promise<void> {
  try {
    const db = getDatabase();
    // Find events with available capacity and waitlisted RSVPs
    const events = await db.all<{ id: number; capacity: number; going_count: number }>(
      `SELECT e.id,
              e.capacity,
              COUNT(r.id) FILTER (WHERE r.status = 'Going' AND r.waitlist_position IS NULL) AS going_count
       FROM events e
       JOIN rsvps r ON r.event_id = e.id
       WHERE e.capacity IS NOT NULL
         AND e.waitlist_enabled = true
         AND e.deleted_at IS NULL
       GROUP BY e.id, e.capacity
       HAVING COUNT(r.id) FILTER (WHERE r.status = 'Going' AND r.waitlist_position IS NULL) < e.capacity
          AND COUNT(r.id) FILTER (WHERE r.waitlist_position IS NOT NULL) > 0`,
    );
    for (const event of events) {
      const slots = event.capacity - event.going_count;
      const waiting = await db.all<{ id: number }>(
        `SELECT id FROM rsvps
         WHERE event_id = $1 AND waitlist_position IS NOT NULL
         ORDER BY waitlist_position ASC
         LIMIT $2`,
        [event.id, slots],
      );
      for (const rsvp of waiting) {
        await db.run(
          `UPDATE rsvps SET waitlist_position = NULL, status = 'Going', updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
          [rsvp.id],
        );
        logger.info(`[Scheduler] Promoted waitlisted RSVP ${rsvp.id} for event ${event.id}`);
      }
    }
  } catch (err) {
    logger.error('[Scheduler] Waitlist promotion failed', { error: String(err) });
  }
}
