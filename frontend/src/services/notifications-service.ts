/**
 * Notifications Service
 * Typed API adapter for the notifications endpoints.
 * BRD 3.11
 */

import { api } from '../lib/api-client';

// ── Types ────────────────────────────────────────────────────────────────────

export interface Notification {
  id:         number;
  user_id:    number;
  type:       'budget_alert' | 'rsvp' | 'task_due' | string;
  title:      string;
  body:       string | null;
  link:       string | null;
  is_read:    boolean;
  created_at: string;
}

export interface NotificationDigestTask {
  id:          number;
  title:       string;
  due_date:    string;
  status:      string;
  priority:    string;
  event_id:    number;
  event_title: string;
}

export interface NotificationDigest {
  tasks: NotificationDigestTask[];
}

// ── Functions ────────────────────────────────────────────────────────────────

/**
 * Fetches the most recent notifications for the authenticated user.
 */
export async function listNotifications(): Promise<Notification[]> {
  const res = await api.get<{ notifications: Notification[] }>('/api/notifications');
  return res.notifications ?? [];
}

/**
 * Marks a single notification as read.
 */
export async function markRead(id: number): Promise<void> {
  await api.patch<{ ok: boolean }>(`/api/notifications/${id}`, {});
}

/**
 * Marks all notifications as read for the authenticated user.
 */
export async function markAllRead(): Promise<void> {
  await api.post<{ ok: boolean }>('/api/notifications/mark-all-read', {});
}

/**
 * Fetches tasks that are due within the next 3 days and not yet complete.
 */
export async function getDueTaskAlerts(): Promise<NotificationDigest> {
  return api.get<NotificationDigest>('/api/notifications/digest');
}
