/**
 * Messages Service — typed adapter for the event-scoped backend message API.
 *
 * Each event acts as a conversation thread. All transport here goes through the
 * shared `api` client; no mock data is referenced.
 *
 * Endpoints:
 *   GET    /api/events                                      – list accessible events (threads)
 *   GET    /api/events/:eventId/messages?before=&limit=     – cursor-paginated message page
 *   POST   /api/events/:eventId/messages                    – send a message
 *   PATCH  /api/events/:eventId/messages/:id                – edit a message
 *   DELETE /api/events/:eventId/messages/:id                – soft-delete a message
 */

import { api } from '../lib/api-client';
import type {
  BackendEventDto,
  BackendMessageDto,
  Conversation,
  Message,
  MessagesPageOptions,
} from '../types/message';

/** Narrow type guard — checks the fields the UI actually depends on. */
function isBackendMessage(value: unknown): value is BackendMessageDto {
  if (!value || typeof value !== 'object') return false;
  const m = value as Record<string, unknown>;
  return (
    typeof m.id === 'number' &&
    typeof m.event_id === 'number' &&
    typeof m.sender_id === 'number' &&
    typeof m.body === 'string' &&
    typeof m.created_at === 'string' &&
    typeof m.updated_at === 'string' &&
    typeof m.sender_name === 'string'
  );
}

function isBackendEvent(value: unknown): value is BackendEventDto {
  if (!value || typeof value !== 'object') return false;
  const e = value as Record<string, unknown>;
  return (
    typeof e.id === 'number' &&
    typeof e.title === 'string' &&
    typeof e.event_date === 'string' &&
    typeof e.status === 'string'
  );
}

/** Map a backend message row to the UI Message shape. */
function mapMessage(msg: BackendMessageDto, currentUserId: number): Message {
  return {
    id: String(msg.id),
    conversationId: String(msg.event_id),
    senderName: msg.sender_name,
    senderId: msg.sender_id,
    body: msg.body,
    sentAt: msg.created_at,
    updatedAt: msg.updated_at,
    isOwn: msg.sender_id === currentUserId,
  };
}

/** Build a stable two-letter avatar from an event title. */
function buildAvatar(title: string): string {
  const trimmed = title.trim();
  if (trimmed.length === 0) return '??';
  return trimmed.substring(0, 2).toUpperCase();
}

/**
 * Returns all events the current user can access, represented as conversation threads.
 *
 * The list ships with placeholder `lastMessage`/`unreadCount` values; the inbox
 * fills these in as it loads each thread. There is no aggregate "latest message
 * per event" endpoint, so resolving them up front would be N+1 fan-out.
 */
export async function listConversations(): Promise<Conversation[]> {
  // Backend returns either a bare array (current shape) or `{ events: [...] }`
  // (older callers). Accept both so this adapter survives either contract.
  const result = await api.get<unknown[] | { events: unknown[] }>('/api/events');
  const raw = Array.isArray(result) ? result : (result?.events ?? []);
  const events = raw.filter(isBackendEvent);
  return events.map((e) => ({
    id: String(e.id),
    eventId: e.id,
    participantName: e.title,
    participantAvatar: buildAvatar(e.title),
    lastMessage: '',
    lastMessageAt: e.event_date,
    unreadCount: 0,
    isRead: true,
  }));
}

/**
 * Fetch a page of messages for an event thread, returned in chronological order.
 *
 * @param conversationId - String form of the numeric event ID.
 * @param currentUserId  - Authenticated user id (used to compute `isOwn`).
 * @param options        - Optional cursor (`before`) and page size (`limit`, max 100).
 */
export async function getMessages(
  conversationId: string,
  currentUserId: number,
  options: MessagesPageOptions = {},
): Promise<Message[]> {
  const params = new URLSearchParams();
  if (options.before !== undefined) params.set('before', String(options.before));
  if (options.limit !== undefined) params.set('limit', String(options.limit));
  const query = params.toString();
  const path = `/api/events/${conversationId}/messages${query ? `?${query}` : ''}`;

  const result = await api.get<{ messages: unknown[] }>(path);
  const messages = (result?.messages ?? []).filter(isBackendMessage);
  return messages.map((m) => mapMessage(m, currentUserId));
}

/**
 * Post a new message and return the persisted record.
 */
export async function sendMessage(
  conversationId: string,
  body: string,
  currentUserId: number,
): Promise<Message> {
  const result = await api.post<{ message: unknown }>(`/api/events/${conversationId}/messages`, {
    body,
  });
  if (!isBackendMessage(result?.message)) {
    throw new Error('Server returned an unexpected message payload.');
  }
  return mapMessage(result.message, currentUserId);
}

/**
 * Edit an existing message. The backend enforces that only the original sender,
 * the event owner, or an admin can mutate the row.
 */
export async function editMessage(
  conversationId: string,
  messageId: string,
  body: string,
  currentUserId: number,
): Promise<Message> {
  const result = await api.patch<{ message: unknown }>(
    `/api/events/${conversationId}/messages/${messageId}`,
    { body },
  );
  if (!isBackendMessage(result?.message)) {
    throw new Error('Server returned an unexpected message payload.');
  }
  return mapMessage(result.message, currentUserId);
}

/**
 * Soft-delete a message. The backend enforces sender/owner/admin authorization.
 */
export async function deleteMessage(conversationId: string, messageId: string): Promise<void> {
  await api.delete<{ message: string }>(`/api/events/${conversationId}/messages/${messageId}`);
}
