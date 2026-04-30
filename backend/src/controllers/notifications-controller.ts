/**
 * Notifications Controller
 * Handles in-app notification retrieval and mark-read operations (story #240)
 */

import { Request, Response } from 'express';
import { getDatabase } from '../db/database.js';

interface AuthRequest extends Request {
  user?: { id: number; email: string; role_id: number };
}

export interface NotificationRow {
  id: number;
  user_id: number;
  type: string;
  title: string;
  body: string;
  read: number;
  link: string | null;
  created_at: string;
}

/**
 * GET /api/notifications
 * Returns all notifications for the authenticated user, newest first.
 */
export async function getNotifications(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: 'Unauthorised' });
      return;
    }

    const db = getDatabase();
    const notifications = await db.all<NotificationRow>(
      'SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC, id DESC',
      [userId],
    );

    const unreadCount = notifications.filter((n) => n.read === 0).length;

    res.status(200).json({ notifications, unreadCount });
  } catch (err) {
    console.error('getNotifications error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
}

/**
 * PATCH /api/notifications/read-all
 * Marks all notifications for the authenticated user as read.
 * NOTE: This route must be registered BEFORE /api/notifications/:id/read.
 */
export async function markAllRead(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: 'Unauthorised' });
      return;
    }

    const db = getDatabase();
    await db.run(
      'UPDATE notifications SET read = 1 WHERE user_id = ? AND read = 0',
      [userId],
    );

    res.status(200).json({ message: 'All notifications marked as read' });
  } catch (err) {
    console.error('markAllRead error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
}

/**
 * PATCH /api/notifications/:id/read
 * Marks a single notification as read (only if it belongs to the current user).
 */
export async function markOneRead(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: 'Unauthorised' });
      return;
    }

    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      res.status(400).json({ error: 'Invalid notification id' });
      return;
    }

    const db = getDatabase();
    const notification = await db.get<NotificationRow>(
      'SELECT * FROM notifications WHERE id = ? AND user_id = ?',
      [id, userId],
    );

    if (!notification) {
      res.status(404).json({ error: 'Notification not found' });
      return;
    }

    await db.run('UPDATE notifications SET read = 1 WHERE id = ?', [id]);

    res.status(200).json({ message: 'Notification marked as read' });
  } catch (err) {
    console.error('markOneRead error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
}
