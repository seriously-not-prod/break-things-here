import { KeyboardEvent, useEffect, useRef, useState } from 'react';
import { Avatar, Box, CircularProgress, IconButton, TextField, Typography } from '@mui/material';
import { SendRounded } from '@mui/icons-material';
import type { Message } from '../../types/message';

interface ThreadViewProps {
  conversationId: string;
  /** Display name for the thread — for event-based threads this is the event title. */
  threadName: string;
  messages: Message[];
  loading: boolean;
  onSend: (body: string) => Promise<void>;
}

export function ThreadView({
  conversationId,
  threadName,
  messages,
  loading,
  onSend,
}: ThreadViewProps): JSX.Element {
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (typeof bottomRef.current?.scrollIntoView === 'function') {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  useEffect(() => {
    setDraft('');
  }, [conversationId]);

  async function handleSend(): Promise<void> {
    const trimmed = draft.trim();
    if (!trimmed || sending) return;
    setSending(true);
    try {
      await onSend(trimmed);
      setDraft('');
    } finally {
      setSending(false);
    }
  }

  function handleKeyDown(e: KeyboardEvent<HTMLDivElement>): void {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  }

  function formatTime(isoString: string): string {
    return new Date(isoString).toLocaleTimeString(undefined, {
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Thread header */}
      <Box
        sx={{
          px: 2,
          py: 1.5,
          borderBottom: '1px solid',
          borderColor: 'divider',
          bgcolor: 'background.paper',
        }}
      >
        <Typography variant="subtitle1" fontWeight={600}>
          {threadName}
        </Typography>
      </Box>

      {/* Messages */}
      <Box
        sx={{ flex: 1, overflowY: 'auto', p: 2, display: 'flex', flexDirection: 'column', gap: 1 }}
        aria-label={`Thread: ${threadName}`}
      >
        {loading && (
          <Box sx={{ display: 'flex', justifyContent: 'center', pt: 4 }}>
            <CircularProgress size={28} />
          </Box>
        )}

        {!loading && messages.length === 0 && (
          <Typography
            variant="body2"
            color="text.secondary"
            sx={{ textAlign: 'center', pt: 4 }}
            role="status"
          >
            No messages yet. Say hello!
          </Typography>
        )}

        {messages.map((msg) => (
          <Box
            key={msg.id}
            role="article"
            aria-label={`${msg.senderName} at ${formatTime(msg.sentAt)}: ${msg.body}`}
            sx={{
              display: 'flex',
              flexDirection: msg.isOwn ? 'row-reverse' : 'row',
              alignItems: 'flex-start',
              gap: 1,
            }}
          >
            {!msg.isOwn && (
              <Avatar sx={{ width: 32, height: 32, bgcolor: 'secondary.light', fontSize: 12 }}>
                {msg.senderName.charAt(0)}
              </Avatar>
            )}
            <Box
              sx={{
                maxWidth: '70%',
                bgcolor: msg.isOwn ? 'primary.main' : 'grey.100',
                color: msg.isOwn ? 'primary.contrastText' : 'text.primary',
                borderRadius: 2,
                px: 1.5,
                py: 1,
              }}
            >
              <Typography variant="body2">{msg.body}</Typography>
              <Typography
                variant="caption"
                sx={{ opacity: 0.7, display: 'block', textAlign: msg.isOwn ? 'right' : 'left' }}
              >
                {formatTime(msg.sentAt)}
              </Typography>
            </Box>
          </Box>
        ))}

        <div ref={bottomRef} />
      </Box>

      {/* Input area */}
      <Box
        sx={{
          display: 'flex',
          gap: 1,
          p: 1.5,
          borderTop: '1px solid',
          borderColor: 'divider',
          bgcolor: 'background.paper',
        }}
      >
        <TextField
          fullWidth
          size="small"
          multiline
          maxRows={4}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type a message…"
          inputProps={{ 'aria-label': 'Message input' }}
          disabled={sending}
        />
        <IconButton
          onClick={() => void handleSend()}
          disabled={!draft.trim() || sending}
          aria-label="Send message"
          color="primary"
        >
          <SendRounded />
        </IconButton>
      </Box>
    </Box>
  );
}
