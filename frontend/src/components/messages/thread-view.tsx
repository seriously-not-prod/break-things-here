import { KeyboardEvent, useEffect, useRef, useState } from 'react';
import {
  Avatar,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  IconButton,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import { DeleteOutline, EditOutlined, SendRounded } from '@mui/icons-material';
import type { Message } from '../../types/message';

interface ThreadViewProps {
  conversationId: string;
  /** Display name for the thread — for event-based threads this is the event title. */
  threadName: string;
  messages: Message[];
  loading: boolean;
  onSend: (_body: string) => Promise<void>;
  /** Optional — when omitted, edit affordance is hidden. */
  onEdit?: (_messageId: string, _body: string) => Promise<void>;
  /** Optional — when omitted, delete affordance is hidden. */
  onDelete?: (_messageId: string) => Promise<void>;
}

export function ThreadView({
  conversationId,
  threadName,
  messages,
  loading,
  onSend,
  onEdit,
  onDelete,
}: ThreadViewProps): JSX.Element {
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (typeof bottomRef.current?.scrollIntoView === 'function') {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  useEffect(() => {
    setDraft('');
    setEditingId(null);
    setConfirmDeleteId(null);
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

  function startEdit(msg: Message): void {
    setEditingId(msg.id);
    setEditDraft(msg.body);
  }

  function cancelEdit(): void {
    setEditingId(null);
    setEditDraft('');
  }

  async function commitEdit(messageId: string): Promise<void> {
    const trimmed = editDraft.trim();
    if (!trimmed || !onEdit) {
      cancelEdit();
      return;
    }
    setSavingEdit(true);
    try {
      await onEdit(messageId, trimmed);
      cancelEdit();
    } finally {
      setSavingEdit(false);
    }
  }

  async function commitDelete(): Promise<void> {
    if (!confirmDeleteId || !onDelete) return;
    setDeleting(true);
    try {
      await onDelete(confirmDeleteId);
      setConfirmDeleteId(null);
    } finally {
      setDeleting(false);
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

        {messages.map((msg) => {
          const isEditing = editingId === msg.id;
          const wasEdited = msg.updatedAt && msg.updatedAt !== msg.sentAt;
          const canEdit = msg.isOwn && Boolean(onEdit);
          const canDelete = msg.isOwn && Boolean(onDelete);

          return (
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
                {isEditing ? (
                  <Stack spacing={1}>
                    <TextField
                      size="small"
                      fullWidth
                      multiline
                      maxRows={4}
                      value={editDraft}
                      onChange={(e) => setEditDraft(e.target.value)}
                      inputProps={{ 'aria-label': 'Edit message input' }}
                      disabled={savingEdit}
                      sx={{
                        bgcolor: 'background.paper',
                        borderRadius: 1,
                        '& .MuiInputBase-input': { color: 'text.primary' },
                      }}
                    />
                    <Stack direction="row" spacing={1} justifyContent="flex-end">
                      <Button
                        size="small"
                        onClick={cancelEdit}
                        disabled={savingEdit}
                        sx={{ color: msg.isOwn ? 'primary.contrastText' : undefined }}
                      >
                        Cancel
                      </Button>
                      <Button
                        size="small"
                        variant="contained"
                        color="secondary"
                        onClick={() => void commitEdit(msg.id)}
                        disabled={!editDraft.trim() || savingEdit}
                      >
                        Save
                      </Button>
                    </Stack>
                  </Stack>
                ) : (
                  <>
                    <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
                      {msg.body}
                    </Typography>
                    <Box
                      sx={{
                        display: 'flex',
                        gap: 0.5,
                        alignItems: 'center',
                        justifyContent: msg.isOwn ? 'flex-end' : 'flex-start',
                        mt: 0.25,
                      }}
                    >
                      <Typography variant="caption" sx={{ opacity: 0.7 }}>
                        {formatTime(msg.sentAt)}
                        {wasEdited ? ' · edited' : ''}
                      </Typography>
                      {canEdit && (
                        <Tooltip title="Edit">
                          <IconButton
                            size="small"
                            onClick={() => startEdit(msg)}
                            aria-label={`Edit message ${msg.id}`}
                            sx={{ color: 'inherit', opacity: 0.7, p: 0.25 }}
                          >
                            <EditOutlined fontSize="inherit" />
                          </IconButton>
                        </Tooltip>
                      )}
                      {canDelete && (
                        <Tooltip title="Delete">
                          <IconButton
                            size="small"
                            onClick={() => setConfirmDeleteId(msg.id)}
                            aria-label={`Delete message ${msg.id}`}
                            sx={{ color: 'inherit', opacity: 0.7, p: 0.25 }}
                          >
                            <DeleteOutline fontSize="inherit" />
                          </IconButton>
                        </Tooltip>
                      )}
                    </Box>
                  </>
                )}
              </Box>
            </Box>
          );
        })}

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

      {/* Delete confirmation */}
      <Dialog
        open={confirmDeleteId !== null}
        onClose={() => (deleting ? null : setConfirmDeleteId(null))}
        aria-labelledby="delete-message-title"
      >
        <DialogTitle id="delete-message-title">Delete this message?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            This message will be removed from the thread for everyone. This cannot be undone.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmDeleteId(null)} disabled={deleting}>
            Cancel
          </Button>
          <Button
            color="error"
            variant="contained"
            onClick={() => void commitDelete()}
            disabled={deleting}
          >
            Delete
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
