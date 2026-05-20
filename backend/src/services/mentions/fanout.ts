/**
 * @mentions notification fanout — Issue #810
 *
 * After a chat message or task comment is persisted, call
 * `processMentions()` to:
 *
 *   1. Parse @mention tokens from the body.
 *   2. Resolve each token to a real user (by display_name or email prefix).
 *   3. Insert rows into `message_mentions` for analytics.
 *   4. Create an in-app notification for each mentioned user, subject to
 *      their notification preferences.
 *
 * The function is fire-and-forget safe — all errors are caught and logged
 * so a fanout failure never breaks the message creation response.
 */
import { getDatabase } from '../../db/database.js';
import { logger } from '../../utils/logger.js';
import { parseMentions } from './parse.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type MentionSourceType = 'chat_message' | 'task_comment';

export interface MentionContext {
  /** Type of entity that contains the message */
  sourceType: MentionSourceType;
  /** Primary key of the chat_message or task_comment row */
  sourceId: number;
  /** User who authored the message */
  authorId: number;
  /** Raw message body to scan for tokens */
  body: string;
  /** Human-readable label for the notification (e.g. "Event: My Party > Chat") */
  contextLabel: string;
  /** Deep-link for the notification */
  link: string;
  /** Event the message belongs to — used to scope handle resolution to event members */
  eventId: number;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

interface UserRow {
  id: number;
  display_name: string;
  email: string;
}

/**
 * Look up a user whose `display_name` or email-prefix matches `handle`.
 * The comparison is case-insensitive.
 *
 * Returns `undefined` when no user matches **or** when multiple users match
 * (ambiguous mention — skip to avoid notifying the wrong person).
 */
async function resolveHandle(
  handle: string,
  isQuoted: boolean,
  eventId: number,
): Promise<UserRow | undefined> {
  const db = getDatabase();
  if (isQuoted) {
    // Quoted form — match display_name only; require exactly one match.
    const rows = await db.all<UserRow>(
      `SELECT u.id, u.display_name, u.email
         FROM users u
         JOIN event_members em ON em.user_id = u.id AND em.event_id = $2
        WHERE LOWER(u.display_name) = LOWER($1)
          AND u.deleted_at IS NULL
        LIMIT 2`,
      [handle, eventId],
    );
    return rows.length === 1 ? rows[0] : undefined;
  }
  // Simple form — match display_name or the local part of the email address;
  // require exactly one match to avoid misdirected notifications.
  const rows = await db.all<UserRow>(
    `SELECT u.id, u.display_name, u.email
       FROM users u
       JOIN event_members em ON em.user_id = u.id AND em.event_id = $2
      WHERE (
            LOWER(u.display_name) = LOWER($1)
         OR LOWER(SPLIT_PART(u.email, '@', 1)) = LOWER($1)
      )
        AND u.deleted_at IS NULL
      LIMIT 2`,
    [handle, eventId],
  );
  return rows.length === 1 ? rows[0] : undefined;
}

/**
 * Insert a `message_mentions` row.  Idempotent on the unique constraint
 * `(source_type, source_id, mentioned_user_id)` — duplicate rows on replay
 * or retry are silently skipped.
 *
 * Returns `true` when a new row was inserted (notification should fire),
 * `false` when the row already existed (duplicate — skip notification).
 */
async function storeMention(
  sourceType: MentionSourceType,
  sourceId: number,
  mentionedUserId: number,
  authorId: number,
  rawToken: string,
): Promise<boolean> {
  const db = getDatabase();
  const result = await db.run(
    `INSERT INTO message_mentions
       (source_type, source_id, mentioned_user_id, mentioned_by_user_id, raw_token, created_by)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (source_type, source_id, mentioned_user_id) DO NOTHING`,
    [sourceType, sourceId, mentionedUserId, authorId, rawToken, authorId],
  );
  // changes === 0 means the row already existed (conflict was suppressed).
  return (result.changes ?? 0) > 0;
}

/**
 * Deliver an in-app notification to `userId`, respecting their preference for
 * the `mention` notification type.  Silently no-ops when preferences opt out.
 */
async function notifyUser(userId: number, authorId: number, ctx: MentionContext): Promise<void> {
  // A user mentioning themselves does not warrant a notification.
  if (userId === authorId) return;

  const db = getDatabase();

  // Honour opt-out preference when a row exists.
  const pref = await db.get<{ in_app_enabled: boolean }>(
    `SELECT in_app_enabled
       FROM notification_type_preferences
      WHERE user_id = $1 AND notification_type = 'mention'`,
    [userId],
  );
  if (pref && !pref.in_app_enabled) return;

  await db.run(
    `INSERT INTO notifications (user_id, type, title, body, link)
     VALUES ($1, $2, $3, $4, $5)`,
    [
      userId,
      'mention',
      'You were mentioned',
      `You were mentioned in ${ctx.contextLabel}.`,
      ctx.link,
    ],
  );
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Parse @mentions from `ctx.body`, persist them, and fan out notifications.
 *
 * This function is designed to be called **after** the message row has been
 * inserted (so `ctx.sourceId` is available).  It swallows all errors
 * internally so callers never need a try/catch.
 */
export async function processMentions(ctx: MentionContext): Promise<void> {
  try {
    const tokens = parseMentions(ctx.body);
    if (tokens.length === 0) return;

    await Promise.all(
      tokens.map(async (token) => {
        try {
          const user = await resolveHandle(token.handle, token.isQuoted, ctx.eventId);
          if (!user) return; // No matching user — token is decorative.

          const inserted = await storeMention(
            ctx.sourceType,
            ctx.sourceId,
            user.id,
            ctx.authorId,
            token.raw,
          );
          // Only notify when the mention row is newly inserted — avoids
          // duplicate notifications on retries/replays.
          if (inserted) {
            await notifyUser(user.id, ctx.authorId, ctx);
          }
        } catch (innerErr) {
          logger.warn(`[mentions] Failed to process token "${token.raw}"`, {
            err: String(innerErr),
          });
        }
      }),
    );
  } catch (err) {
    logger.warn('[mentions] processMentions failed', { err: String(err) });
  }
}
