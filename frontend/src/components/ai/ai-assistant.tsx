import { ChangeEvent, KeyboardEvent, useState } from 'react';
import {
  Box,
  CircularProgress,
  Fab,
  IconButton,
  MenuItem,
  Paper,
  Select,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import { AutoAwesomeRounded, CloseRounded, SendRounded } from '@mui/icons-material';
import { api, ApiError } from '../../lib/api-client';

type Context = 'general' | 'event' | 'task' | 'rsvp';

interface Message {
  role: 'user' | 'assistant';
  text: string;
}

const CONTEXT_LABELS: Record<Context, string> = {
  general: 'General planning',
  event: 'Event ideas',
  task: 'Task planning',
  rsvp: 'RSVP management',
};

export function AiAssistant(): JSX.Element {
  const [open, setOpen] = useState(false);
  const [context, setContext] = useState<Context>('general');
  const [prompt, setPrompt] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);

  async function sendMessage(): Promise<void> {
    const text = prompt.trim();
    if (!text || loading) return;

    setMessages((prev) => [...prev, { role: 'user', text }]);
    setPrompt('');
    setLoading(true);

    try {
      const data = await api.post<{ suggestion: string }>('/api/ai/suggest', { context, prompt: text });
      setMessages((prev) => [...prev, { role: 'assistant', text: data.suggestion }]);
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'AI request failed.';
      setMessages((prev) => [...prev, { role: 'assistant', text: `⚠️ ${message}` }]);
    } finally {
      setLoading(false);
    }
  }

  function handleKeyDown(e: KeyboardEvent<HTMLDivElement>): void {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void sendMessage();
    }
  }

  return (
    <>
      {/* Floating button */}
      <Tooltip title="AI Planning Assistant" placement="left">
        <Fab
          color="primary"
          aria-label="AI assistant"
          onClick={() => setOpen((v) => !v)}
          sx={{ position: 'fixed', bottom: 32, right: 32, zIndex: 1300 }}
        >
          {open ? <CloseRounded /> : <AutoAwesomeRounded />}
        </Fab>
      </Tooltip>

      {/* Chat panel */}
      {open && (
        <Paper
          elevation={8}
          sx={{
            position: 'fixed',
            bottom: 96,
            right: 32,
            width: 360,
            maxHeight: 520,
            display: 'flex',
            flexDirection: 'column',
            zIndex: 1299,
            borderRadius: 3,
            overflow: 'hidden',
          }}
        >
          {/* Header */}
          <Box sx={{ p: 2, bgcolor: 'primary.main', color: 'primary.contrastText', display: 'flex', alignItems: 'center', gap: 1 }}>
            <AutoAwesomeRounded fontSize="small" />
            <Typography variant="subtitle1" fontWeight={700} flexGrow={1}>
              AI Planning Assistant
            </Typography>
            <IconButton size="small" sx={{ color: 'inherit' }} onClick={() => setOpen(false)}>
              <CloseRounded fontSize="small" />
            </IconButton>
          </Box>

          {/* Context selector */}
          <Box sx={{ px: 2, py: 1, borderBottom: 1, borderColor: 'divider' }}>
            <Select
              size="small"
              value={context}
              onChange={(e) => setContext(e.target.value as Context)}
              fullWidth
            >
              {(Object.keys(CONTEXT_LABELS) as Context[]).map((k) => (
                <MenuItem key={k} value={k}>{CONTEXT_LABELS[k]}</MenuItem>
              ))}
            </Select>
          </Box>

          {/* Messages */}
          <Box
            sx={{
              flexGrow: 1,
              overflowY: 'auto',
              p: 2,
              display: 'flex',
              flexDirection: 'column',
              gap: 1.5,
            }}
          >
            {messages.length === 0 && (
              <Typography variant="body2" color="text.secondary" textAlign="center" sx={{ mt: 2 }}>
                Ask me anything about festival planning — event ideas, task tips, RSVP strategies, and more.
              </Typography>
            )}
            {messages.map((msg, i) => (
              <Box
                key={i}
                sx={{
                  alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
                  maxWidth: '85%',
                  bgcolor: msg.role === 'user' ? 'primary.main' : 'grey.100',
                  color: msg.role === 'user' ? 'primary.contrastText' : 'text.primary',
                  px: 1.5,
                  py: 1,
                  borderRadius: 2,
                }}
              >
                <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>{msg.text}</Typography>
              </Box>
            ))}
            {loading && (
              <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                <CircularProgress size={16} />
                <Typography variant="caption" color="text.secondary">Thinking…</Typography>
              </Box>
            )}
          </Box>

          {/* Input */}
          <Box sx={{ p: 1.5, borderTop: 1, borderColor: 'divider' }}>
            <Stack direction="row" spacing={1} alignItems="flex-end">
              <TextField
                size="small"
                multiline
                maxRows={3}
                placeholder="Ask a question… (Enter to send)"
                value={prompt}
                onChange={(e: ChangeEvent<HTMLInputElement>) => setPrompt(e.target.value)}
                onKeyDown={handleKeyDown}
                fullWidth
                disabled={loading}
              />
              <IconButton
                color="primary"
                onClick={sendMessage}
                disabled={loading || !prompt.trim()}
                aria-label="Send"
              >
                {loading ? <CircularProgress size={20} /> : <SendRounded />}
              </IconButton>
            </Stack>
          </Box>
        </Paper>
      )}
    </>
  );
}
