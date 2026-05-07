import { useEffect, useState } from 'react';
import { Alert, Box, CircularProgress, Paper, Typography } from '@mui/material';
import { MailRounded } from '@mui/icons-material';
import { ConversationList } from './conversation-list';
import { ThreadView } from './thread-view';
import {
  deleteMessage,
  editMessage,
  getMessages,
  listConversations,
  sendMessage,
} from '../../services/messages-service';
import type { Conversation, Message } from '../../types/message';
import { useAuth } from '../../contexts/auth-context';
import { ApiError } from '../../lib/api-client';

/** Convert any thrown value into a UI-friendly error message. */
function describeError(err: unknown, fallback: string): string {
  if (err instanceof ApiError) {
    if (err.status === 401) return 'Your session has expired. Please sign in again.';
    if (err.status === 403) return "You don't have access to this conversation.";
    if (err.status === 404) return 'This conversation is no longer available.';
    return err.message || fallback;
  }
  if (err instanceof Error) return err.message;
  return fallback;
}

export function MessagesInbox(): JSX.Element {
  const { user } = useAuth();
  // Guard: component should not be reachable when unauthenticated, but be explicit
  const currentUserId = user?.id ?? null;

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loadingConversations, setLoadingConversations] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoadingConversations(true);
    listConversations()
      .then((data) => {
        setConversations(data);
        if (data.length > 0) setSelectedId(data[0].id);
      })
      .catch((err: unknown) => setError(describeError(err, 'Failed to load conversations')))
      .finally(() => setLoadingConversations(false));
  }, []);

  useEffect(() => {
    if (!selectedId || currentUserId === null) {
      setMessages([]);
      return;
    }
    // Clear previous thread's messages immediately so there is no flash of
    // stale content while the new thread loads.
    setMessages([]);
    let cancelled = false;
    setLoadingMessages(true);
    getMessages(selectedId, currentUserId)
      .then((data) => {
        if (cancelled) return;
        setMessages(data);
        // Sync the conversation row so the sidebar reflects the most recent
        // message body/timestamp once we have real data for the thread.
        const last = data[data.length - 1];
        if (last) {
          setConversations((prev) =>
            prev.map((conv) =>
              conv.id === selectedId
                ? { ...conv, lastMessage: last.body, lastMessageAt: last.sentAt, isRead: true }
                : conv,
            ),
          );
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(describeError(err, 'Failed to load messages'));
      })
      .finally(() => {
        if (!cancelled) setLoadingMessages(false);
      });
    // Cleanup: discard the in-flight result if selectedId changes before it resolves
    return () => {
      cancelled = true;
    };
  }, [selectedId, currentUserId]);

  async function handleSend(body: string): Promise<void> {
    if (!selectedId || currentUserId === null) return;
    try {
      const newMessage = await sendMessage(selectedId, body, currentUserId);
      setMessages((prev) => [...prev, newMessage]);
      setConversations((prev) =>
        prev.map((conv) =>
          conv.id === selectedId
            ? {
                ...conv,
                lastMessage: newMessage.body,
                lastMessageAt: newMessage.sentAt,
                isRead: true,
              }
            : conv,
        ),
      );
    } catch (err: unknown) {
      setError(describeError(err, 'Failed to send message'));
    }
  }

  async function handleEdit(messageId: string, body: string): Promise<void> {
    if (!selectedId || currentUserId === null) return;
    try {
      const updated = await editMessage(selectedId, messageId, body, currentUserId);
      setMessages((prev) => prev.map((m) => (m.id === messageId ? updated : m)));
      // If the edited message was the latest, update the sidebar preview too.
      setConversations((prev) =>
        prev.map((conv) => {
          if (conv.id !== selectedId) return conv;
          const isLatest = messages.length > 0 && messages[messages.length - 1].id === messageId;
          return isLatest ? { ...conv, lastMessage: updated.body } : conv;
        }),
      );
    } catch (err: unknown) {
      setError(describeError(err, 'Failed to edit message'));
    }
  }

  async function handleDelete(messageId: string): Promise<void> {
    if (!selectedId || currentUserId === null) return;
    try {
      await deleteMessage(selectedId, messageId);
      setMessages((prev) => {
        const next = prev.filter((m) => m.id !== messageId);
        // If we just deleted the latest message, refresh the sidebar preview
        // to show the new tail (or clear it if the thread is now empty).
        const newLast = next[next.length - 1];
        setConversations((convs) =>
          convs.map((conv) =>
            conv.id === selectedId
              ? {
                  ...conv,
                  lastMessage: newLast?.body ?? '',
                  lastMessageAt: newLast?.sentAt ?? conv.lastMessageAt,
                }
              : conv,
          ),
        );
        return next;
      });
    } catch (err: unknown) {
      setError(describeError(err, 'Failed to delete message'));
    }
  }

  const selectedConversation = conversations.find((c) => c.id === selectedId);

  if (loadingConversations) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '60vh' }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box sx={{ p: 3, height: 'calc(100vh - 64px)', display: 'flex', flexDirection: 'column' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
        <MailRounded color="primary" />
        <Typography variant="h5" fontWeight={700}>
          Messages
        </Typography>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {conversations.length === 0 ? (
        <Box
          sx={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            flex: 1,
            gap: 2,
            color: 'text.secondary',
          }}
          role="status"
          aria-label="Empty inbox"
        >
          <MailRounded sx={{ fontSize: 56, opacity: 0.3 }} />
          <Typography variant="h6">No messages yet</Typography>
          <Typography variant="body2">Messages from other organisers will appear here.</Typography>
        </Box>
      ) : (
        <Paper
          variant="outlined"
          sx={{
            flex: 1,
            display: 'flex',
            overflow: 'hidden',
            borderRadius: 2,
          }}
        >
          {/* Left panel — conversation list */}
          <Box
            sx={{
              width: 300,
              flexShrink: 0,
              borderRight: '1px solid',
              borderColor: 'divider',
              overflowY: 'auto',
            }}
          >
            <ConversationList
              conversations={conversations}
              selectedId={selectedId}
              onSelect={setSelectedId}
            />
          </Box>

          {/* Right panel — thread view */}
          <Box sx={{ flex: 1, overflow: 'hidden' }}>
            {selectedConversation ? (
              <ThreadView
                conversationId={selectedConversation.id}
                threadName={selectedConversation.participantName}
                messages={messages}
                loading={loadingMessages}
                onSend={handleSend}
                onEdit={handleEdit}
                onDelete={handleDelete}
              />
            ) : (
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  height: '100%',
                  color: 'text.secondary',
                }}
              >
                <Typography variant="body2">Select a conversation to read messages</Typography>
              </Box>
            )}
          </Box>
        </Paper>
      )}
    </Box>
  );
}
