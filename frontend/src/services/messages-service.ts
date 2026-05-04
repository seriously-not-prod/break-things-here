/**
 * Messages Service — typed mock adapter (#385)
 * All functions can be swapped for real fetch calls without changing callers.
 */

import type { Conversation, Message } from '../types/message';

const MOCK_CONVERSATIONS: Conversation[] = [
  {
    id: 'conv-1',
    participantName: 'Alice Johnson',
    participantAvatar: 'AJ',
    lastMessage: 'Can you confirm the stage times for Saturday?',
    lastMessageAt: '2026-05-04T09:30:00Z',
    unreadCount: 2,
    isRead: false,
  },
  {
    id: 'conv-2',
    participantName: 'Bob Martinez',
    participantAvatar: 'BM',
    lastMessage: 'Vendor list has been updated, please review.',
    lastMessageAt: '2026-05-03T16:45:00Z',
    unreadCount: 0,
    isRead: true,
  },
  {
    id: 'conv-3',
    participantName: 'Carol Chen',
    participantAvatar: 'CC',
    lastMessage: 'Great, looking forward to the opening ceremony!',
    lastMessageAt: '2026-05-02T11:00:00Z',
    unreadCount: 0,
    isRead: true,
  },
];

const MOCK_MESSAGES: Record<string, Message[]> = {
  'conv-1': [
    {
      id: 'msg-1',
      conversationId: 'conv-1',
      senderName: 'Alice Johnson',
      body: 'Hi! I wanted to check in about the festival schedule.',
      sentAt: '2026-05-04T09:15:00Z',
      isOwn: false,
    },
    {
      id: 'msg-2',
      conversationId: 'conv-1',
      senderName: 'You',
      body: 'Sure, the schedule is being finalised now.',
      sentAt: '2026-05-04T09:20:00Z',
      isOwn: true,
    },
    {
      id: 'msg-3',
      conversationId: 'conv-1',
      senderName: 'Alice Johnson',
      body: 'Can you confirm the stage times for Saturday?',
      sentAt: '2026-05-04T09:30:00Z',
      isOwn: false,
    },
  ],
  'conv-2': [
    {
      id: 'msg-4',
      conversationId: 'conv-2',
      senderName: 'Bob Martinez',
      body: 'Vendor list has been updated, please review.',
      sentAt: '2026-05-03T16:45:00Z',
      isOwn: false,
    },
  ],
  'conv-3': [
    {
      id: 'msg-5',
      conversationId: 'conv-3',
      senderName: 'You',
      body: 'Looking forward to the opening ceremony!',
      sentAt: '2026-05-02T10:55:00Z',
      isOwn: true,
    },
    {
      id: 'msg-6',
      conversationId: 'conv-3',
      senderName: 'Carol Chen',
      body: 'Great, looking forward to the opening ceremony!',
      sentAt: '2026-05-02T11:00:00Z',
      isOwn: false,
    },
  ],
};

let conversationStore: Conversation[] = [...MOCK_CONVERSATIONS];
const messageStore: Record<string, Message[]> = Object.fromEntries(
  Object.entries(MOCK_MESSAGES).map(([k, v]) => [k, [...v]]),
);

export async function listConversations(): Promise<Conversation[]> {
  return [...conversationStore];
}

export async function getMessages(conversationId: string): Promise<Message[]> {
  return messageStore[conversationId] ? [...messageStore[conversationId]] : [];
}

export async function sendMessage(conversationId: string, body: string): Promise<Message> {
  const newMessage: Message = {
    id: `msg-${Date.now()}`,
    conversationId,
    senderName: 'You',
    body,
    sentAt: new Date().toISOString(),
    isOwn: true,
  };

  if (!messageStore[conversationId]) {
    messageStore[conversationId] = [];
  }
  messageStore[conversationId].push(newMessage);

  conversationStore = conversationStore.map((conv) =>
    conv.id === conversationId
      ? {
          ...conv,
          lastMessage: `You: ${body}`,
          lastMessageAt: newMessage.sentAt,
          isRead: true,
        }
      : conv,
  );

  return newMessage;
}
