/**
 * Event Chat Panel — #628 / #808.
 *
 * Renders the per-event team chat with a `role="log"` live region,
 * basic markdown (bold/italic/code), auto-link detection, emoji input
 * via the OS shortcut, and a SSE-backed realtime stream so new
 * messages arrive without a page reload. Unread count is surfaced via
 * the `onUnreadChange` callback so the parent tab strip can render a
 * badge.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  IconButton,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import DeleteRounded from '@mui/icons-material/DeleteRounded';
import EditRounded from '@mui/icons-material/EditRounded';
import ReplyRounded from '@mui/icons-material/ReplyRounded';
import SendRounded from '@mui/icons-material/SendRounded';
import {
  type ChatMessage,
  deleteChatMessage,
  editChatMessage,
  listChatMessages,
  postChatMessage,
} from '../../services/event-chat-service';

interface EventChatPanelProps {
  eventId: number;
  currentUserId: number;
  /** When false, suppresses unread counting (e.g., when the tab is active). */
  hidden?: boolean;
  /** Called with the unread count so the parent can render a badge. */
  onUnreadChange?: (count: number) => void;
}

/**
 * Escape HTML then apply a small set of safe inline markdown patterns:
 *   **bold**, *italic*, `code`, plus naked URL → anchor.
 * Returned `__html` is suitable for `dangerouslySetInnerHTML` because the
 * source string has already been escaped before any markup is added.
 */
function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderMarkdown(input: string): string {
  let out = escapeHtml(input);
  // Inline code first so it doesn't gobble up bold/italic markers.
  out = out.replace(/`([^`]+)`/g, '<code>$1</code>');
  out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  out = out.replace(/(^|\s)\*([^*\s][^*]*[^*\s]|[^*\s])\*(?=\s|$)/g, '$1<em>$2</em>');
  out = out.replace(
    /\b(https?:\/\/[^\s<]+)/g,
    '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>',
  );
  // Preserve newlines.
  out = out.replace(/\n/g, '<br />');
  return out;
}

const STORAGE_KEY = (eventId: number, userId: number): string =>
  `event-chat-last-read:${eventId}:${userId}`;

function loadLastReadId(eventId: number, userId: number): number {
  if (typeof window === 'undefined' || !window.localStorage) return 0;
  const raw = window.localStorage.getItem(STORAGE_KEY(eventId, userId));
  return raw ? Number(raw) || 0 : 0;
}

function saveLastReadId(eventId: number, userId: number, id: number): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    window.localStorage.setItem(STORAGE_KEY(eventId, userId), String(id));
  } catch {
    // Ignore quota errors; unread count will simply reset on next reload.
  }
}

export function EventChatPanel({
  eventId,
  currentUserId,
  hidden = false,
  onUnreadChange,
}: EventChatPanelProps): JSX.Element {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [body, setBody] = useState('');
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editBody, setEditBody] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const [lastReadId, setLastReadId] = useState<number>(() =>
    loadLastReadId(eventId, currentUserId),
  );
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    listChatMessages(eventId)
      .then((msgs) => {
        if (cancelled) return;
        setMessages(msgs);
        setLoading(false);
      })
      .catch((err: Error) => {
        if (cancelled) return;
        setError(err.message);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [eventId]);

  // SSE subscription — incoming `chat.message` envelopes append to the list
  // when they aren't already present (POST returns the same row).
  useEffect(() => {
    if (typeof window === 'undefined' || typeof EventSource === 'undefined') return;
    const source = new EventSource(`/api/events/${eventId}/realtime/stream`, {
      withCredentials: true,
    });
    const handler = (evt: MessageEvent): void => {
      try {
        const envelope = JSON.parse(evt.data) as { payload?: { message?: ChatMessage } };
        const incoming = envelope?.payload?.message;
        if (!incoming) return;
        setMessages((prev) =>
          prev.some((m) => m.id === incoming.id) ? prev : [...prev, incoming],
        );
      } catch {
        // ignore malformed events
      }
    };
    source.addEventListener('chat.message', handler as EventListener);
    return () => {
      source.removeEventListener('chat.message', handler as EventListener);
      source.close();
    };
  }, [eventId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const unreadCount = useMemo(() => {
    if (hidden === false) return 0;
    return messages.filter((m) => m.id > lastReadId && m.user_id !== currentUserId).length;
  }, [messages, lastReadId, currentUserId, hidden]);

  useEffect(() => {
    onUnreadChange?.(unreadCount);
  }, [unreadCount, onUnreadChange]);

  // When the panel becomes visible, mark everything seen.
  useEffect(() => {
    if (hidden) return;
    if (messages.length === 0) return;
    const latest = messages[messages.length - 1].id;
    if (latest > lastReadId) {
      setLastReadId(latest);
      saveLastReadId(eventId, currentUserId, latest);
      onUnreadChange?.(0);
    }
  }, [hidden, messages, lastReadId, eventId, currentUserId, onUnreadChange]);

  const handleSend = useCallback(async (): Promise<void> => {
    const trimmed = body.trim();
    if (!trimmed || sending) return;
    setSending(true);
    setError(null);
    try {
      const msg = await postChatMessage(eventId, trimmed, replyTo?.id);
      setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]));
      setBody('');
      setReplyTo(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send message');
    } finally {
      setSending(false);
    }
  }, [body, sending, eventId, replyTo]);

  const handleEdit = async (id: number): Promise<void> => {
    const trimmed = editBody.trim();
    if (!trimmed) return;
    try {
      const updated = await editChatMessage(eventId, id, trimmed);
      setMessages((prev) => prev.map((m) => (m.id === id ? updated : m)));
      setEditingId(null);
      setEditBody('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to edit message');
    }
  };

  const handleDelete = async (id: number): Promise<void> => {
    if (!window.confirm('Delete this message?')) return;
    try {
      await deleteChatMessage(eventId, id);
      setMessages((prev) => prev.filter((m) => m.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete message');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>): void => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
        <CircularProgress size={20} />
      </Box>
    );
  }

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        border: '1px solid',
        borderColor: 'divider',
        borderRadius: 1,
        overflow: 'hidden',
      }}
      aria-label="Event team chat"
      data-testid="event-chat-panel"
    >
      <Stack
        direction="row"
        sx={{
          px: 2,
          py: 1,
          bgcolor: 'background.default',
          borderBottom: '1px solid',
          borderColor: 'divider',
        }}
        spacing={1}
        alignItems="center"
      >
        <Typography variant="subtitle2" fontWeight={700}>
          Team Chat
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {messages.length} message{messages.length === 1 ? '' : 's'}
        </Typography>
      </Stack>

      <Box
        sx={{
          flex: 1,
          minHeight: 360,
          overflowY: 'auto',
          px: 2,
          py: 2,
          bgcolor: 'background.paper',
        }}
        role="log"
        aria-live="polite"
        aria-relevant="additions text"
      >
        {error && (
          <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
            {error}
          </Alert>
        )}

        {messages.length === 0 ? (
          <Typography variant="body2" color="text.secondary" align="center" sx={{ py: 4 }}>
            No messages yet. Start the conversation!
          </Typography>
        ) : (
          <Stack spacing={1.5}>
            {messages.map((msg) => {
              const isOwn = msg.user_id === currentUserId;
              return (
                <Box
                  key={msg.id}
                  data-testid={`chat-message-${msg.id}`}
                  sx={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: isOwn ? 'flex-end' : 'flex-start',
                  }}
                >
                  <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.25 }}>
                    <Typography variant="caption" fontWeight={600} color="text.secondary">
                      {msg.author_name}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {new Date(msg.created_at).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </Typography>
                    {msg.edited_at && (
                      <Typography
                        variant="caption"
                        color="text.secondary"
                        sx={{ fontStyle: 'italic' }}
                      >
                        (edited)
                      </Typography>
                    )}
                  </Stack>
                  {msg.reply_to_id && msg.reply_to_body && (
                    <Box
                      sx={{
                        fontSize: '0.75rem',
                        color: 'text.secondary',
                        bgcolor: 'action.hover',
                        px: 1,
                        py: 0.5,
                        borderRadius: 0.5,
                        mb: 0.5,
                        borderLeft: '2px solid',
                        borderLeftColor: 'primary.light',
                      }}
                    >
                      <strong>{msg.reply_to_author}:</strong> {msg.reply_to_body.slice(0, 80)}
                    </Box>
                  )}
                  {editingId === msg.id ? (
                    <Stack direction="row" spacing={1} sx={{ maxWidth: 360, width: '100%' }}>
                      <TextField
                        size="small"
                        fullWidth
                        value={editBody}
                        onChange={(e) => setEditBody(e.target.value)}
                        inputProps={{ 'aria-label': 'Edit message' }}
                      />
                      <Button
                        size="small"
                        variant="contained"
                        onClick={() => void handleEdit(msg.id)}
                      >
                        Save
                      </Button>
                      <Button size="small" onClick={() => setEditingId(null)}>
                        Cancel
                      </Button>
                    </Stack>
                  ) : (
                    <Box
                      sx={{
                        px: 1.5,
                        py: 1,
                        borderRadius: 1,
                        maxWidth: 480,
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-word',
                        bgcolor: isOwn ? 'primary.main' : 'grey.100',
                        color: isOwn ? 'primary.contrastText' : 'text.primary',
                        '& a': {
                          color: isOwn ? 'primary.contrastText' : 'primary.main',
                          textDecoration: 'underline',
                        },
                        '& code': {
                          fontFamily: 'monospace',
                          backgroundColor: 'rgba(0,0,0,0.15)',
                          padding: '0 4px',
                          borderRadius: 0.5,
                        },
                      }}
                      dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.body) }}
                    />
                  )}
                  <Stack direction="row" spacing={0.5} sx={{ mt: 0.25 }}>
                    <Tooltip title="Reply">
                      <IconButton
                        size="small"
                        onClick={() => setReplyTo(msg)}
                        aria-label={`Reply to ${msg.author_name}`}
                      >
                        <ReplyRounded fontSize="inherit" />
                      </IconButton>
                    </Tooltip>
                    {isOwn && editingId !== msg.id && (
                      <>
                        <Tooltip title="Edit">
                          <IconButton
                            size="small"
                            onClick={() => {
                              setEditingId(msg.id);
                              setEditBody(msg.body);
                            }}
                            aria-label="Edit message"
                          >
                            <EditRounded fontSize="inherit" />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Delete">
                          <IconButton
                            size="small"
                            onClick={() => void handleDelete(msg.id)}
                            aria-label="Delete message"
                          >
                            <DeleteRounded fontSize="inherit" />
                          </IconButton>
                        </Tooltip>
                      </>
                    )}
                  </Stack>
                </Box>
              );
            })}
            <div ref={bottomRef} />
          </Stack>
        )}
      </Box>

      {replyTo && (
        <Box
          sx={{
            px: 2,
            py: 0.75,
            bgcolor: 'action.hover',
            borderTop: '1px solid',
            borderColor: 'divider',
            display: 'flex',
            alignItems: 'center',
            gap: 1,
          }}
        >
          <Typography variant="caption" color="text.secondary">
            Replying to <strong>{replyTo.author_name}</strong>: {replyTo.body.slice(0, 60)}…
          </Typography>
          <Button size="small" color="error" onClick={() => setReplyTo(null)}>
            Cancel
          </Button>
        </Box>
      )}

      <Stack
        direction="row"
        spacing={1}
        sx={{ p: 1.5, borderTop: '1px solid', borderColor: 'divider' }}
        alignItems="flex-end"
      >
        <TextField
          fullWidth
          multiline
          maxRows={4}
          placeholder="Type a message… (Enter to send · Shift+Enter for newline · supports **bold**, *italic*, `code`, links)"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={handleKeyDown}
          inputProps={{ 'aria-label': 'Chat message input', maxLength: 4000 }}
          disabled={sending}
          data-testid="event-chat-input"
        />
        <Button
          variant="contained"
          onClick={() => void handleSend()}
          disabled={!body.trim() || sending}
          startIcon={sending ? <CircularProgress size={14} color="inherit" /> : <SendRounded />}
          aria-label="Send message"
          data-testid="event-chat-send"
        >
          Send
        </Button>
      </Stack>
    </Box>
  );
}
