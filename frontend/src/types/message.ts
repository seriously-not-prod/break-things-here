export interface Conversation {
  id: string;
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
