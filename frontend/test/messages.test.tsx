import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MessagesInbox } from '../src/components/messages/messages-inbox';
import * as messagesService from '../src/services/messages-service';
import type { Conversation, Message } from '../src/types/message';

vi.mock('../src/services/messages-service');

// Mock useAuth so MessagesInbox can render without a real AuthProvider.
vi.mock('../src/contexts/auth-context', () => ({
  useAuth: () => ({ user: { id: 42, email: 'test@example.com', displayName: 'Test', roleId: 1 }, loading: false }),
}));

/** currentUserId used by the mocked useAuth above. */
const CURRENT_USER_ID = 42;

const mockedListConversations = vi.mocked(messagesService.listConversations);
const mockedGetMessages = vi.mocked(messagesService.getMessages);
const mockedSendMessage = vi.mocked(messagesService.sendMessage);
const mockedEditMessage = vi.mocked(messagesService.editMessage);
const mockedDeleteMessage = vi.mocked(messagesService.deleteMessage);

const MOCK_CONVERSATIONS: Conversation[] = [
  {
    id: 'conv-1',
    eventId: 1,
    participantName: 'Alice Johnson',
    participantAvatar: 'AJ',
    lastMessage: 'Can you confirm the stage times?',
    lastMessageAt: '2026-05-04T09:30:00Z',
    unreadCount: 2,
    isRead: false,
  },
  {
    id: 'conv-2',
    eventId: 2,
    participantName: 'Bob Martinez',
    participantAvatar: 'BM',
    lastMessage: 'Vendor list updated.',
    lastMessageAt: '2026-05-03T16:45:00Z',
    unreadCount: 0,
    isRead: true,
  },
];

const MOCK_MESSAGES_CONV1: Message[] = [
  {
    id: 'msg-1',
    conversationId: 'conv-1',
    senderName: 'Alice Johnson',
    senderId: 7,
    body: 'Hi, can you confirm stage times?',
    sentAt: '2026-05-04T09:00:00Z',
    updatedAt: '2026-05-04T09:00:00Z',
    isOwn: false,
  },
  {
    id: 'msg-own',
    conversationId: 'conv-1',
    senderName: 'Test',
    senderId: CURRENT_USER_ID,
    body: 'Yes — 7pm and 9pm.',
    sentAt: '2026-05-04T09:05:00Z',
    updatedAt: '2026-05-04T09:05:00Z',
    isOwn: true,
  },
];

const MOCK_MESSAGES_CONV2: Message[] = [
  {
    id: 'msg-2',
    conversationId: 'conv-2',
    senderName: 'Bob Martinez',
    senderId: 8,
    body: 'Vendor list updated.',
    sentAt: '2026-05-03T16:45:00Z',
    updatedAt: '2026-05-03T16:45:00Z',
    isOwn: false,
  },
];

function renderInbox() {
  return render(<MessagesInbox />);
}

describe('MessagesInbox', () => {
  beforeEach(() => {
    mockedListConversations.mockReset();
    mockedGetMessages.mockReset();
    mockedSendMessage.mockReset();
    mockedEditMessage.mockReset();
    mockedDeleteMessage.mockReset();
  });

  it('renders the inbox heading', async () => {
    mockedListConversations.mockResolvedValue(MOCK_CONVERSATIONS);
    mockedGetMessages.mockResolvedValue(MOCK_MESSAGES_CONV1);
    renderInbox();
    await waitFor(() => expect(screen.getByText('Messages')).toBeInTheDocument());
  });

  it('renders conversation list with names', async () => {
    mockedListConversations.mockResolvedValue(MOCK_CONVERSATIONS);
    mockedGetMessages.mockResolvedValue(MOCK_MESSAGES_CONV1);
    renderInbox();
    await waitFor(() => expect(screen.getAllByText('Alice Johnson').length).toBeGreaterThan(0));
    expect(screen.getAllByText('Bob Martinez').length).toBeGreaterThan(0);
  });

  it('renders empty inbox state when no conversations', async () => {
    mockedListConversations.mockResolvedValue([]);
    renderInbox();
    await waitFor(() => expect(screen.getByText('No messages yet')).toBeInTheDocument());
    expect(screen.getByRole('status', { name: 'Empty inbox' })).toBeInTheDocument();
  });

  it('selects a conversation and shows thread', async () => {
    mockedListConversations.mockResolvedValue(MOCK_CONVERSATIONS);
    mockedGetMessages.mockResolvedValue(MOCK_MESSAGES_CONV1);
    renderInbox();
    await waitFor(() => screen.getAllByText('Alice Johnson')[0]);

    await waitFor(() => expect(mockedGetMessages).toHaveBeenCalledWith('conv-1', CURRENT_USER_ID));
    await waitFor(() => expect(screen.getByText('Hi, can you confirm stage times?')).toBeInTheDocument());
  });

  it('switches to another conversation on click', async () => {
    mockedListConversations.mockResolvedValue(MOCK_CONVERSATIONS);
    mockedGetMessages
      .mockResolvedValueOnce(MOCK_MESSAGES_CONV1)
      .mockResolvedValueOnce(MOCK_MESSAGES_CONV2);

    renderInbox();
    await waitFor(() => screen.getAllByText('Bob Martinez')[0]);

    fireEvent.click(screen.getAllByText('Bob Martinez')[0]);

    await waitFor(() => expect(mockedGetMessages).toHaveBeenCalledWith('conv-2', CURRENT_USER_ID));
  });

  it('sends a message via send button', async () => {
    mockedListConversations.mockResolvedValue(MOCK_CONVERSATIONS);
    mockedGetMessages.mockResolvedValue(MOCK_MESSAGES_CONV1);
    const newMessage: Message = {
      id: 'msg-new',
      conversationId: 'conv-1',
      senderName: 'You',
      senderId: CURRENT_USER_ID,
      body: 'Hello there!',
      sentAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      isOwn: true,
    };
    mockedSendMessage.mockResolvedValue(newMessage);

    renderInbox();
    await waitFor(() => screen.getByLabelText('Message input'));

    fireEvent.change(screen.getByLabelText('Message input'), { target: { value: 'Hello there!' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send message' }));

    await waitFor(() =>
      expect(mockedSendMessage).toHaveBeenCalledWith('conv-1', 'Hello there!', CURRENT_USER_ID),
    );
    await waitFor(() => expect(screen.getAllByText('Hello there!').length).toBeGreaterThan(0));
  });

  it('sends a message via Enter key', async () => {
    mockedListConversations.mockResolvedValue(MOCK_CONVERSATIONS);
    mockedGetMessages.mockResolvedValue(MOCK_MESSAGES_CONV1);
    const newMessage: Message = {
      id: 'msg-enter',
      conversationId: 'conv-1',
      senderName: 'You',
      senderId: CURRENT_USER_ID,
      body: 'Sent by Enter',
      sentAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      isOwn: true,
    };
    mockedSendMessage.mockResolvedValue(newMessage);

    renderInbox();
    await waitFor(() => screen.getByLabelText('Message input'));

    const input = screen.getByLabelText('Message input');
    fireEvent.change(input, { target: { value: 'Sent by Enter' } });
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter', charCode: 13 });

    await waitFor(() =>
      expect(mockedSendMessage).toHaveBeenCalledWith('conv-1', 'Sent by Enter', CURRENT_USER_ID),
    );
  });

  it('conversation list has role="list"', async () => {
    mockedListConversations.mockResolvedValue(MOCK_CONVERSATIONS);
    mockedGetMessages.mockResolvedValue(MOCK_MESSAGES_CONV1);
    renderInbox();
    await waitFor(() => screen.getByRole('list', { name: 'Conversations' }));
  });

  it('keyboard navigation with ArrowDown selects next conversation', async () => {
    mockedListConversations.mockResolvedValue(MOCK_CONVERSATIONS);
    mockedGetMessages
      .mockResolvedValueOnce(MOCK_MESSAGES_CONV1)
      .mockResolvedValueOnce(MOCK_MESSAGES_CONV2);

    renderInbox();
    await waitFor(() => screen.getAllByText('Alice Johnson')[0]);

    // Use the list item button (sidebar) for keyboard navigation
    const firstItem = screen.getAllByRole('button', { name: /Alice Johnson/i })[0];
    firstItem.focus();
    fireEvent.keyDown(firstItem, { key: 'ArrowDown', code: 'ArrowDown' });

    await waitFor(() => expect(mockedGetMessages).toHaveBeenCalledWith('conv-2', CURRENT_USER_ID));
  });

  it('shows edit and delete affordances only on own messages', async () => {
    mockedListConversations.mockResolvedValue(MOCK_CONVERSATIONS);
    mockedGetMessages.mockResolvedValue(MOCK_MESSAGES_CONV1);
    renderInbox();
    await waitFor(() => screen.getAllByText('Yes — 7pm and 9pm.'));

    // Own message — edit + delete buttons are present
    expect(screen.getByRole('button', { name: 'Edit message msg-own' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete message msg-own' })).toBeInTheDocument();

    // Other person's message — no edit/delete buttons
    expect(screen.queryByRole('button', { name: 'Edit message msg-1' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Delete message msg-1' })).toBeNull();
  });

  it('edits an own message via the inline editor', async () => {
    mockedListConversations.mockResolvedValue(MOCK_CONVERSATIONS);
    mockedGetMessages.mockResolvedValue(MOCK_MESSAGES_CONV1);
    const updated: Message = {
      ...MOCK_MESSAGES_CONV1[1],
      body: 'Updated body.',
      updatedAt: '2026-05-04T10:00:00Z',
    };
    mockedEditMessage.mockResolvedValue(updated);

    renderInbox();
    await waitFor(() => screen.getAllByText('Yes — 7pm and 9pm.'));

    fireEvent.click(screen.getByRole('button', { name: 'Edit message msg-own' }));
    const editor = screen.getByLabelText('Edit message input');
    fireEvent.change(editor, { target: { value: 'Updated body.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(mockedEditMessage).toHaveBeenCalledWith(
        'conv-1',
        'msg-own',
        'Updated body.',
        CURRENT_USER_ID,
      ),
    );
    await waitFor(() => expect(screen.getAllByText('Updated body.').length).toBeGreaterThan(0));
  });

  it('deletes an own message after confirming the dialog', async () => {
    mockedListConversations.mockResolvedValue(MOCK_CONVERSATIONS);
    mockedGetMessages.mockResolvedValue(MOCK_MESSAGES_CONV1);
    mockedDeleteMessage.mockResolvedValue();

    renderInbox();
    await waitFor(() => screen.getAllByText('Yes — 7pm and 9pm.'));

    fireEvent.click(screen.getByRole('button', { name: 'Delete message msg-own' }));
    const dialog = await screen.findByRole('dialog', { name: /delete this message/i });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));

    await waitFor(() =>
      expect(mockedDeleteMessage).toHaveBeenCalledWith('conv-1', 'msg-own'),
    );
    await waitFor(() => expect(screen.queryByText('Yes — 7pm and 9pm.')).toBeNull());
  });

  it('shows a friendly error when conversations fail to load with 403', async () => {
    const { ApiError } = await import('../src/lib/api-client');
    mockedListConversations.mockRejectedValue(new ApiError('Forbidden', 403));
    renderInbox();
    await waitFor(() =>
      expect(screen.getByText("You don't have access to this conversation.")).toBeInTheDocument(),
    );
  });
});
