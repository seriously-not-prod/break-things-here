/**
 * Messaging type definitions.
 *
 * - `BackendEventDto` and `BackendMessageDto` mirror the backend payloads exactly
 *   and are the canonical source of truth for the API contract. They are used by
 *   the service adapter and any consumer that needs to read raw API data.
 * - `Conversation` and `Message` are the UI-facing shapes the components render.
 *   The service adapter maps DTOs into these.
 */

/** Raw event payload returned by `GET /api/events`. */
export interface BackendEventDto {
  id: number;
  title: string;
  event_date: string;
  status: string;
  created_by?: number;
}

/** Raw message payload returned by the event-scoped messages endpoints. */
export interface BackendMessageDto {
  id: number;
  event_id: number;
  sender_id: number;
  body: string;
  created_at: string;
  updated_at: string;
  sender_name: string;
}

/** Cursor pagination options accepted by `getMessages`. */
export interface MessagesPageOptions {
  /** Return messages strictly older than this id (cursor). */
  before?: number;
  /** Page size — backend caps at 100, defaults to 50. */
  limit?: number;
}

export interface Conversation {
  /** String form of the numeric event ID — used as the stable UI key. */
  id: string;
  /** Numeric event ID used for API calls. */
  eventId: number;
  participantName: string;
  participantAvatar: string;
  lastMessage: string;
  lastMessageAt: string;
  unreadCount: number;
  isRead: boolean;
}

export interface Message {
  id: string;
  conversationId: string;
  senderName: string;
  senderId: number;
  body: string;
  sentAt: string;
  updatedAt: string;
  isOwn: boolean;
}
