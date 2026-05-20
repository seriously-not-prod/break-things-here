/**
 * Notification dispatch guard — #786
 *
 * Consults the `notification_preferences` matrix before allowing a
 * notification to be dispatched on a given channel.
 *
 * Usage:
 *   if (await isChannelEnabled(userId, 'email', 'budget_alert')) { … }
 */

import { getDatabase } from '../../db/database.js';

export type NotificationChannel = 'email' | 'in_app';

export type NotificationCategory =
  | 'task_due'
  | 'task_overdue'
  | 'task_assigned'
  | 'budget_alert'
  | 'rsvp_submitted'
  | 'event_update'
  | 'chat_message'
  | 'event_reminder';

export const SUPPORTED_CHANNELS: readonly NotificationChannel[] = ['email', 'in_app'] as const;

export const SUPPORTED_CATEGORIES: readonly NotificationCategory[] = [
  'task_due',
  'task_overdue',
  'task_assigned',
  'budget_alert',
  'rsvp_submitted',
  'event_update',
  'chat_message',
  'event_reminder',
] as const;

/**
 * Returns `true` when the user has not explicitly disabled the given
 * channel + category combination. If no row exists the preference
 * defaults to **enabled** (opt-out model).
 */
export async function isChannelEnabled(
  userId: number,
  channel: NotificationChannel,
  category: NotificationCategory,
): Promise<boolean> {
  const db = getDatabase();
  const row = await db.get<{ enabled: boolean }>(
    `SELECT enabled FROM notification_preferences
     WHERE user_id = $1 AND channel = $2 AND category = $3`,
    [userId, channel, category],
  );

  // No row → default enabled (opt-out model)
  return row === undefined ? true : row.enabled;
}

/**
 * Returns the full preference matrix for a user, keyed by category then
 * channel. Missing rows are treated as enabled.
 */
export async function getPreferenceMatrix(
  userId: number,
): Promise<
  Record<string, Record<NotificationChannel, boolean>>
> {
  const db = getDatabase();
  const rows = await db.all<{
    channel: NotificationChannel;
    category: NotificationCategory;
    enabled: boolean;
  }>(
    `SELECT channel, category, enabled
     FROM   notification_preferences
     WHERE  user_id = $1
     ORDER  BY category, channel`,
    [userId],
  );

  // Build a complete matrix with defaults for any missing entries
  const matrix: Record<string, Record<NotificationChannel, boolean>> = {};
  for (const cat of SUPPORTED_CATEGORIES) {
    matrix[cat] = { email: true, in_app: true };
  }
  for (const row of rows) {
    if (!matrix[row.category]) {
      matrix[row.category] = { email: true, in_app: true };
    }
    matrix[row.category][row.channel] = row.enabled;
  }

  return matrix;
}

/**
 * Bulk-update preference entries for a user. Creates missing rows.
 */
export async function updatePreferences(
  userId: number,
  updates: Array<{
    channel: NotificationChannel;
    category: NotificationCategory;
    enabled: boolean;
  }>,
): Promise<void> {
  const db = getDatabase();

  for (const { channel, category, enabled } of updates) {
    await db.run(
      `INSERT INTO notification_preferences (user_id, channel, category, enabled, updated_at)
       VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
       ON CONFLICT (user_id, channel, category) DO UPDATE SET
         enabled    = EXCLUDED.enabled,
         updated_at = CURRENT_TIMESTAMP`,
      [userId, channel, category, enabled],
    );
  }
}
