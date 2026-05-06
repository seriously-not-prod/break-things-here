/**
 * Messages Service — live backend adapter for event-scoped team conversations.
 *
 * Each event is treated as a conversation thread. Messages are scoped to the
 * event and delivered via the backend message API.
 *
 * Endpoints:
 *   GET    /api/events                            – list accessible events (threads)
 *   GET    /api/events/:eventId/messages          – fetch messages for a thread
 *   POST   /api/events/:eventId/messages          – send a message to a thread
 */

import { api } from '../lib/api-client';
import type { Conversation, Message } from '../types/message';

/** Shape of a message object returned by the backend. */
interface BackendMessage {
  id: number;
  event_id: number;
  sender_id: number;
  body: string;
  created_at: string;
  updated_at: string;
  sender_name: string;
}

/** Minimal event shape required to build conversation threads. */
interface BackendEvent {
  id: number;
  title: string;
  event_date: string;
  status: string;
}

/**
 * Maps a backend message row to the UI Message shape.
 * @param msg          - Raw backend message object.
 * @param currentUserId - ID of the currently authenticated user (for isOwn flag).
 */
function mapMessage(msg: BackendMessage, currentUserId: number): Message {
  return {
    id: String(msg.id),
    conversationId: String(msg.event_id),
    senderName: msg.sender_name,
    body: msg.body,
    sentAt: msg.created_at,
    isOwn: msg.sender_id === currentUserId,
  };
}

/**
 * Returns all events the current user can access, represented as conversation threads.
 * The event title is used as the thread display name.
 */
export async function listConversations(): Promise<Conversation[]> {
  const result = await api.get<{ events: BackendEvent[] }>('/api/events');
  return (result?.events ?? []).map((e) => ({
    id: String(e.id),
    eventId: e.id,
    participantName: e.title,
    participantAvatar: e.title.substring(0, 2).toUpperCase(),
    lastMessage: '',
    lastMessageAt: e.event_date,
    unreadCount: 0,
    isRead: true,
  }));
}

/**
 * Fetches all messages for the given event thread.
 * @param conversationId - String form of the numeric event ID.
 * @param currentUserId  - ID of the authenticated user (needed for isOwn flag).
 */
export async function getMessages(
  conversationId: string,
  currentUserId: number,
): Promise<Message[]> {
  const result = await api.get<{ messages: BackendMessage[] }>(
    `/api/events/${conversationId}/messages`,
  );
  return (result?.messages ?? []).map((m) => mapMessage(m, currentUserId));
}

/**
 * Posts a new message to the given event thread and returns the persisted message.
 * @param conversationId - String form of the numeric event ID.
 * @param body           - Message text (max 4 000 characters).
 * @param currentUserId  - ID of the authenticated user (needed for isOwn flag).
 */
export async function sendMessage(
  conversationId: string,
  body: string,
  currentUserId: number,
): Promise<Message> {
  const result = await api.post<{ message: BackendMessage }>(
    `/api/events/${conversationId}/messages`,
    { body },
  );
  return mapMessage(result.message, currentUserId);
}

