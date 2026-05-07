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
  body: string;
  sentAt: string;
  isOwn: boolean;
}
