/**
 * Notifications Controller
 * BRD 3.11
 *
 * Route handlers (wired by integration owner):
 *   GET  /api/notifications               → listNotifications
 *   PATCH /api/notifications/:id          → markRead
 *   POST /api/notifications/mark-all-read → markAllRead
 *
 * Route added by this scope:
 *   GET /api/notifications/digest         → getDueTaskAlerts
 *
 * Internal helper functions (not routes — called by other controllers):
 *   createBudgetAlert
 *   createRsvpNotification
 *   createTaskDueAlert
 */

import { Request, Response } from 'express';
import { getDatabase } from '../db/database.js';
import { isChannelEnabled } from '../services/notifications/dispatch-guard.js';

interface AuthRequest extends Request {
  user?: { id: number; email: string; role_id: number };
}

// ── Route handlers ────────────────────────────────────────────────────────────

/** GET /api/notifications */
export async function listNotifications(req: AuthRequest, res: Response): Promise<void> {
  if (!req.user) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  const db = getDatabase();
  const rows = await db.all(
    `SELECT * FROM notifications
     WHERE user_id = $1
     ORDER BY created_at DESC
     LIMIT 50`,
    [req.user.id],
  );
  res.json({ notifications: rows });
}

/** PATCH /api/notifications/:id */
export async function markRead(req: AuthRequest, res: Response): Promise<void> {
  if (!req.user) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  const db = getDatabase();
  const { id } = req.params;
  // Validate id is a positive integer to prevent injection
  const notifId = Number(id);
  if (!Number.isInteger(notifId) || notifId <= 0) {
    res.status(400).json({ error: 'Invalid notification id' });
    return;
  }
  await db.run(
    `UPDATE notifications SET is_read = TRUE WHERE id = $1 AND user_id = $2`,
    [notifId, req.user.id],
  );
  res.json({ ok: true });
}

/** POST /api/notifications/mark-all-read */
export async function markAllRead(req: AuthRequest, res: Response): Promise<void> {
  if (!req.user) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  const db = getDatabase();
  await db.run(
    `UPDATE notifications SET is_read = TRUE WHERE user_id = $1`,
    [req.user.id],
  );
  res.json({ ok: true });
}

/**
 * GET /api/notifications/digest
 * Returns tasks due within the next 3 days that are not yet 'Complete',
 * scoped to the authenticated user.
 */
export async function getDueTaskAlerts(req: AuthRequest, res: Response): Promise<void> {
  if (!req.user) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  const db     = getDatabase();
  const userId = req.user.id;

  const rows = await db.all<{
    id:          number;
    title:       string;
    due_date:    string;
    status:      string;
    priority:    string;
    event_id:    number;
    event_title: string;
  }>(
    `SELECT t.id, t.title, t.due_date, t.status, t.priority, t.event_id,
            e.title AS event_title
     FROM tasks t
     JOIN events e ON t.event_id = e.id
     WHERE t.due_date IS NOT NULL
       AND t.due_date <> ''
       AND t.due_date::date <= (NOW() + INTERVAL '3 days')::date
       AND t.status <> 'Complete'
       AND e.deleted_at IS NULL
       AND (
         t.assigned_user_id = $1
         OR e.created_by = $2
         OR EXISTS (
           SELECT 1 FROM event_members em
           WHERE em.event_id = e.id AND em.user_id = $3
         )
       )
     ORDER BY t.due_date ASC`,
    [userId, userId, userId],
  );

  res.json({ tasks: rows });
}

// ── Internal helper functions ─────────────────────────────────────────────────

/**
 * Creates a budget_alert notification.
 * Called from budget-controller when a category's spending reaches >= 90% of
 * its allocated amount.
 *
 * @param eventId      - The event the budget category belongs to
 * @param userId       - The event owner to notify
 * @param categoryName - The budget category name
 * @param pct          - The utilisation percentage (0–100+)
 */
export async function createBudgetAlert(
  eventId: number,
  userId: number,
  categoryName: string,
  pct: number,
): Promise<void> {
  try {
    // Consult preference matrix before dispatching (#786)
    if (!(await isChannelEnabled(userId, 'in_app', 'budget_alert'))) return;

    const db   = getDatabase();
    const link = `/events/${eventId}/budget`;
    await db.run(
      `INSERT INTO notifications (user_id, type, title, body, link)
       VALUES ($1, 'budget_alert', 'Budget Warning', $2, $3)`,
      [
        userId,
        `Category "${categoryName}" is at ${pct}% of its allocation.`,
        link,
      ],
    );
  } catch (err) {
    console.error('createBudgetAlert failed:', err);
  }
}

/**
 * Creates an rsvp notification.
 * Called from rsvps-controller when an RSVP status changes to 'Going'.
 *
 * @param eventId   - The relevant event ID
 * @param userId    - The event owner to notify
 * @param guestName - The guest's display name
 */
export async function createRsvpNotification(
  eventId: number,
  userId: number,
  guestName: string,
): Promise<void> {
  try {
    // Consult preference matrix before dispatching (#786)
    if (!(await isChannelEnabled(userId, 'in_app', 'rsvp_submitted'))) return;

    const db   = getDatabase();
    const link = `/events/${eventId}/guests`;
    await db.run(
      `INSERT INTO notifications (user_id, type, title, body, link)
       VALUES ($1, 'rsvp', 'New RSVP', $2, $3)`,
      [userId, `${guestName} confirmed attendance.`, link],
    );
  } catch (err) {
    console.error('createRsvpNotification failed:', err);
  }
}

/**
 * Creates a task_due notification.
 * Called when a task is approaching its due date or becomes overdue.
 *
 * @param userId      - User to notify (typically the assignee or event owner)
 * @param taskTitle   - The task title
 * @param eventTitle  - The parent event title
 */
export async function createTaskDueAlert(
  userId: number,
  taskTitle: string,
  eventTitle: string,
): Promise<void> {
  try {
    // Consult preference matrix before dispatching (#786)
    if (!(await isChannelEnabled(userId, 'in_app', 'task_due'))) return;

    const db = getDatabase();
    await db.run(
      `INSERT INTO notifications (user_id, type, title, body)
       VALUES ($1, 'task_due', 'Task Due Soon', $2)`,
      [userId, `Task "${taskTitle}" for event "${eventTitle}" is due soon.`],
    );
  } catch (err) {
    console.error('createTaskDueAlert failed:', err);
  }
}

// ── #623: Notification preferences ───────────────────────────────────────────

const VALID_NOTIFICATION_TYPES = new Set([
  'task_due', 'task_overdue', 'task_assigned', 'budget_alert',
  'rsvp_submitted', 'event_update', 'chat_message', 'event_reminder',
]);

/** GET /api/notifications/preferences */
export async function listNotificationPreferences(req: AuthRequest, res: Response): Promise<void> {
  if (!req.user) { res.status(401).json({ error: 'Unauthorized' }); return; }
  const db = getDatabase();
  const rows = await db.all(
    'SELECT * FROM notification_type_preferences WHERE user_id = $1 ORDER BY notification_type ASC',
    [req.user.id],
  );
  res.json({ preferences: rows });
}

/** PUT /api/notifications/preferences/:type */
export async function upsertNotificationPreference(req: AuthRequest, res: Response): Promise<void> {
  if (!req.user) { res.status(401).json({ error: 'Unauthorized' }); return; }
  const { type } = req.params;
  if (!VALID_NOTIFICATION_TYPES.has(type)) {
    res.status(400).json({ error: `Invalid notification_type. Allowed: ${[...VALID_NOTIFICATION_TYPES].join(', ')}` });
    return;
  }
  const { email_enabled, in_app_enabled, push_enabled } = req.body as {
    email_enabled?: boolean;
    in_app_enabled?: boolean;
    push_enabled?: boolean;
  };

  const db = getDatabase();
  await db.run(
    `INSERT INTO notification_type_preferences (user_id, notification_type, email_enabled, in_app_enabled, push_enabled)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (user_id, notification_type) DO UPDATE SET
       email_enabled  = EXCLUDED.email_enabled,
       in_app_enabled = EXCLUDED.in_app_enabled,
       push_enabled   = EXCLUDED.push_enabled,
       updated_at     = CURRENT_TIMESTAMP`,
    [req.user.id, type, email_enabled ?? true, in_app_enabled ?? true, push_enabled ?? false],
  );
  const pref = await db.get(
    'SELECT * FROM notification_type_preferences WHERE user_id = $1 AND notification_type = $2',
    [req.user.id, type],
  );
  res.json({ preference: pref });
}

// ── #624: Notification batching / anti-spam ───────────────────────────────────

/** GET /api/notifications/batch-rules */
export async function listBatchRules(req: AuthRequest, res: Response): Promise<void> {
  if (!req.user) { res.status(401).json({ error: 'Unauthorized' }); return; }
  const db = getDatabase();
  const rules = await db.all('SELECT * FROM notification_batch_rules ORDER BY notification_type ASC');
  res.json({ rules });
}

/**
 * Batched notification creation — respects anti-spam rules.
 * Returns true if the notification was created; false if suppressed by anti-spam.
 */
export async function createBatchedNotification(
  userId: number,
  notificationType: string,
  title: string,
  body: string,
  link?: string,
  batchKey?: string,
): Promise<boolean> {
  try {
    const db = getDatabase();

    // Check user preference via new channel×category matrix — skip if in-app disabled (#786)
    const inAppEnabled = await isChannelEnabled(userId, 'in_app', notificationType as any);
    if (!inAppEnabled) return false;

    // Apply batch window / anti-spam
    const rule = await db.get<{ batch_window_mins: number; max_per_window: number }>(
      'SELECT batch_window_mins, max_per_window FROM notification_batch_rules WHERE notification_type = $1',
      [notificationType],
    );
    if (rule && batchKey) {
      const recent = await db.get<{ cnt: number }>(
        `SELECT COUNT(*) AS cnt FROM notifications
         WHERE user_id = $1 AND batch_key = $2
           AND created_at > datetime('now', $3)`,
        [userId, batchKey, `-${rule.batch_window_mins} minutes`],
      );
      if (recent && recent.cnt >= rule.max_per_window) return false; // suppressed
    }

    await db.run(
      `INSERT INTO notifications (user_id, type, title, body, link, notification_type, batch_key)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [userId, notificationType, title, body, link ?? null, notificationType, batchKey ?? null],
    );
    return true;
  } catch (err) {
    console.error('createBatchedNotification failed:', err);
    return false;
  }
}
