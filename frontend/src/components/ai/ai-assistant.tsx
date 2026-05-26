import { ChangeEvent, KeyboardEvent, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Divider,
  Fab,
  IconButton,
  MenuItem,
  Paper,
  Select,
  Stack,
  Tab,
  Tabs,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import { AutoAwesomeRounded, CloseRounded, HubRounded, SendRounded } from '@mui/icons-material';
import { api, ApiError } from '../../lib/api-client';

type Context = 'general' | 'event' | 'task' | 'rsvp';
type WorkflowType = 'event' | 'task' | 'rsvp';

interface Message {
  role: 'user' | 'assistant';
  text: string;
}

interface EventSuggestion {
  title: string;
  description: string;
  venueType: string;
  promotionalTips: string[];
}

interface TaskSuggestion {
  actionTitle: string;
  dueDateRange: string;
  owner: string;
  dependencies: string[];
}

interface RsvpSuggestion {
  confirmationMessage: string;
  reminderMessage: string;
  capacityTip: string;
}

type GroundedSuggestion = EventSuggestion | TaskSuggestion | RsvpSuggestion;

interface GroundedResponse {
  workflowType: WorkflowType;
  entityId: number;
  structured: GroundedSuggestion;
  raw: string;
  /** #949: Traceability — event context fields included in the grounded prompt. */
  contextSummary?: { groundedFields: string[] };
}

const CONTEXT_LABELS: Record<Context, string> = {
  general: 'General planning',
  event: 'Event ideas',
  task: 'Task planning',
  rsvp: 'RSVP management',
};

const WORKFLOW_LABELS: Record<WorkflowType, string> = {
  event: 'Event suggestions',
  task: 'Task suggestions',
  rsvp: 'RSVP suggestions',
};

function GroundedOutputCard({ response }: { response: GroundedResponse }): JSX.Element {
  const { workflowType, structured, contextSummary } = response;

  if (workflowType === 'event') {
    const s = structured as EventSuggestion;
    return (
      <Box
        sx={{
          border: 1,
          borderColor: 'primary.light',
          borderRadius: 2,
          p: 1.5,
          bgcolor: 'primary.50',
        }}
      >
        <Typography variant="caption" color="primary" fontWeight={700} display="block" mb={0.5}>
          Event Suggestions
        </Typography>
        {s.title && (
          <Typography variant="body2" fontWeight={600}>
            {s.title}
          </Typography>
        )}
        {s.description && (
          <Typography variant="body2" color="text.secondary" mt={0.5}>
            {s.description}
          </Typography>
        )}
        {s.venueType && (
          <Chip label={s.venueType} size="small" sx={{ mt: 0.5 }} variant="outlined" />
        )}
        {s.promotionalTips && s.promotionalTips.length > 0 && (
          <Box mt={0.75}>
            <Typography variant="caption" color="text.secondary" fontWeight={600}>
              Promotional tips:
            </Typography>
            {s.promotionalTips.map((tip, i) => (
              <Typography key={i} variant="caption" display="block" color="text.secondary">
                • {tip}
              </Typography>
            ))}
          </Box>
        )}
        {contextSummary?.groundedFields && contextSummary.groundedFields.length > 0 && (
          <Box mt={0.75}>
            <Typography variant="caption" color="text.disabled">
              Grounded on: {contextSummary.groundedFields.join(', ')}
            </Typography>
          </Box>
        )}
      </Box>
    );
  }

  if (workflowType === 'task') {
    const s = structured as TaskSuggestion;
    return (
      <Box
        sx={{
          border: 1,
          borderColor: 'secondary.light',
          borderRadius: 2,
          p: 1.5,
          bgcolor: 'grey.50',
        }}
      >
        <Typography variant="caption" color="secondary" fontWeight={700} display="block" mb={0.5}>
          Suggested Task
        </Typography>
        {s.actionTitle && (
          <Typography variant="body2" fontWeight={600}>
            {s.actionTitle}
          </Typography>
        )}
        {s.dueDateRange && (
          <Typography variant="caption" color="text.secondary" display="block">
            Due: {s.dueDateRange}
          </Typography>
        )}
        {s.owner && (
          <Typography variant="caption" color="text.secondary" display="block">
            Owner: {s.owner}
          </Typography>
        )}
        {s.dependencies && s.dependencies.length > 0 && (
          <Box mt={0.5}>
            <Typography variant="caption" color="text.secondary" fontWeight={600}>
              Dependencies:
            </Typography>
            {s.dependencies.map((dep, i) => (
              <Typography key={i} variant="caption" display="block" color="text.secondary">
                • {dep}
              </Typography>
            ))}
          </Box>
        )}
      </Box>
    );
  }

  // RSVP
  const s = structured as RsvpSuggestion;
  return (
    <Box
      sx={{
        border: 1,
        borderColor: 'success.light',
        borderRadius: 2,
        p: 1.5,
        bgcolor: 'success.50',
      }}
    >
      <Typography variant="caption" color="success.dark" fontWeight={700} display="block" mb={0.5}>
        RSVP Suggestions
      </Typography>
      {s.confirmationMessage && (
        <Box mb={0.5}>
          <Typography variant="caption" fontWeight={600} color="text.secondary">
            Confirmation:
          </Typography>
          <Typography variant="body2">{s.confirmationMessage}</Typography>
        </Box>
      )}
      {s.reminderMessage && (
        <Box mb={0.5}>
          <Typography variant="caption" fontWeight={600} color="text.secondary">
            Reminder:
          </Typography>
          <Typography variant="body2">{s.reminderMessage}</Typography>
        </Box>
      )}
      {s.capacityTip && (
        <Box>
          <Typography variant="caption" fontWeight={600} color="text.secondary">
            Capacity tip:
          </Typography>
          <Typography variant="body2">{s.capacityTip}</Typography>
        </Box>
      )}
    </Box>
  );
}

export function AiAssistant(): JSX.Element {
  const [open, setOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<0 | 1>(0);

  // Chat mode state
  const [context, setContext] = useState<Context>('general');
  const [prompt, setPrompt] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);

  // Grounded workflow state
  const [workflowType, setWorkflowType] = useState<WorkflowType>('event');
  const [entityId, setEntityId] = useState('');
  const [workflowPrompt, setWorkflowPrompt] = useState('');
  const [workflowLoading, setWorkflowLoading] = useState(false);
  const [workflowResult, setWorkflowResult] = useState<GroundedResponse | null>(null);
  const [workflowError, setWorkflowError] = useState<string | null>(null);

  async function sendMessage(): Promise<void> {
    const text = prompt.trim();
    if (!text || loading) return;

    setMessages((prev) => [...prev, { role: 'user', text }]);
    setPrompt('');
    setLoading(true);

    try {
      const data = await api.post<{ suggestion: string }>('/api/ai/suggest', {
        context,
        prompt: text,
      });
      setMessages((prev) => [...prev, { role: 'assistant', text: data.suggestion }]);
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'AI request failed.';
      setMessages((prev) => [...prev, { role: 'assistant', text: `⚠️ ${message}` }]);
    } finally {
      setLoading(false);
    }
  }

  async function runGroundedWorkflow(): Promise<void> {
    const eid = parseInt(entityId, 10);
    if (!workflowPrompt.trim() || !Number.isFinite(eid) || eid <= 0) return;

    setWorkflowLoading(true);
    setWorkflowError(null);
    setWorkflowResult(null);

    try {
      const data = await api.post<GroundedResponse>('/api/ai/grounded', {
        workflowType,
        entityId: eid,
        prompt: workflowPrompt.trim(),
      });
      setWorkflowResult(data);
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'AI request failed.';
      setWorkflowError(message);
    } finally {
      setWorkflowLoading(false);
    }
  }

  function handleKeyDown(e: KeyboardEvent<HTMLDivElement>): void {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void sendMessage();
    }
  }

  function handleWorkflowKeyDown(e: KeyboardEvent<HTMLDivElement>): void {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void runGroundedWorkflow();
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
            width: 380,
            maxHeight: 580,
            display: 'flex',
            flexDirection: 'column',
            zIndex: 1299,
            borderRadius: 3,
            overflow: 'hidden',
          }}
        >
          {/* Header */}
          <Box
            sx={{
              p: 2,
              bgcolor: 'primary.main',
              color: 'primary.contrastText',
              display: 'flex',
              alignItems: 'center',
              gap: 1,
            }}
          >
            <AutoAwesomeRounded fontSize="small" />
            <Typography variant="subtitle1" fontWeight={700} flexGrow={1}>
              AI Planning Assistant
            </Typography>
            <IconButton size="small" sx={{ color: 'inherit' }} onClick={() => setOpen(false)}>
              <CloseRounded fontSize="small" />
            </IconButton>
          </Box>

          {/* Mode tabs */}
          <Tabs
            value={activeTab}
            onChange={(_e, v: number) => setActiveTab(v as 0 | 1)}
            variant="fullWidth"
            sx={{ borderBottom: 1, borderColor: 'divider', minHeight: 40 }}
          >
            <Tab
              label="Chat"
              icon={<AutoAwesomeRounded fontSize="small" />}
              iconPosition="start"
              sx={{ minHeight: 40, py: 0, fontSize: '0.75rem' }}
            />
            <Tab
              label="Grounded Workflow"
              icon={<HubRounded fontSize="small" />}
              iconPosition="start"
              sx={{ minHeight: 40, py: 0, fontSize: '0.75rem' }}
            />
          </Tabs>

          {/* ── Tab 0: Chat ───────────────────────────────────────────── */}
          {activeTab === 0 && (
            <>
              {/* Context selector */}
              <Box sx={{ px: 2, py: 1, borderBottom: 1, borderColor: 'divider' }}>
                <Select
                  size="small"
                  value={context}
                  onChange={(e) => setContext(e.target.value as Context)}
                  fullWidth
                  aria-label="AI context"
                >
                  {(Object.keys(CONTEXT_LABELS) as Context[]).map((k) => (
                    <MenuItem key={k} value={k}>
                      {CONTEXT_LABELS[k]}
                    </MenuItem>
                  ))}
                </Select>
              </Box>

              {/* Messages */}
              <Box
                role="log"
                aria-live="polite"
                aria-label="AI conversation"
                sx={{
                  flexGrow: 1,
                  overflowY: 'auto',
                  p: 2,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 1.5,
                  minHeight: 200,
                }}
              >
                {messages.length === 0 && !loading && (
                  <Typography
                    variant="body2"
                    color="text.secondary"
                    textAlign="center"
                    sx={{ mt: 2 }}
                  >
                    Ask me anything about festival planning — event ideas, task tips, RSVP
                    strategies, and more.
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
                    <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
                      {msg.text}
                    </Typography>
                  </Box>
                ))}
                {loading && (
                  <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }} aria-label="Loading">
                    <CircularProgress size={16} />
                    <Typography variant="caption" color="text.secondary">
                      Thinking…
                    </Typography>
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
                    inputProps={{ 'aria-label': 'AI prompt input' }}
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
            </>
          )}

          {/* ── Tab 1: Grounded Workflow ───────────────────────────────── */}
          {activeTab === 1 && (
            <Box sx={{ display: 'flex', flexDirection: 'column', flexGrow: 1, overflow: 'hidden' }}>
              {/* Workflow form */}
              <Box sx={{ p: 2, borderBottom: 1, borderColor: 'divider' }}>
                <Typography variant="caption" color="text.secondary" display="block" mb={1}>
                  Grounded workflows fetch live event data before asking the AI, so suggestions are
                  anchored to your actual planner context.
                </Typography>
                <Stack spacing={1}>
                  <Select
                    size="small"
                    value={workflowType}
                    onChange={(e) => {
                      setWorkflowType(e.target.value as WorkflowType);
                      setWorkflowResult(null);
                      setWorkflowError(null);
                    }}
                    fullWidth
                    aria-label="Workflow type"
                  >
                    {(Object.keys(WORKFLOW_LABELS) as WorkflowType[]).map((k) => (
                      <MenuItem key={k} value={k}>
                        {WORKFLOW_LABELS[k]}
                      </MenuItem>
                    ))}
                  </Select>
                  <TextField
                    size="small"
                    label="Event ID"
                    type="number"
                    value={entityId}
                    onChange={(e: ChangeEvent<HTMLInputElement>) => setEntityId(e.target.value)}
                    inputProps={{ min: 1, 'aria-label': 'Event ID' }}
                    fullWidth
                  />
                  <TextField
                    size="small"
                    multiline
                    maxRows={2}
                    placeholder="What do you need help with?"
                    value={workflowPrompt}
                    onChange={(e: ChangeEvent<HTMLInputElement>) =>
                      setWorkflowPrompt(e.target.value)
                    }
                    onKeyDown={handleWorkflowKeyDown}
                    fullWidth
                    disabled={workflowLoading}
                    inputProps={{ 'aria-label': 'Workflow prompt' }}
                  />
                  <Button
                    variant="contained"
                    size="small"
                    endIcon={
                      workflowLoading ? (
                        <CircularProgress size={14} color="inherit" />
                      ) : (
                        <HubRounded />
                      )
                    }
                    onClick={runGroundedWorkflow}
                    disabled={
                      workflowLoading ||
                      !workflowPrompt.trim() ||
                      !entityId ||
                      parseInt(entityId, 10) <= 0
                    }
                    aria-label="Run grounded workflow"
                  >
                    {workflowLoading ? 'Fetching context…' : 'Run Workflow'}
                  </Button>
                </Stack>
              </Box>

              {/* Results area */}
              <Box
                role="region"
                aria-label="Grounded workflow result"
                aria-live="polite"
                sx={{ flexGrow: 1, overflowY: 'auto', p: 2 }}
              >
                {!workflowLoading && !workflowResult && !workflowError && (
                  <Typography variant="body2" color="text.secondary" textAlign="center" mt={1}>
                    Enter an Event ID and a prompt, then run the workflow to get grounded AI
                    suggestions.
                  </Typography>
                )}

                {workflowLoading && (
                  <Box
                    sx={{ display: 'flex', gap: 1, alignItems: 'center', justifyContent: 'center' }}
                    aria-label="Loading grounded workflow"
                  >
                    <CircularProgress size={18} />
                    <Typography variant="caption" color="text.secondary">
                      Fetching live context and generating suggestion…
                    </Typography>
                  </Box>
                )}

                {workflowError && !workflowLoading && (
                  <Alert severity="error" sx={{ fontSize: '0.75rem' }}>
                    {workflowError}
                  </Alert>
                )}

                {workflowResult && !workflowLoading && (
                  <Box>
                    <Divider sx={{ mb: 1 }}>
                      <Typography variant="caption" color="text.secondary">
                        Structured Suggestion
                      </Typography>
                    </Divider>
                    <GroundedOutputCard response={workflowResult} />
                  </Box>
                )}
              </Box>
            </Box>
          )}
        </Paper>
      )}
    </>
  );
}
