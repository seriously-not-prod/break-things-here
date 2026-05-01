/**
 * Event Reminder Scheduler — Story #241
 *
 * Queries PostgreSQL for Active events happening tomorrow and sends a
 * 24-hour reminder email to every attendee with a "Going" RSVP status.
 *
 * Designed to be called once per day (e.g. via a cron job or setInterval
 * at server start-up). The function is exported so it can be unit-tested
 * independently of the scheduling mechanism.
 */

import { getDatabase } from '../db/database.js';
import { sendEventReminderEmail } from './auth-helpers.js';

interface TomorrowEvent {
  id: number;
  title: string;
  event_date: string;
  location: string | null;
}

interface RsvpRow {
  name: string;
  email: string;
}

/**
 * Finds all Active events whose event_date falls on tomorrow (UTC) and
 * sends a reminder email to every attendee with status = 'Going'.
 *
 * @returns The total number of reminder emails successfully sent.
 */
export async function sendTomorrowReminders(): Promise<number> {
  const db = getDatabase();
  let sent = 0;

  // Use PostgreSQL date arithmetic — no SQLite syntax
  const events = (await db.all(
    `SELECT id, title, event_date, location
     FROM events
     WHERE status = 'Active'
       AND deleted_at IS NULL
       AND DATE(event_date AT TIME ZONE 'UTC') = CURRENT_DATE + INTERVAL '1 day'`,
    [],
  )) as TomorrowEvent[];

  for (const event of events) {
    const rsvps = (await db.all(
      `SELECT name, email
       FROM rsvps
       WHERE event_id = $1
         AND status = 'Going'`,
      [event.id],
    )) as RsvpRow[];

    for (const rsvp of rsvps) {
      try {
        await sendEventReminderEmail(
          rsvp.email,
          rsvp.name,
          event.title,
          event.event_date,
          event.location,
        );
        sent++;
      } catch {
        // Log but continue — one failed email must not block the rest
        console.error(
          `Reminder failed for ${rsvp.email} (event ${event.id})`,
        );
      }
    }
  }

  console.log(`[reminder-scheduler] Sent ${sent} reminder email(s).`);
  return sent;
}

/**
 * Starts a daily scheduler that fires sendTomorrowReminders() every 24 hours.
 * Fires immediately on start, then once per day thereafter.
 *
 * Returns the interval handle so callers can clear it (useful in tests).
 */
export function startReminderScheduler(): NodeJS.Timeout {
  const MS_PER_DAY = 24 * 60 * 60 * 1000;

  // Fire once immediately so reminders are not missed on a cold start
  sendTomorrowReminders().catch((err) =>
    console.error('[reminder-scheduler] Initial run failed:', err),
  );

  return setInterval(() => {
    sendTomorrowReminders().catch((err) =>
      console.error('[reminder-scheduler] Scheduled run failed:', err),
    );
  }, MS_PER_DAY);
}
