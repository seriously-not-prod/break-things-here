/**
 * Collaboration Service
 * Issues: #623 #624 (notification preferences / batching)
 *         #625 #626 #627 (WebSocket sync, presence, conflict resolution)
 */

import { api } from '../lib/api-client';

// ── #623: Notification preferences ───────────────────────────────────────────

export const NOTIFICATION_TYPES = [
  'task_due',
  'task_overdue',
  'task_assigned',
  'budget_alert',
  'rsvp_submitted',
  'event_update',
  'chat_message',
  'event_reminder',
  'mention',
] as const;

export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export interface NotificationPreference {
  id: number;
  user_id: number;
  notification_type: NotificationType;
  email_enabled: boolean;
  in_app_enabled: boolean;
  push_enabled: boolean;
}

export interface NotificationBatchRule {
  id: number;
  notification_type: string;
  batch_window_mins: number;
  max_per_window: number;
}

export async function listNotificationPreferences(): Promise<NotificationPreference[]> {
  const data = await api.get<{ preferences: NotificationPreference[] }>(
    '/api/notifications/preferences',
  );
  return data.preferences;
}

export async function upsertNotificationPreference(
  type: NotificationType,
  prefs: { email_enabled?: boolean; in_app_enabled?: boolean; push_enabled?: boolean },
): Promise<NotificationPreference> {
  const data = await api.put<{ preference: NotificationPreference }>(
    `/api/notifications/preferences/${type}`,
    prefs,
  );
  return data.preference;
}

// ── #624: Batch rules ─────────────────────────────────────────────────────────

export async function listBatchRules(): Promise<NotificationBatchRule[]> {
  const data = await api.get<{ rules: NotificationBatchRule[] }>('/api/notifications/batch-rules');
  return data.rules;
}

// ── #626: Presence indicators ─────────────────────────────────────────────────

export type EntityType = 'task' | 'event' | 'timeline_activity';

export interface PresenceUser {
  user_id: number;
  display_name: string;
  started_at: string;
  last_seen_at: string;
}

export async function heartbeatPresence(
  entityType: EntityType,
  entityId: number,
): Promise<PresenceUser[]> {
  const data = await api.post<{ presence: PresenceUser[] }>('/api/presence', {
    entity_type: entityType,
    entity_id: entityId,
  });
  return data.presence;
}

export async function getPresence(
  entityType: EntityType,
  entityId: number,
): Promise<PresenceUser[]> {
  const data = await api.get<{ presence: PresenceUser[] }>(
    `/api/presence?entity_type=${entityType}&entity_id=${entityId}`,
  );
  return data.presence;
}

export async function leavePresence(entityType: EntityType, entityId: number): Promise<void> {
  await api.delete(`/api/presence?entity_type=${entityType}&entity_id=${entityId}`);
}

export async function getEventPresence(eventId: number): Promise<PresenceUser[]> {
  const data = await api.get<{ presence: PresenceUser[] }>(`/api/events/${eventId}/presence`);
  return data.presence;
}
