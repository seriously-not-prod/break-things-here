import { ChangeEvent, KeyboardEvent, useEffect, useState } from 'react';
import {
  Alert,
  Autocomplete,
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
import {
  AutoAwesomeRounded,
  BarChartRounded,
  CloseRounded,
  ContentCopyRounded,
  EmailRounded,
  HubRounded,
  ListAltRounded,
  ReplayRounded,
  SendRounded,
} from '@mui/icons-material';
import { fetchBudgetInsight, BudgetInsightResponse } from '../../services/budget-insight-service';
import { api, ApiError } from '../../lib/api-client';
import {
  generateRsvpCommunicationDraft,
  type RsvpCommunicationDraft,
  type RsvpDraftLength,
  type RsvpDraftTone,
} from '../../services/rsvp-communication-draft-service';

type Context = 'general' | 'event' | 'task' | 'rsvp';
type WorkflowType = 'event' | 'task' | 'rsvp';

/** Returns a user-facing error message, with a specific denial copy for 403. */
function resolveAiErrorMessage(err: unknown): string {
  if (err instanceof ApiError && err.status === 403) {
    return 'You do not have permission to use AI features. Contact your administrator.';
  }
  return err instanceof ApiError ? err.message : 'AI request failed.';
}

interface Message {
  role: 'user' | 'assistant';
  text: string;
}

interface EventOption {
  id: number;
  title: string;
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

/** #950 — Structured task item from AI task breakdown */
interface TaskBreakdownItem {
  title: string;
  owner: string;
  dueWindow: string;
  dependencies: string[];
  priority: 'low' | 'medium' | 'high' | 'urgent';
  timelineConstraint: string;
}

/** #950 — Full task breakdown response */
interface TaskBreakdownResponse {
  workflowType: 'task-breakdown';
  eventId: number;
  eventTitle: string;
  tasks: TaskBreakdownItem[];
  raw: string;
  contextSummary: {
    groundedFields: string[];
    totalExistingTasks: number;
  };
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

const QUICK_START_PROMPTS = [
  'Event venue ideas',
  'Task timeline tips',
  'RSVP strategy',
  'Budget planning tips',
] as const;

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

const PRIORITY_COLORS: Record<TaskBreakdownItem['priority'], string> = {
  low: 'default',
  medium: 'info',
  high: 'warning',
  urgent: 'error',
};

/** #950 — Renders a single generated task card with a copy button. */
function TaskBreakdownCard({
  item,
  index,
}: {
  item: TaskBreakdownItem;
  index: number;
}): JSX.Element {
  const [copied, setCopied] = useState(false);

  function handleCopy(): void {
    const text = [
      `Task: ${item.title}`,
      item.owner ? `Owner: ${item.owner}` : '',
      item.dueWindow ? `Due: ${item.dueWindow}` : '',
      item.priority ? `Priority: ${item.priority}` : '',
      item.timelineConstraint ? `Timeline: ${item.timelineConstraint}` : '',
      item.dependencies.length > 0 ? `Dependencies: ${item.dependencies.join(', ')}` : '',
    ]
      .filter(Boolean)
      .join('\n');

    void navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <Box
      sx={{
        border: 1,
        borderColor: 'divider',
        borderRadius: 2,
        p: 1.5,
        bgcolor: index % 2 === 0 ? 'grey.50' : 'background.paper',
      }}
    >
      <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={0.5}>
        <Typography variant="body2" fontWeight={600} flexGrow={1}>
          {index + 1}. {item.title}
        </Typography>
        <Stack direction="row" spacing={0.5} alignItems="center" flexShrink={0}>
          <Chip
            label={item.priority}
            size="small"
            color={PRIORITY_COLORS[item.priority] as 'default' | 'info' | 'warning' | 'error'}
            variant="outlined"
            sx={{ fontSize: '0.65rem', height: 18 }}
          />
          <Tooltip title={copied ? 'Copied!' : 'Copy task'}>
            <IconButton size="small" onClick={handleCopy} aria-label={`Copy task ${index + 1}`}>
              <ContentCopyRounded sx={{ fontSize: 14 }} />
            </IconButton>
          </Tooltip>
        </Stack>
      </Stack>
      {item.owner && (
        <Typography variant="caption" color="text.secondary" display="block">
          Owner: {item.owner}
        </Typography>
      )}
      {item.dueWindow && (
        <Typography variant="caption" color="text.secondary" display="block">
          Due: {item.dueWindow}
        </Typography>
      )}
      {item.timelineConstraint && (
        <Typography
          variant="caption"
          color="text.disabled"
          display="block"
          sx={{ fontStyle: 'italic' }}
        >
          {item.timelineConstraint}
        </Typography>
      )}
      {item.dependencies.length > 0 && (
        <Box mt={0.5}>
          <Typography variant="caption" color="text.secondary" fontWeight={600}>
            Depends on:{' '}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {item.dependencies.join(' → ')}
          </Typography>
        </Box>
      )}
    </Box>
  );
}

export function AiAssistant(): JSX.Element {
  const [open, setOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<0 | 1 | 2 | 3 | 4>(0);

  // Chat mode state
  const [context, setContext] = useState<Context>('general');
  const [prompt, setPrompt] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);

  // Shared event picker state (used across Grounded, Task Plan, Budget tabs)
  const [events, setEvents] = useState<EventOption[]>([]);
  const [eventsLoading, setEventsLoading] = useState(false);

  // Grounded workflow state
  const [workflowType, setWorkflowType] = useState<WorkflowType>('event');
  const [selectedGroundedEvent, setSelectedGroundedEvent] = useState<EventOption | null>(null);
  const [workflowPrompt, setWorkflowPrompt] = useState('');
  const [workflowLoading, setWorkflowLoading] = useState(false);
  const [workflowResult, setWorkflowResult] = useState<GroundedResponse | null>(null);
  const [workflowError, setWorkflowError] = useState<string | null>(null);

  // #959 — Chat error + retry state
  const [chatError, setChatError] = useState<string | null>(null);
  const [chatRetryPrompt, setChatRetryPrompt] = useState<string | null>(null);

  // #952 — Budget insight state
  const [selectedBudgetEvent, setSelectedBudgetEvent] = useState<EventOption | null>(null);
  const [budgetPrompt, setBudgetPrompt] = useState('');
  const [budgetLoading, setBudgetLoading] = useState(false);
  const [budgetResult, setBudgetResult] = useState<BudgetInsightResponse | null>(null);
  const [budgetError, setBudgetError] = useState<string | null>(null);

  // #950 — Task breakdown state
  const [selectedBreakdownEvent, setSelectedBreakdownEvent] = useState<EventOption | null>(null);
  const [breakdownPrompt, setBreakdownPrompt] = useState('');
  const [breakdownLoading, setBreakdownLoading] = useState(false);
  const [breakdownResult, setBreakdownResult] = useState<TaskBreakdownResponse | null>(null);
  const [breakdownError, setBreakdownError] = useState<string | null>(null);
  const [allCopied, setAllCopied] = useState(false);

  // #951 — RSVP communication drafting state
  const [selectedDraftEvent, setSelectedDraftEvent] = useState<EventOption | null>(null);
  const [draftTone, setDraftTone] = useState<RsvpDraftTone>('friendly');
  const [draftLength, setDraftLength] = useState<RsvpDraftLength>('medium');
  const [draftPrompt, setDraftPrompt] = useState('');
  const [draftLoading, setDraftLoading] = useState(false);
  const [draftResult, setDraftResult] = useState<RsvpCommunicationDraft | null>(null);
  const [draftError, setDraftError] = useState<string | null>(null);
  const [editableReminder, setEditableReminder] = useState('');
  const [editableConfirmation, setEditableConfirmation] = useState('');
  const [editableDeadlineReminder, setEditableDeadlineReminder] = useState('');
  const [copiedDraftField, setCopiedDraftField] = useState<string | null>(null);

  // Fetch shared event list once when the panel opens
  useEffect(() => {
    if (!open || events.length > 0) return;
    setEventsLoading(true);
    api
      .get<EventOption[] | { events: EventOption[] }>('/api/events?limit=200')
      .then((data) => {
        const list = Array.isArray(data)
          ? data
          : ((data as { events: EventOption[] }).events ?? []);
        setEvents(list);
      })
      .catch(() => {
        // Non-critical — user can still type event details manually via prompt
      })
      .finally(() => setEventsLoading(false));
  }, [open]);

  /** #959 — Shared chat request dispatcher; used by sendMessage and retryChatMessage. */
  async function dispatchChatRequest(text: string): Promise<void> {
    setChatError(null);
    setChatRetryPrompt(null);
    setLoading(true);
    try {
      const data = await api.post<{ suggestion: string }>('/api/ai/suggest', {
        context,
        prompt: text,
      });
      setMessages((prev) => [...prev, { role: 'assistant', text: data.suggestion }]);
    } catch (err) {
      const message = resolveAiErrorMessage(err);
      setChatError(message);
      setChatRetryPrompt(text);
    } finally {
      setLoading(false);
    }
  }

  async function sendMessage(): Promise<void> {
    const text = prompt.trim();
    if (!text || loading) return;
    setMessages((prev) => [...prev, { role: 'user', text }]);
    setPrompt('');
    await dispatchChatRequest(text);
  }

  /** #959 — Retry last failed chat message. */
  async function retryChatMessage(): Promise<void> {
    if (!chatRetryPrompt || loading) return;
    await dispatchChatRequest(chatRetryPrompt);
  }

  async function runGroundedWorkflow(): Promise<void> {
    if (!workflowPrompt.trim() || !selectedGroundedEvent) return;

    setWorkflowLoading(true);
    setWorkflowError(null);
    setWorkflowResult(null);

    try {
      const data = await api.post<GroundedResponse>('/api/ai/grounded', {
        workflowType,
        entityId: selectedGroundedEvent.id,
        prompt: workflowPrompt.trim(),
      });
      setWorkflowResult(data);
    } catch (err) {
      const message = resolveAiErrorMessage(err);
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

  // #950 — Task breakdown functions
  async function runTaskBreakdown(): Promise<void> {
    if (!selectedBreakdownEvent) return;

    setBreakdownLoading(true);
    setBreakdownError(null);
    setBreakdownResult(null);

    try {
      const data = await api.post<TaskBreakdownResponse>('/api/ai/task-breakdown', {
        eventId: selectedBreakdownEvent.id,
        prompt: breakdownPrompt.trim() || undefined,
      });
      setBreakdownResult(data);
    } catch (err) {
      const message = resolveAiErrorMessage(err);
      setBreakdownError(message);
    } finally {
      setBreakdownLoading(false);
    }
  }

  // #952 — Budget insight functions
  async function runBudgetInsight(): Promise<void> {
    if (!selectedBudgetEvent) return;

    setBudgetLoading(true);
    setBudgetError(null);
    setBudgetResult(null);

    try {
      const data = await fetchBudgetInsight({
        eventId: selectedBudgetEvent.id,
        prompt: budgetPrompt.trim() || undefined,
      });
      setBudgetResult(data);
    } catch (err) {
      const message = resolveAiErrorMessage(err);
      setBudgetError(message);
    } finally {
      setBudgetLoading(false);
    }
  }

  function handleBudgetKeyDown(e: KeyboardEvent<HTMLDivElement>): void {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void runBudgetInsight();
    }
  }

  function handleBreakdownKeyDown(e: KeyboardEvent<HTMLDivElement>): void {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void runTaskBreakdown();
    }
  }

  function handleCopyAllTasks(): void {
    if (!breakdownResult) return;
    const text = breakdownResult.tasks
      .map((t, i) =>
        [
          `${i + 1}. ${t.title}`,
          t.owner ? `   Owner: ${t.owner}` : '',
          t.dueWindow ? `   Due: ${t.dueWindow}` : '',
          t.priority ? `   Priority: ${t.priority}` : '',
          t.timelineConstraint ? `   Timeline: ${t.timelineConstraint}` : '',
          t.dependencies.length > 0 ? `   Depends on: ${t.dependencies.join(', ')}` : '',
        ]
          .filter(Boolean)
          .join('\n'),
      )
      .join('\n\n');
    void navigator.clipboard.writeText(text).then(() => {
      setAllCopied(true);
      setTimeout(() => setAllCopied(false), 2000);
    });
  }

  // #951 — RSVP Communication Drafting functions
  async function generateDraft(): Promise<void> {
    const eid = selectedDraftEvent?.id;
    if (!eid || eid <= 0) return;

    setDraftLoading(true);
    setDraftError(null);
    setDraftResult(null);
    setEditableReminder('');
    setEditableConfirmation('');
    setEditableDeadlineReminder('');

    try {
      const data = await generateRsvpCommunicationDraft({
        entityId: eid,
        tone: draftTone,
        draftLength,
        prompt: draftPrompt.trim() || undefined,
      });
      setDraftResult(data.drafts);
      setEditableReminder(data.drafts.reminderVariant);
      setEditableConfirmation(data.drafts.confirmationVariant);
      setEditableDeadlineReminder(data.drafts.deadlineReminder);
    } catch (err) {
      const message = resolveAiErrorMessage(err);
      setDraftError(message);
    } finally {
      setDraftLoading(false);
    }
  }

  function copyDraftToClipboard(text: string, field: string): void {
    void navigator.clipboard.writeText(text).then(() => {
      setCopiedDraftField(field);
      setTimeout(() => setCopiedDraftField(null), 2000);
    });
  }

  return (
    <>
      {/* Floating button */}
      <Tooltip title="Open AI assistant" placement="left" disableFocusListener>
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
            <IconButton
              size="small"
              aria-label="Close"
              sx={{ color: 'inherit' }}
              onClick={() => setOpen(false)}
            >
              <CloseRounded fontSize="small" />
            </IconButton>
          </Box>

          {/* Mode tabs */}
          <Tabs
            value={activeTab}
            onChange={(_e, v: number) => setActiveTab(v as 0 | 1 | 2 | 3 | 4)}
            variant="fullWidth"
            sx={{ borderBottom: 1, borderColor: 'divider', minHeight: 40 }}
          >
            <Tab
              id="ai-tab-chat"
              aria-controls="ai-panel-chat"
              label="Chat"
              icon={<AutoAwesomeRounded fontSize="small" />}
              iconPosition="start"
              sx={{ minHeight: 40, py: 0, fontSize: '0.7rem' }}
            />
            <Tab
              id="ai-tab-grounded"
              aria-controls="ai-panel-grounded"
              label="Grounded"
              icon={<HubRounded fontSize="small" />}
              iconPosition="start"
              sx={{ minHeight: 40, py: 0, fontSize: '0.7rem' }}
            />
            <Tab
              id="ai-tab-breakdown"
              aria-controls="ai-panel-breakdown"
              label="Task Plan"
              icon={<ListAltRounded fontSize="small" />}
              iconPosition="start"
              sx={{ minHeight: 40, py: 0, fontSize: '0.7rem' }}
            />
            <Tab
              id="ai-tab-budget"
              aria-controls="ai-panel-budget"
              label="Budget"
              icon={<BarChartRounded fontSize="small" />}
              iconPosition="start"
              sx={{ minHeight: 40, py: 0, fontSize: '0.7rem' }}
            />
            <Tab
              label="RSVP Drafts"
              icon={<EmailRounded fontSize="small" />}
              iconPosition="start"
              sx={{ minHeight: 40, py: 0, fontSize: '0.75rem' }}
            />
          </Tabs>

          {/* ── Tab 0: Chat ───────────────────────────────────────────── */}
          {activeTab === 0 && (
            <Box
              id="ai-panel-chat"
              role="tabpanel"
              aria-labelledby="ai-tab-chat"
              sx={{ display: 'flex', flexDirection: 'column', flexGrow: 1, overflow: 'hidden' }}
            >
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
                aria-busy={loading}
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
                {/* #959 — Actionable onboarding empty state with quick-start chips */}
                {messages.length === 0 && !loading && (
                  <Box>
                    <Typography
                      variant="body2"
                      color="text.secondary"
                      textAlign="center"
                      sx={{ mt: 2, mb: 1.5 }}
                    >
                      Ask me anything about festival planning — event ideas, task tips, RSVP
                      strategies, and more.
                    </Typography>
                    <Typography
                      variant="caption"
                      color="text.disabled"
                      textAlign="center"
                      display="block"
                      mb={1}
                    >
                      Quick start:
                    </Typography>
                    <Box
                      sx={{
                        display: 'flex',
                        flexWrap: 'wrap',
                        gap: 0.75,
                        justifyContent: 'center',
                      }}
                    >
                      {QUICK_START_PROMPTS.map((suggestion) => (
                        <Chip
                          key={suggestion}
                          label={suggestion}
                          size="small"
                          variant="outlined"
                          color="primary"
                          clickable
                          onClick={() => setPrompt(suggestion)}
                          aria-label={`Use prompt: ${suggestion}`}
                        />
                      ))}
                    </Box>
                  </Box>
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
                {/* #959 — Non-blocking loading indicator */}
                {loading && (
                  <Box
                    sx={{ display: 'flex', gap: 1, alignItems: 'center' }}
                    aria-label="AI is thinking"
                  >
                    <CircularProgress size={16} />
                    <Typography variant="caption" color="text.secondary">
                      Thinking…
                    </Typography>
                  </Box>
                )}
              </Box>

              {/* #959 — Chat error state with retry support */}
              {chatError && !loading && (
                <Alert
                  severity="error"
                  sx={{ mx: 1.5, mb: 0.5, fontSize: '0.75rem' }}
                  action={
                    <IconButton
                      size="small"
                      aria-label="Retry last message"
                      onClick={() => void retryChatMessage()}
                    >
                      <ReplayRounded fontSize="small" />
                    </IconButton>
                  }
                >
                  {chatError}
                </Alert>
              )}

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
                    onClick={() => void sendMessage()}
                    disabled={loading || !prompt.trim()}
                    aria-label="Send"
                  >
                    {loading ? <CircularProgress size={20} /> : <SendRounded />}
                  </IconButton>
                </Stack>
              </Box>
            </Box>
          )}

          {/* ── Tab 1: Grounded Workflow ───────────────────────────────── */}
          {activeTab === 1 && (
            <Box
              id="ai-panel-grounded"
              role="tabpanel"
              aria-labelledby="ai-tab-grounded"
              sx={{ display: 'flex', flexDirection: 'column', flexGrow: 1, overflow: 'hidden' }}
            >
              {/* Workflow form */}
              <Box sx={{ p: 2, borderBottom: 1, borderColor: 'divider' }}>
                <Typography variant="caption" color="text.secondary" display="block" mb={1}>
                  Grounded workflows fetch live event data before asking the AI, so suggestions are
                  anchored to your actual planner context.
                </Typography>
                <Stack spacing={1}>
                  <Select
                    native
                    size="small"
                    value={workflowType}
                    onChange={(e) => {
                      setWorkflowType(e.target.value as WorkflowType);
                      setWorkflowResult(null);
                      setWorkflowError(null);
                    }}
                    fullWidth
                    inputProps={{ 'aria-label': 'Workflow type' }}
                  >
                    {(Object.keys(WORKFLOW_LABELS) as WorkflowType[]).map((k) => (
                      <option key={k} value={k}>
                        {WORKFLOW_LABELS[k]}
                      </option>
                    ))}
                  </Select>
                  <Autocomplete<EventOption>
                    size="small"
                    options={events}
                    value={selectedGroundedEvent}
                    onChange={(_e, val) => setSelectedGroundedEvent(val)}
                    loading={eventsLoading}
                    getOptionLabel={(opt) => opt.title}
                    isOptionEqualToValue={(a, b) => a.id === b.id}
                    renderInput={(params) => (
                      <TextField
                        {...params}
                        label="Event"
                        placeholder="Select an event"
                        inputProps={{ ...params.inputProps, 'aria-label': 'Select event' }}
                        InputProps={{
                          ...params.InputProps,
                          endAdornment: (
                            <>
                              {eventsLoading ? (
                                <CircularProgress color="inherit" size={16} />
                              ) : null}
                              {params.InputProps.endAdornment}
                            </>
                          ),
                        }}
                      />
                    )}
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
                    onClick={() => void runGroundedWorkflow()}
                    disabled={workflowLoading || !workflowPrompt.trim() || !selectedGroundedEvent}
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
                aria-busy={workflowLoading}
                sx={{ flexGrow: 1, overflowY: 'auto', p: 2 }}
              >
                {!workflowLoading && !workflowResult && !workflowError && (
                  <Typography variant="body2" color="text.secondary" textAlign="center" mt={1}>
                    Select an event and a prompt, then run the workflow to get grounded AI
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
                  <Alert
                    severity="error"
                    sx={{ fontSize: '0.75rem' }}
                    action={
                      <IconButton
                        size="small"
                        aria-label="Retry workflow"
                        onClick={() => void runGroundedWorkflow()}
                      >
                        <ReplayRounded fontSize="small" />
                      </IconButton>
                    }
                  >
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

          {/* ── Tab 2: Task Breakdown (#950) ───────────────────────── */}
          {activeTab === 2 && (
            <Box
              id="ai-panel-breakdown"
              role="tabpanel"
              aria-labelledby="ai-tab-breakdown"
              sx={{ display: 'flex', flexDirection: 'column', flexGrow: 1, overflow: 'hidden' }}
            >
              {/* Form */}
              <Box sx={{ p: 2, borderBottom: 1, borderColor: 'divider' }}>
                <Typography variant="caption" color="text.secondary" display="block" mb={1}>
                  Generate a full task breakdown grounded in live event data — includes owner
                  suggestions, due-windows, priorities, dependencies, and timeline constraints.
                </Typography>
                <Stack spacing={1}>
                  <Autocomplete<EventOption>
                    size="small"
                    options={events}
                    value={selectedBreakdownEvent}
                    onChange={(_e, val) => setSelectedBreakdownEvent(val)}
                    loading={eventsLoading}
                    getOptionLabel={(opt) => opt.title}
                    isOptionEqualToValue={(a, b) => a.id === b.id}
                    renderInput={(params) => (
                      <TextField
                        {...params}
                        label="Event"
                        placeholder="Select an event"
                        inputProps={{
                          ...params.inputProps,
                          'aria-label': 'Select event for task breakdown',
                        }}
                        InputProps={{
                          ...params.InputProps,
                          endAdornment: (
                            <>
                              {eventsLoading ? (
                                <CircularProgress color="inherit" size={16} />
                              ) : null}
                              {params.InputProps.endAdornment}
                            </>
                          ),
                        }}
                      />
                    )}
                    fullWidth
                  />
                  <TextField
                    size="small"
                    multiline
                    maxRows={2}
                    placeholder="Optional: focus area or instructions"
                    value={breakdownPrompt}
                    onChange={(e: ChangeEvent<HTMLInputElement>) =>
                      setBreakdownPrompt(e.target.value)
                    }
                    onKeyDown={handleBreakdownKeyDown}
                    fullWidth
                    disabled={breakdownLoading}
                    inputProps={{ 'aria-label': 'Task breakdown prompt' }}
                  />
                  <Button
                    variant="contained"
                    size="small"
                    endIcon={
                      breakdownLoading ? (
                        <CircularProgress size={14} color="inherit" />
                      ) : (
                        <ListAltRounded />
                      )
                    }
                    onClick={() => void runTaskBreakdown()}
                    disabled={breakdownLoading || !selectedBreakdownEvent}
                    aria-label="Generate task breakdown"
                  >
                    {breakdownLoading ? 'Generating breakdown…' : 'Generate Task Breakdown'}
                  </Button>
                </Stack>
              </Box>

              {/* Results */}
              <Box
                role="region"
                aria-label="Task breakdown result"
                aria-live="polite"
                aria-busy={breakdownLoading}
                sx={{ flexGrow: 1, overflowY: 'auto', p: 2 }}
              >
                {!breakdownLoading && !breakdownResult && !breakdownError && (
                  <Typography variant="body2" color="text.secondary" textAlign="center" mt={1}>
                    Select an event and click Generate to receive an AI task breakdown grounded in
                    your event context.
                  </Typography>
                )}

                {breakdownLoading && (
                  <Box
                    sx={{ display: 'flex', gap: 1, alignItems: 'center', justifyContent: 'center' }}
                    aria-label="Loading task breakdown"
                  >
                    <CircularProgress size={18} />
                    <Typography variant="caption" color="text.secondary">
                      Fetching event context and generating tasks…
                    </Typography>
                  </Box>
                )}

                {breakdownError && !breakdownLoading && (
                  <Alert
                    severity="error"
                    sx={{ fontSize: '0.75rem' }}
                    action={
                      <IconButton
                        size="small"
                        aria-label="Retry task breakdown"
                        onClick={() => void runTaskBreakdown()}
                      >
                        <ReplayRounded fontSize="small" />
                      </IconButton>
                    }
                  >
                    {breakdownError}
                  </Alert>
                )}

                {breakdownResult && !breakdownLoading && (
                  <Box>
                    <Stack
                      direction="row"
                      justifyContent="space-between"
                      alignItems="center"
                      mb={1}
                    >
                      <Typography variant="caption" fontWeight={700} color="text.secondary">
                        {breakdownResult.eventTitle} — {breakdownResult.tasks.length} task
                        {breakdownResult.tasks.length !== 1 ? 's' : ''} generated
                      </Typography>
                      <Tooltip title={allCopied ? 'Copied all!' : 'Copy all tasks'}>
                        <Button
                          size="small"
                          variant="outlined"
                          startIcon={<ContentCopyRounded sx={{ fontSize: 13 }} />}
                          onClick={handleCopyAllTasks}
                          disabled={breakdownResult.tasks.length === 0}
                          sx={{ fontSize: '0.7rem', py: 0.25, px: 0.75 }}
                          aria-label="Copy all tasks"
                        >
                          {allCopied ? 'Copied!' : 'Copy All'}
                        </Button>
                      </Tooltip>
                    </Stack>

                    {breakdownResult.tasks.length === 0 ? (
                      <Typography variant="body2" color="text.secondary">
                        No tasks were generated. Try a more specific prompt.
                      </Typography>
                    ) : (
                      <Stack spacing={1}>
                        {breakdownResult.tasks.map((item, i) => (
                          <TaskBreakdownCard key={i} item={item} index={i} />
                        ))}
                      </Stack>
                    )}

                    {breakdownResult.contextSummary.groundedFields.length > 0 && (
                      <Typography
                        variant="caption"
                        color="text.disabled"
                        display="block"
                        mt={1}
                        textAlign="right"
                      >
                        Grounded on: {breakdownResult.contextSummary.groundedFields.join(', ')}
                        {breakdownResult.contextSummary.totalExistingTasks > 0 &&
                          ` · ${breakdownResult.contextSummary.totalExistingTasks} existing task(s)`}
                      </Typography>
                    )}
                  </Box>
                )}
              </Box>
            </Box>
          )}
          {/* ── Tab 3: Budget Insight (#952) ─────────────────────── */}
          {activeTab === 3 && (
            <Box
              id="ai-panel-budget"
              role="tabpanel"
              aria-labelledby="ai-tab-budget"
              sx={{ display: 'flex', flexDirection: 'column', flexGrow: 1, overflow: 'hidden' }}
            >
              {/* Form */}
              <Box sx={{ p: 2, borderBottom: 1, borderColor: 'divider' }}>
                <Typography variant="caption" color="text.secondary" display="block" mb={1}>
                  Analyse live budget data for an event — get AI-powered variance analysis, risk
                  level, spending anomalies, and at least 3 actionable recommendations.
                </Typography>
                <Stack spacing={1}>
                  <Autocomplete<EventOption>
                    size="small"
                    options={events}
                    value={selectedBudgetEvent}
                    onChange={(_e, val) => setSelectedBudgetEvent(val)}
                    loading={eventsLoading}
                    getOptionLabel={(opt) => opt.title}
                    isOptionEqualToValue={(a, b) => a.id === b.id}
                    renderInput={(params) => (
                      <TextField
                        {...params}
                        label="Event"
                        placeholder="Select an event"
                        inputProps={{
                          ...params.inputProps,
                          'aria-label': 'Select event for budget insight',
                        }}
                        InputProps={{
                          ...params.InputProps,
                          endAdornment: (
                            <>
                              {eventsLoading ? (
                                <CircularProgress color="inherit" size={16} />
                              ) : null}
                              {params.InputProps.endAdornment}
                            </>
                          ),
                        }}
                      />
                    )}
                    fullWidth
                  />
                  <TextField
                    size="small"
                    multiline
                    maxRows={2}
                    placeholder="Optional: focus area or question"
                    value={budgetPrompt}
                    onChange={(e: ChangeEvent<HTMLInputElement>) => setBudgetPrompt(e.target.value)}
                    onKeyDown={handleBudgetKeyDown}
                    fullWidth
                    disabled={budgetLoading}
                    inputProps={{ 'aria-label': 'Budget insight prompt' }}
                  />
                  <Button
                    variant="contained"
                    size="small"
                    endIcon={
                      budgetLoading ? (
                        <CircularProgress size={14} color="inherit" />
                      ) : (
                        <BarChartRounded />
                      )
                    }
                    onClick={() => void runBudgetInsight()}
                    disabled={budgetLoading || !selectedBudgetEvent}
                    aria-label="Analyse budget"
                  >
                    {budgetLoading ? 'Analysing budget…' : 'Analyse Budget'}
                  </Button>
                </Stack>
              </Box>

              {/* Results */}
              <Box
                role="region"
                aria-label="Budget insight result"
                aria-live="polite"
                aria-busy={budgetLoading}
                sx={{ flexGrow: 1, overflowY: 'auto', p: 2 }}
              >
                {!budgetLoading && !budgetResult && !budgetError && (
                  <Typography variant="body2" color="text.secondary" textAlign="center" mt={1}>
                    Select an event and click Analyse Budget to receive AI-powered financial
                    variance and risk insights.
                  </Typography>
                )}

                {budgetLoading && (
                  <Box
                    sx={{ display: 'flex', gap: 1, alignItems: 'center', justifyContent: 'center' }}
                    aria-label="Loading budget insight"
                  >
                    <CircularProgress size={18} />
                    <Typography variant="caption" color="text.secondary">
                      Fetching budget data and generating insights…
                    </Typography>
                  </Box>
                )}

                {budgetError && !budgetLoading && (
                  <Alert
                    severity="error"
                    sx={{ fontSize: '0.75rem' }}
                    action={
                      <IconButton
                        size="small"
                        aria-label="Retry budget insight"
                        onClick={() => void runBudgetInsight()}
                      >
                        <ReplayRounded fontSize="small" />
                      </IconButton>
                    }
                  >
                    {budgetError}
                  </Alert>
                )}

                {budgetResult && !budgetLoading && (
                  <Box>
                    {/* Risk chip + summary */}
                    <Stack direction="row" spacing={1} alignItems="center" mb={1}>
                      <Chip
                        label={`Risk: ${budgetResult.riskLevel.toUpperCase()}`}
                        size="small"
                        color={
                          budgetResult.riskLevel === 'low'
                            ? 'success'
                            : budgetResult.riskLevel === 'medium'
                              ? 'warning'
                              : 'error'
                        }
                        variant="filled"
                        icon={<BarChartRounded />}
                      />
                      <Typography variant="caption" color="text.secondary">
                        {budgetResult.eventTitle}
                      </Typography>
                    </Stack>

                    {budgetResult.summary && (
                      <Typography
                        variant="body2"
                        color="text.secondary"
                        mb={1}
                        sx={{ fontSize: '0.75rem' }}
                      >
                        {budgetResult.summary}
                      </Typography>
                    )}

                    {/* Spend totals */}
                    <Box
                      sx={{
                        border: 1,
                        borderColor: 'divider',
                        borderRadius: 1,
                        p: 1,
                        mb: 1,
                        bgcolor: 'grey.50',
                      }}
                    >
                      <Typography variant="caption" color="text.secondary" display="block">
                        Allocated: <strong>${budgetResult.totalAllocated.toFixed(2)}</strong> ·
                        Spent: <strong>${budgetResult.totalSpent.toFixed(2)}</strong> · Variance:{' '}
                        <strong
                          style={{ color: budgetResult.totalVariance >= 0 ? 'inherit' : '#d32f2f' }}
                        >
                          ${budgetResult.totalVariance.toFixed(2)}
                        </strong>
                      </Typography>
                      {budgetResult.overspentCategories.length > 0 && (
                        <Typography variant="caption" color="error" display="block" mt={0.25}>
                          Overspent: {budgetResult.overspentCategories.join(', ')}
                        </Typography>
                      )}
                    </Box>

                    {/* Anomalies */}
                    {budgetResult.anomalies.length > 0 && (
                      <Box mb={1}>
                        <Typography
                          variant="caption"
                          fontWeight={700}
                          color="warning.dark"
                          display="block"
                          mb={0.25}
                        >
                          Anomalies detected:
                        </Typography>
                        {budgetResult.anomalies.map((a, i) => (
                          <Typography
                            key={i}
                            variant="caption"
                            color="text.secondary"
                            display="block"
                          >
                            ⚠ {a}
                          </Typography>
                        ))}
                      </Box>
                    )}

                    {/* Recommendations */}
                    {budgetResult.recommendations.length > 0 && (
                      <Box>
                        <Divider sx={{ mb: 0.75 }}>
                          <Typography variant="caption" color="text.secondary">
                            Recommendations
                          </Typography>
                        </Divider>
                        <Stack spacing={0.75}>
                          {budgetResult.recommendations.map((rec, i) => (
                            <Box
                              key={i}
                              sx={{
                                border: 1,
                                borderColor:
                                  rec.priority === 'critical' || rec.priority === 'high'
                                    ? 'error.light'
                                    : 'divider',
                                borderRadius: 1,
                                p: 0.75,
                                bgcolor:
                                  rec.priority === 'critical'
                                    ? 'error.50'
                                    : rec.priority === 'high'
                                      ? 'warning.50'
                                      : 'background.paper',
                              }}
                            >
                              <Stack direction="row" spacing={0.5} alignItems="center" mb={0.25}>
                                <Chip
                                  label={rec.priority}
                                  size="small"
                                  color={
                                    rec.priority === 'critical' || rec.priority === 'high'
                                      ? 'error'
                                      : rec.priority === 'medium'
                                        ? 'warning'
                                        : 'default'
                                  }
                                  sx={{ fontSize: '0.6rem', height: 16 }}
                                />
                                <Typography variant="caption" fontWeight={700}>
                                  {rec.category}
                                </Typography>
                              </Stack>
                              <Typography variant="caption" color="text.secondary" display="block">
                                {rec.insight}
                              </Typography>
                              {rec.action && (
                                <Typography
                                  variant="caption"
                                  color="primary"
                                  display="block"
                                  mt={0.25}
                                >
                                  → {rec.action}
                                </Typography>
                              )}
                            </Box>
                          ))}
                        </Stack>
                      </Box>
                    )}

                    {budgetResult.contextSummary.groundedFields.length > 0 && (
                      <Typography
                        variant="caption"
                        color="text.disabled"
                        display="block"
                        mt={1}
                        textAlign="right"
                      >
                        Grounded on: {budgetResult.contextSummary.groundedFields.join(', ')}
                        {` · ${budgetResult.contextSummary.categoryCount} category(s)`}
                        {budgetResult.contextSummary.expenseCount > 0 &&
                          ` · ${budgetResult.contextSummary.expenseCount} expense(s)`}
                      </Typography>
                    )}
                  </Box>
                )}
              </Box>
            </Box>
          )}

          {/* ── Tab 4: RSVP Communication Drafts (#951) ─────────────────── */}
          {activeTab === 4 && (
            <Box sx={{ display: 'flex', flexDirection: 'column', flexGrow: 1, overflow: 'hidden' }}>
              <Box sx={{ p: 2, borderBottom: 1, borderColor: 'divider' }}>
                <Typography variant="caption" color="text.secondary" display="block" mb={1}>
                  Generate AI-drafted RSVP communication messages grounded in live attendee data.
                  Edit the drafts before sending.
                </Typography>
                <Stack spacing={1}>
                  <Autocomplete<EventOption>
                    size="small"
                    options={events}
                    value={selectedDraftEvent}
                    onChange={(_e, val) => setSelectedDraftEvent(val)}
                    loading={eventsLoading}
                    getOptionLabel={(opt) => opt.title}
                    isOptionEqualToValue={(a, b) => a.id === b.id}
                    renderInput={(params) => (
                      <TextField
                        {...params}
                        label="Event"
                        placeholder="Select an event"
                        inputProps={{
                          ...params.inputProps,
                          'aria-label': 'Select event for RSVP draft',
                        }}
                        InputProps={{
                          ...params.InputProps,
                          endAdornment: (
                            <>
                              {eventsLoading ? (
                                <CircularProgress color="inherit" size={16} />
                              ) : null}
                              {params.InputProps.endAdornment}
                            </>
                          ),
                        }}
                      />
                    )}
                    fullWidth
                  />
                  <Stack direction="row" spacing={1}>
                    <Box flex={1}>
                      <Typography variant="caption" color="text.secondary" display="block" mb={0.5}>
                        Tone
                      </Typography>
                      <Select
                        size="small"
                        value={draftTone}
                        onChange={(e) => setDraftTone(e.target.value as RsvpDraftTone)}
                        fullWidth
                        aria-label="Draft tone"
                      >
                        <MenuItem value="friendly">Friendly</MenuItem>
                        <MenuItem value="formal">Formal</MenuItem>
                        <MenuItem value="casual">Casual</MenuItem>
                        <MenuItem value="urgent">Urgent</MenuItem>
                      </Select>
                    </Box>
                    <Box flex={1}>
                      <Typography variant="caption" color="text.secondary" display="block" mb={0.5}>
                        Length
                      </Typography>
                      <Select
                        size="small"
                        value={draftLength}
                        onChange={(e) => setDraftLength(e.target.value as RsvpDraftLength)}
                        fullWidth
                        aria-label="Draft length"
                      >
                        <MenuItem value="short">Short</MenuItem>
                        <MenuItem value="medium">Medium</MenuItem>
                        <MenuItem value="long">Long</MenuItem>
                      </Select>
                    </Box>
                  </Stack>
                  <TextField
                    size="small"
                    multiline
                    maxRows={2}
                    placeholder="Optional: additional context (e.g. venue change, special instructions)"
                    value={draftPrompt}
                    onChange={(e: ChangeEvent<HTMLInputElement>) => setDraftPrompt(e.target.value)}
                    fullWidth
                    disabled={draftLoading}
                    inputProps={{ 'aria-label': 'Additional context for RSVP draft' }}
                  />
                  <Button
                    variant="contained"
                    size="small"
                    endIcon={
                      draftLoading ? <CircularProgress size={14} color="inherit" /> : undefined
                    }
                    onClick={() => void generateDraft()}
                    disabled={draftLoading || !selectedDraftEvent}
                    aria-label="Generate RSVP communication drafts"
                  >
                    {draftLoading ? 'Generating drafts…' : 'Generate Drafts'}
                  </Button>
                </Stack>
              </Box>
              <Box
                role="region"
                aria-label="RSVP communication drafts"
                aria-live="polite"
                sx={{ flexGrow: 1, overflowY: 'auto', p: 2 }}
              >
                {!draftLoading && !draftResult && !draftError && (
                  <Typography variant="body2" color="text.secondary" textAlign="center" mt={1}>
                    Select an event and choose tone/length, then generate drafts to get AI-written
                    RSVP messages you can edit and send.
                  </Typography>
                )}
                {draftLoading && (
                  <Box
                    sx={{ display: 'flex', gap: 1, alignItems: 'center', justifyContent: 'center' }}
                  >
                    <CircularProgress size={18} />
                    <Typography variant="caption" color="text.secondary">
                      Fetching RSVP context and drafting messages…
                    </Typography>
                  </Box>
                )}
                {draftError && !draftLoading && (
                  <Alert severity="error" sx={{ fontSize: '0.75rem' }}>
                    {draftError}
                  </Alert>
                )}
                {draftResult && !draftLoading && (
                  <Stack spacing={1.5}>
                    <Divider>
                      <Typography variant="caption" color="text.secondary">
                        Editable Drafts
                      </Typography>
                    </Divider>
                    <Box>
                      <Stack
                        direction="row"
                        alignItems="center"
                        justifyContent="space-between"
                        mb={0.5}
                      >
                        <Typography variant="caption" fontWeight={700} color="warning.dark">
                          Reminder (pending / maybe guests)
                        </Typography>
                        <Tooltip title={copiedDraftField === 'reminder' ? 'Copied!' : 'Copy'}>
                          <IconButton
                            size="small"
                            onClick={() => copyDraftToClipboard(editableReminder, 'reminder')}
                            aria-label="Copy reminder draft"
                          >
                            <ContentCopyRounded fontSize="inherit" />
                          </IconButton>
                        </Tooltip>
                      </Stack>
                      <TextField
                        size="small"
                        multiline
                        minRows={3}
                        maxRows={6}
                        value={editableReminder}
                        onChange={(e: ChangeEvent<HTMLInputElement>) =>
                          setEditableReminder(e.target.value)
                        }
                        fullWidth
                        inputProps={{ 'aria-label': 'Edit reminder draft' }}
                      />
                    </Box>
                    <Box>
                      <Stack
                        direction="row"
                        alignItems="center"
                        justifyContent="space-between"
                        mb={0.5}
                      >
                        <Typography variant="caption" fontWeight={700} color="success.dark">
                          Confirmation (confirmed guests)
                        </Typography>
                        <Tooltip title={copiedDraftField === 'confirmation' ? 'Copied!' : 'Copy'}>
                          <IconButton
                            size="small"
                            onClick={() =>
                              copyDraftToClipboard(editableConfirmation, 'confirmation')
                            }
                            aria-label="Copy confirmation draft"
                          >
                            <ContentCopyRounded fontSize="inherit" />
                          </IconButton>
                        </Tooltip>
                      </Stack>
                      <TextField
                        size="small"
                        multiline
                        minRows={3}
                        maxRows={6}
                        value={editableConfirmation}
                        onChange={(e: ChangeEvent<HTMLInputElement>) =>
                          setEditableConfirmation(e.target.value)
                        }
                        fullWidth
                        inputProps={{ 'aria-label': 'Edit confirmation draft' }}
                      />
                    </Box>
                    <Box>
                      <Stack
                        direction="row"
                        alignItems="center"
                        justifyContent="space-between"
                        mb={0.5}
                      >
                        <Typography variant="caption" fontWeight={700} color="error.dark">
                          Deadline Reminder (non-responders)
                        </Typography>
                        <Tooltip title={copiedDraftField === 'deadline' ? 'Copied!' : 'Copy'}>
                          <IconButton
                            size="small"
                            onClick={() =>
                              copyDraftToClipboard(editableDeadlineReminder, 'deadline')
                            }
                            aria-label="Copy deadline reminder draft"
                          >
                            <ContentCopyRounded fontSize="inherit" />
                          </IconButton>
                        </Tooltip>
                      </Stack>
                      <TextField
                        size="small"
                        multiline
                        minRows={3}
                        maxRows={6}
                        value={editableDeadlineReminder}
                        onChange={(e: ChangeEvent<HTMLInputElement>) =>
                          setEditableDeadlineReminder(e.target.value)
                        }
                        fullWidth
                        inputProps={{ 'aria-label': 'Edit deadline reminder draft' }}
                      />
                    </Box>
                  </Stack>
                )}
              </Box>
            </Box>
          )}
        </Paper>
      )}
    </>
  );
}
