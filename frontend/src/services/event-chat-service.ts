/**
 * Event Chat Service
 * Issue: #628 — Integrated event team chat
 */

import { api } from '../lib/api-client';

export interface ChatMessage {
  id: number;
  event_id: number;
  user_id: number;
  body: string;
  reply_to_id: number | null;
  reply_to_body: string | null;
  reply_to_author: string | null;
  edited_at: string | null;
  deleted_at: string | null;
  created_at: string;
  author_name: string;
  author_email: string;
}

export async function listChatMessages(
  eventId: number,
  options?: { before?: string; limit?: number },
): Promise<ChatMessage[]> {
  const params = new URLSearchParams();
  if (options?.before) params.set('before', options.before);
  if (options?.limit) params.set('limit', String(options.limit));
  const qs = params.toString() ? `?${params.toString()}` : '';
  const data = await api.get<{ messages: ChatMessage[] }>(`/api/events/${eventId}/chat${qs}`);
  return data.messages;
}

export async function postChatMessage(
  eventId: number,
  body: string,
  replyToId?: number,
): Promise<ChatMessage> {
  const data = await api.post<{ message: ChatMessage }>(`/api/events/${eventId}/chat`, {
    body,
    reply_to_id: replyToId,
  });
  return data.message;
}

export async function editChatMessage(
  eventId: number,
  messageId: number,
  body: string,
): Promise<ChatMessage> {
  const data = await api.patch<{ message: ChatMessage }>(
    `/api/events/${eventId}/chat/${messageId}`,
    { body },
  );
  return data.message;
}

export async function deleteChatMessage(eventId: number, messageId: number): Promise<void> {
  await api.delete(`/api/events/${eventId}/chat/${messageId}`);
}
