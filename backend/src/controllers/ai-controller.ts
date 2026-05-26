/**
 * AI Suggestions controller — prefers Azure OpenAI and falls back to OpenAI.
 * If neither provider is configured, returns a clear 503 response.
 *
 * Grounded Workflow Support (#947):
 * POST /api/ai/grounded fetches live event/task/RSVP data before calling the
 * model so suggestions are anchored to real planner context.  All AI requests
 * are logged to ai_request_logs for observability.  Structured JSON output is
 * validated and returned alongside the raw model response.
 */
import { Request, Response } from 'express';
import https from 'https';
import { getDatabase } from '../db/database.js';

function readEnv(...keys: string[]): string {
  for (const key of keys) {
    const value = process.env[key];
    if (typeof value === 'string' && value.trim() !== '') {
      return value.trim();
    }
  }
  return '';
}

const AZURE_OPENAI_ENDPOINT = readEnv('AZURE_OPENAI_ENDPOINT', 'ENDPOINT');
const AZURE_OPENAI_API_KEY = readEnv('AZURE_OPENAI_API_KEY', 'API_KEY');
const AZURE_OPENAI_DEPLOYMENT = readEnv('AZURE_OPENAI_DEPLOYMENT') || 'gpt-4o-mini';
const AZURE_OPENAI_API_VERSION = readEnv('AZURE_OPENAI_API_VERSION') || '2024-02-15-preview';

const OPENAI_API_KEY = readEnv('OPENAI_API_KEY');
const OPENAI_MODEL = readEnv('OPENAI_MODEL') || 'gpt-4o-mini';

interface SuggestBody {
  context: 'event' | 'task' | 'rsvp' | 'general';
  prompt: string;
}

interface AiProviderRequest {
  hostname: string;
  path: string;
  headers: Record<string, string | number>;
  body: string;
}

type AiProviderConfig =
  | { kind: 'azure' }
  | { kind: 'openai' }
  | { kind: 'misconfigured'; message: string }
  | { kind: 'none' };

function resolveAiProviderConfig(): AiProviderConfig {
  const hasAnyAzureConfig = Boolean(AZURE_OPENAI_ENDPOINT || AZURE_OPENAI_API_KEY);

  if (hasAnyAzureConfig) {
    const missing: string[] = [];
    if (!AZURE_OPENAI_ENDPOINT) {
      missing.push('AZURE_OPENAI_ENDPOINT (or ENDPOINT)');
    }
    if (!AZURE_OPENAI_API_KEY) {
      missing.push('AZURE_OPENAI_API_KEY (or API_KEY)');
    }
    if (missing.length > 0) {
      return {
        kind: 'misconfigured',
        message: `Azure OpenAI is partially configured. Missing: ${missing.join(', ')}.`,
      };
    }
    return { kind: 'azure' };
  }

  if (OPENAI_API_KEY) {
    return { kind: 'openai' };
  }

  return { kind: 'none' };
}

function buildProviderRequest(
  provider: Extract<AiProviderConfig, { kind: 'azure' | 'openai' }>,
  systemPrompt: string,
  userMessage: string,
): AiProviderRequest {
  if (provider.kind === 'azure') {
    const endpoint = AZURE_OPENAI_ENDPOINT.replace(/\/+$/, '');
    const url = new URL(
      `${endpoint}/openai/deployments/${encodeURIComponent(
        AZURE_OPENAI_DEPLOYMENT,
      )}/chat/completions?api-version=${encodeURIComponent(AZURE_OPENAI_API_VERSION)}`,
    );
    const body = JSON.stringify({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
      max_tokens: 400,
      temperature: 0.7,
    });

    return {
      hostname: url.hostname,
      path: `${url.pathname}${url.search}`,
      headers: {
        'Content-Type': 'application/json',
        'api-key': AZURE_OPENAI_API_KEY,
        'Content-Length': Buffer.byteLength(body),
      },
      body,
    };
  }

  const body = JSON.stringify({
    model: OPENAI_MODEL,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage },
    ],
    max_tokens: 400,
    temperature: 0.7,
  });

  return {
    hostname: 'api.openai.com',
    path: '/v1/chat/completions',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      'Content-Length': Buffer.byteLength(body),
    },
    body,
  };
}

function callAiProvider(
  provider: Extract<AiProviderConfig, { kind: 'azure' | 'openai' }>,
  systemPrompt: string,
  userMessage: string,
): Promise<string> {
  const request = buildProviderRequest(provider, systemPrompt, userMessage);

  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: request.hostname,
        path: request.path,
        method: 'POST',
        headers: request.headers,
      },
      (res) => {
        let data = '';
        res.on('data', (chunk: Buffer) => (data += chunk.toString()));
        res.on('end', () => {
          try {
            const parsed = JSON.parse(data) as {
              choices?: { message?: { content?: string } }[];
              error?: { message?: string };
            };
            if (parsed.error) {
              reject(new Error(parsed.error.message ?? 'AI provider error'));
            } else {
              resolve(parsed.choices?.[0]?.message?.content?.trim() ?? '');
            }
          } catch {
            reject(new Error('Failed to parse AI provider response'));
          }
        });
      },
    );

    req.on('error', reject);
    req.write(request.body);
    req.end();
  });
}

const SYSTEM_PROMPTS: Record<SuggestBody['context'], string> = {
  event: `You are a festival event planning assistant. Given partial event details, 
    suggest a catchy title, a short engaging description, an ideal venue type, 
    and 3 promotional tips. Be concise and practical.`,
  task: `You are a festival event planning assistant specialising in task management. 
    Given a task description, suggest a clear action title, a realistic due-date 
    range, who should own it, and any dependencies. Be brief.`,
  rsvp: `You are a festival event planning assistant. Given RSVP data context, 
    suggest personalised confirmation messages, follow-up reminders, and capacity 
    management tips. Be friendly and concise.`,
  general: `You are a helpful festival event planning assistant. Answer the user's 
    question with practical, actionable advice for running a successful festival event.`,
};

interface AuthRequest extends Request {
  user?: { id: number; email: string; role_id: number };
}

// Per-user rate limit: 20 AI requests per rolling 1-hour window, persisted
// in the ai_rate_limits table so the budget survives server restarts and is
// enforced uniformly across multiple replicas. The UPSERT below is atomic —
// it resets count to 1 when the existing window is older than 1 hour, or
// increments otherwise, and returns the new count in the same round-trip.
const AI_RATE_LIMIT_PER_HOUR = 20;
const AI_RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;

async function checkAiRateLimit(userId: number): Promise<boolean> {
  const db = getDatabase();
  const row = await db.get<{ count: number }>(
    `INSERT INTO ai_rate_limits (user_id, window_start, count, updated_at)
     VALUES ($1, NOW(), 1, NOW())
     ON CONFLICT (user_id) DO UPDATE
       SET count = CASE
                     WHEN (EXTRACT(EPOCH FROM (NOW() - ai_rate_limits.window_start)) * 1000) > $2
                     THEN 1
                     ELSE ai_rate_limits.count + 1
                   END,
           window_start = CASE
                            WHEN (EXTRACT(EPOCH FROM (NOW() - ai_rate_limits.window_start)) * 1000) > $2
                            THEN NOW()
                            ELSE ai_rate_limits.window_start
                          END,
           updated_at = NOW()
     RETURNING count`,
    [userId, AI_RATE_LIMIT_WINDOW_MS],
  );
  return (row?.count ?? Number.POSITIVE_INFINITY) <= AI_RATE_LIMIT_PER_HOUR;
}

/** Sanitise user-supplied text before including in prompts to prevent prompt injection. */
function sanitisePrompt(input: string): string {
  return input
    .replace(/ignore\s+(previous|prior|above)\s+instructions?/gi, '[FILTERED]')
    .replace(/you\s+are\s+now\s+/gi, '[FILTERED] ')
    .replace(/system\s*prompt/gi, '[FILTERED]')
    .replace(/\[SYSTEM\]/gi, '[FILTERED]')
    .replace(/<[^>]{0,200}>/g, '')
    .substring(0, 2000)
    .trim();
}

/** POST /api/ai/suggest */
export async function getSuggestion(req: AuthRequest, res: Response): Promise<Response> {
  const { context, prompt } = req.body as Partial<SuggestBody>;

  if (!prompt?.trim()) {
    return res.status(400).json({ error: 'prompt is required.' });
  }

  const userId = req.user?.id;
  if (userId !== undefined && !(await checkAiRateLimit(userId))) {
    return res
      .status(429)
      .json({ error: 'AI rate limit exceeded. You can make 20 AI requests per hour.' });
  }

  // Validate that context is one of the four known keys before indexing into
  // SYSTEM_PROMPTS, preventing untrusted input from being used as an object key.
  const VALID_CONTEXTS = new Set<SuggestBody['context']>(['event', 'task', 'rsvp', 'general']);
  const ctx: SuggestBody['context'] = VALID_CONTEXTS.has(context as SuggestBody['context'])
    ? (context as SuggestBody['context'])
    : 'general';

  const provider = resolveAiProviderConfig();
  if (provider.kind === 'misconfigured') {
    return res.status(503).json({ error: provider.message });
  }

  if (provider.kind === 'none') {
    return res.status(503).json({
      error:
        'AI suggestions are not configured. Set Azure OpenAI (AZURE_OPENAI_ENDPOINT + AZURE_OPENAI_API_KEY + AZURE_OPENAI_DEPLOYMENT) or OPENAI_API_KEY.',
    });
  }

  try {
    const suggestion = await callAiProvider(provider, SYSTEM_PROMPTS[ctx], sanitisePrompt(prompt));
    return res.json({ suggestion });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown AI error';
    return res.status(502).json({ error: `AI request failed: ${message}` });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Grounded Workflow Support — Task #947
// ─────────────────────────────────────────────────────────────────────────────

export type WorkflowType = 'event' | 'task' | 'rsvp';

interface GroundedWorkflowBody {
  workflowType: WorkflowType;
  entityId: number;
  prompt: string;
}

// ── Structured output types ──────────────────────────────────────────────────

export interface EventSuggestion {
  title: string;
  description: string;
  venueType: string;
  promotionalTips: string[];
}

export interface TaskSuggestion {
  actionTitle: string;
  dueDateRange: string;
  owner: string;
  dependencies: string[];
}

export interface RsvpSuggestion {
  confirmationMessage: string;
  reminderMessage: string;
  capacityTip: string;
}

export type GroundedSuggestion = EventSuggestion | TaskSuggestion | RsvpSuggestion;

interface GroundedSuggestionResponse {
  workflowType: WorkflowType;
  entityId: number;
  structured: GroundedSuggestion;
  raw: string;
}

// ── Observability ─────────────────────────────────────────────────────────────

async function logAiRequest(params: {
  userId: number | undefined;
  workflowType: string;
  entityId: number | null;
  provider: string;
  durationMs: number;
  status: 'success' | 'error';
  errorMessage?: string;
}): Promise<void> {
  try {
    const db = getDatabase();
    await db.run(
      `INSERT INTO ai_request_logs
         (user_id, workflow_type, entity_id, provider, duration_ms, status, error_message, requested_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
      [
        params.userId ?? null,
        params.workflowType,
        params.entityId,
        params.provider,
        params.durationMs,
        params.status,
        params.errorMessage ?? null,
      ],
    );
  } catch {
    // Observability is best-effort; a log failure must not fail the request.
  }
}

// ── Grounded context fetch helpers ────────────────────────────────────────────

interface EventContext {
  id: number;
  title: string;
  description: string | null;
  date: string | null;
  capacity: number | null;
  status: string;
  venue_name: string | null;
  confirmedRsvps: number;
  totalRsvps: number;
}

interface TaskContext {
  eventTitle: string;
  tasks: Array<{
    title: string;
    status: string;
    due_date: string | null;
    description: string | null;
  }>;
}

interface RsvpContext {
  eventTitle: string;
  capacity: number | null;
  confirmed: number;
  declined: number;
  pending: number;
  total: number;
}

async function fetchEventContext(entityId: number): Promise<EventContext | null> {
  const db = getDatabase();
  const event = await db.get<{
    id: number;
    title: string;
    description: string | null;
    date: string | null;
    capacity: number | null;
    status: string;
    venue_name: string | null;
  }>(
    `SELECT id, title, description, date, capacity, status, venue_name
     FROM events WHERE id = $1 AND deleted_at IS NULL`,
    [entityId],
  );
  if (!event) return null;

  const rsvpStats = await db.get<{ confirmed: number; total: number }>(
    `SELECT
       COUNT(*) FILTER (WHERE status = 'confirmed')::int AS confirmed,
       COUNT(*)::int AS total
     FROM rsvps WHERE event_id = $1`,
    [entityId],
  );

  return {
    ...event,
    confirmedRsvps: rsvpStats?.confirmed ?? 0,
    totalRsvps: rsvpStats?.total ?? 0,
  };
}

async function fetchTaskContext(entityId: number): Promise<TaskContext | null> {
  const db = getDatabase();
  const event = await db.get<{ title: string }>(
    `SELECT title FROM events WHERE id = $1 AND deleted_at IS NULL`,
    [entityId],
  );
  if (!event) return null;

  const tasks = await db.all<{
    title: string;
    status: string;
    due_date: string | null;
    description: string | null;
  }>(
    `SELECT title, status, due_date, description
     FROM tasks WHERE event_id = $1 ORDER BY created_at DESC LIMIT 20`,
    [entityId],
  );

  return { eventTitle: event.title, tasks };
}

async function fetchRsvpContext(entityId: number): Promise<RsvpContext | null> {
  const db = getDatabase();
  const event = await db.get<{ title: string; capacity: number | null }>(
    `SELECT title, capacity FROM events WHERE id = $1 AND deleted_at IS NULL`,
    [entityId],
  );
  if (!event) return null;

  const stats = await db.get<{
    confirmed: number;
    declined: number;
    pending: number;
    total: number;
  }>(
    `SELECT
       COUNT(*) FILTER (WHERE status = 'confirmed')::int AS confirmed,
       COUNT(*) FILTER (WHERE status = 'declined')::int AS declined,
       COUNT(*) FILTER (WHERE status = 'pending')::int AS pending,
       COUNT(*)::int AS total
     FROM rsvps WHERE event_id = $1`,
    [entityId],
  );

  return {
    eventTitle: event.title,
    capacity: event.capacity,
    confirmed: stats?.confirmed ?? 0,
    declined: stats?.declined ?? 0,
    pending: stats?.pending ?? 0,
    total: stats?.total ?? 0,
  };
}

// ── Grounded prompt builders ───────────────────────────────────────────────────

// System prompts instruct the model to return ONLY a JSON object so that
// the response can be deterministically parsed into a typed structure.
const GROUNDED_SYSTEM_PROMPTS: Record<WorkflowType, string> = {
  event: `You are a festival event planning AI assistant. You will receive details about a real event.
Analyze the event and return ONLY a valid JSON object with this exact schema (no markdown, no explanation):
{"title":"improved title suggestion","description":"improved description","venueType":"ideal venue type","promotionalTips":["tip 1","tip 2","tip 3"]}`,
  task: `You are a task management AI for festival events. You will receive an event title and its current task list.
Suggest the next best task and return ONLY a valid JSON object (no markdown, no explanation):
{"actionTitle":"task title","dueDateRange":"suggested due date range","owner":"suggested role/person type","dependencies":["dep1","dep2"]}`,
  rsvp: `You are an RSVP management AI for festival events. You will receive attendance statistics for a real event.
Analyze and return ONLY a valid JSON object (no markdown, no explanation):
{"confirmationMessage":"suggested confirmation message","reminderMessage":"suggested reminder message","capacityTip":"capacity management tip"}`,
};

function buildGroundedUserMessage(
  workflowType: WorkflowType,
  context: EventContext | TaskContext | RsvpContext,
  userPrompt: string,
): string {
  switch (workflowType) {
    case 'event': {
      const ctx = context as EventContext;
      return [
        'Event details:',
        `Title: ${ctx.title}`,
        `Description: ${ctx.description ?? 'None'}`,
        `Date: ${ctx.date ?? 'Not set'}`,
        `Capacity: ${ctx.capacity ?? 'Not set'}`,
        `Status: ${ctx.status}`,
        `Venue: ${ctx.venue_name ?? 'Not set'}`,
        `Confirmed RSVPs: ${ctx.confirmedRsvps} / ${ctx.totalRsvps} total`,
        '',
        `User request: ${userPrompt}`,
      ].join('\n');
    }
    case 'task': {
      const ctx = context as TaskContext;
      const taskList =
        ctx.tasks.length > 0
          ? ctx.tasks
              .map((t) => `- [${t.status}] ${t.title}${t.due_date ? ` (due: ${t.due_date})` : ''}`)
              .join('\n')
          : 'No tasks yet';
      return [
        `Event: ${ctx.eventTitle}`,
        'Existing tasks:',
        taskList,
        '',
        `User request: ${userPrompt}`,
      ].join('\n');
    }
    case 'rsvp': {
      const ctx = context as RsvpContext;
      const fillRate =
        ctx.capacity && ctx.capacity > 0
          ? `${Math.round((ctx.confirmed / ctx.capacity) * 100)}%`
          : 'N/A';
      return [
        `Event: ${ctx.eventTitle}`,
        `Capacity: ${ctx.capacity ?? 'Unlimited'}`,
        `RSVPs — Confirmed: ${ctx.confirmed}, Declined: ${ctx.declined}, Pending: ${ctx.pending}, Total: ${ctx.total}`,
        `Fill rate: ${fillRate}`,
        '',
        `User request: ${userPrompt}`,
      ].join('\n');
    }
  }
}

// ── Structured output parser ───────────────────────────────────────────────────

export function parseStructuredOutput(
  workflowType: WorkflowType,
  raw: string,
): GroundedSuggestion | null {
  try {
    // Strip any accidental markdown fences the model may have added.
    const cleaned = raw
      .replace(/```(?:json)?\s*/gi, '')
      .replace(/```\s*/g, '')
      .trim();
    const parsed = JSON.parse(cleaned) as Record<string, unknown>;

    if (workflowType === 'event') {
      const s = parsed as Partial<EventSuggestion>;
      if (typeof s.title === 'string' && typeof s.description === 'string') {
        return {
          title: s.title,
          description: s.description,
          venueType: typeof s.venueType === 'string' ? s.venueType : '',
          promotionalTips: Array.isArray(s.promotionalTips) ? (s.promotionalTips as string[]) : [],
        };
      }
    }

    if (workflowType === 'task') {
      const s = parsed as Partial<TaskSuggestion>;
      if (typeof s.actionTitle === 'string') {
        return {
          actionTitle: s.actionTitle,
          dueDateRange: typeof s.dueDateRange === 'string' ? s.dueDateRange : '',
          owner: typeof s.owner === 'string' ? s.owner : '',
          dependencies: Array.isArray(s.dependencies) ? (s.dependencies as string[]) : [],
        };
      }
    }

    if (workflowType === 'rsvp') {
      const s = parsed as Partial<RsvpSuggestion>;
      if (typeof s.confirmationMessage === 'string') {
        return {
          confirmationMessage: s.confirmationMessage,
          reminderMessage: typeof s.reminderMessage === 'string' ? s.reminderMessage : '',
          capacityTip: typeof s.capacityTip === 'string' ? s.capacityTip : '',
        };
      }
    }

    return null;
  } catch {
    return null;
  }
}

// ── Controller ────────────────────────────────────────────────────────────────

/**
 * POST /api/ai/grounded
 *
 * Grounded workflow endpoint that fetches live application data (event, task list,
 * or RSVP statistics) before calling the AI model, so suggestions are anchored
 * to real planner context rather than prompt-only text.  Returns both a validated
 * structured JSON object and the raw model response for traceability.
 */
export async function getGroundedSuggestion(req: AuthRequest, res: Response): Promise<Response> {
  const { workflowType, entityId, prompt } = req.body as Partial<GroundedWorkflowBody>;

  if (!prompt?.trim()) {
    return res.status(400).json({ error: 'prompt is required.' });
  }

  const VALID_WORKFLOW_TYPES = new Set<WorkflowType>(['event', 'task', 'rsvp']);
  if (!workflowType || !VALID_WORKFLOW_TYPES.has(workflowType)) {
    return res.status(400).json({ error: 'workflowType must be one of: event, task, rsvp.' });
  }

  const parsedEntityId = typeof entityId === 'string' ? parseInt(entityId, 10) : entityId;
  if (
    !parsedEntityId ||
    typeof parsedEntityId !== 'number' ||
    !Number.isInteger(parsedEntityId) ||
    parsedEntityId <= 0
  ) {
    return res.status(400).json({ error: 'entityId must be a positive integer.' });
  }

  const userId = req.user?.id;
  if (userId !== undefined && !(await checkAiRateLimit(userId))) {
    return res
      .status(429)
      .json({ error: 'AI rate limit exceeded. You can make 20 AI requests per hour.' });
  }

  const provider = resolveAiProviderConfig();
  if (provider.kind === 'misconfigured') {
    return res.status(503).json({ error: provider.message });
  }
  if (provider.kind === 'none') {
    return res.status(503).json({
      error:
        'AI suggestions are not configured. Set Azure OpenAI (AZURE_OPENAI_ENDPOINT + AZURE_OPENAI_API_KEY + AZURE_OPENAI_DEPLOYMENT) or OPENAI_API_KEY.',
    });
  }

  // Fetch live application context to ground the AI request.
  let context: EventContext | TaskContext | RsvpContext | null = null;
  try {
    if (workflowType === 'event') context = await fetchEventContext(parsedEntityId);
    else if (workflowType === 'task') context = await fetchTaskContext(parsedEntityId);
    else context = await fetchRsvpContext(parsedEntityId);
  } catch {
    return res.status(500).json({ error: 'Failed to fetch workflow context.' });
  }

  if (!context) {
    return res.status(404).json({
      error: `Entity ${parsedEntityId} not found for workflow type '${workflowType}'.`,
    });
  }

  const systemPrompt = GROUNDED_SYSTEM_PROMPTS[workflowType];
  const userMessage = buildGroundedUserMessage(workflowType, context, sanitisePrompt(prompt));

  const startTime = Date.now();
  try {
    const raw = await callAiProvider(provider, systemPrompt, userMessage);
    const durationMs = Date.now() - startTime;

    void logAiRequest({
      userId,
      workflowType,
      entityId: parsedEntityId,
      provider: provider.kind,
      durationMs,
      status: 'success',
    });

    const structured = parseStructuredOutput(workflowType, raw);
    const response: GroundedSuggestionResponse = {
      workflowType,
      entityId: parsedEntityId,
      structured: structured ?? ({} as GroundedSuggestion),
      raw,
    };
    return res.json(response);
  } catch (err) {
    const durationMs = Date.now() - startTime;
    const message = err instanceof Error ? err.message : 'Unknown AI error';
    void logAiRequest({
      userId,
      workflowType,
      entityId: parsedEntityId,
      provider: provider.kind,
      durationMs,
      status: 'error',
      errorMessage: message,
    });
    return res.status(502).json({ error: `AI request failed: ${message}` });
  }
}
