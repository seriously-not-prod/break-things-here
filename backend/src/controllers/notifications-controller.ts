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
     WHERE user_id = ?
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
    `UPDATE notifications SET is_read = TRUE WHERE id = ? AND user_id = ?`,
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
    `UPDATE notifications SET is_read = TRUE WHERE user_id = ?`,
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
         t.assigned_user_id = ?
         OR e.created_by = ?
         OR EXISTS (
           SELECT 1 FROM event_members em
           WHERE em.event_id = e.id AND em.user_id = ?
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
    const db   = getDatabase();
    const link = `/events/${eventId}/budget`;
    await db.run(
      `INSERT INTO notifications (user_id, type, title, body, link)
       VALUES (?, 'budget_alert', 'Budget Warning', ?, ?)`,
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
    const db   = getDatabase();
    const link = `/events/${eventId}/guests`;
    await db.run(
      `INSERT INTO notifications (user_id, type, title, body, link)
       VALUES (?, 'rsvp', 'New RSVP', ?, ?)`,
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
    const db = getDatabase();
    await db.run(
      `INSERT INTO notifications (user_id, type, title, body)
       VALUES (?, 'task_due', 'Task Due Soon', ?)`,
      [userId, `Task "${taskTitle}" for event "${eventTitle}" is due soon.`],
    );
  } catch (err) {
    console.error('createTaskDueAlert failed:', err);
  }
}
