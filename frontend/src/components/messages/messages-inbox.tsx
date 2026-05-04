import { useEffect, useState } from 'react';
import { Alert, Box, CircularProgress, Paper, Typography } from '@mui/material';
import { MailRounded } from '@mui/icons-material';
import { ConversationList } from './conversation-list';
import { ThreadView } from './thread-view';
import {
  getMessages,
  listConversations,
  sendMessage,
} from '../../services/messages-service';
import type { Conversation, Message } from '../../types/message';

export function MessagesInbox(): JSX.Element {
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
      .catch((err: unknown) =>
        setError(err instanceof Error ? err.message : 'Failed to load conversations'),
      )
      .finally(() => setLoadingConversations(false));
  }, []);

  useEffect(() => {
    if (!selectedId) {
      setMessages([]);
      return;
    }
    setLoadingMessages(true);
    getMessages(selectedId)
      .then(setMessages)
      .catch((err: unknown) =>
        setError(err instanceof Error ? err.message : 'Failed to load messages'),
      )
      .finally(() => setLoadingMessages(false));
  }, [selectedId]);

  async function handleSend(body: string): Promise<void> {
    if (!selectedId) return;
    const newMessage = await sendMessage(selectedId, body);
    setMessages((prev) => [...prev, newMessage]);
    setConversations((prev) =>
      prev.map((conv) =>
        conv.id === selectedId
          ? {
              ...conv,
              lastMessage: `You: ${body}`,
              lastMessageAt: newMessage.sentAt,
              isRead: true,
            }
          : conv,
      ),
    );
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
        <Alert severity="error" sx={{ mb: 2 }}>
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
                participantName={selectedConversation.participantName}
                messages={messages}
                loading={loadingMessages}
                onSend={handleSend}
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
