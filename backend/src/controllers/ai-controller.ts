/**
 * AI Suggestions controller — prefers Azure OpenAI and falls back to OpenAI.
 * If neither provider is configured, returns a clear 503 response.
 *
 * Grounded Workflow Support (#947 / #949):
 * POST /api/ai/grounded fetches live event/task/RSVP data before calling the
 * model so suggestions are anchored to real planner context.  All AI requests
 * are logged to ai_request_logs for observability.  Structured JSON output is
 * validated and returned alongside the raw model response.
 *
 * Story #949 — Ground Event Assistant Responses in Live Event Data:
 * Extends the event context fetch to include normalized fields (event_type,
 * tags, end_date, event_time, location) and omits null/empty fields from the
 * prompt to reduce noise.  Adds contextSummary to the response for
 * traceability.  Fixes canonical_status usage for RSVP statistics queries.
 *
 * Story #952 — Add Budget Insight Assistance for Variance and Risk:
 * POST /api/ai/budget-insight fetches live budget categories and expenses for
 * an event, computes variance, overspend flags, spend totals, and threshold
 * state before calling the AI model.  Returns structured JSON containing at
 * least 3 actionable recommendations, a risk level, anomalies, and a summary.
 * Handles missing/partial budget data safely (empty categories, no expenses).
 *
 * Story #964 — Introduce Structured AI Output Schemas:
 * All parser functions now delegate to the shared `ai-schemas` module which
 * provides typed ParseResult<T> responses with actionable validation errors,
 * provider-safe JSON extraction, and reusable schema validators.  Backward-
 * compatible shim exports keep the existing `null`-on-failure contract for
 * the controller's public API surface while internally surfacing structured
 * validation errors for observability.
 *
 * Story #956 — AI Safety and Prompt Injection Controls:
 * All user-supplied prompt text is now processed by the shared `ai-safety`
 * module before being embedded in provider requests.  The module provides:
 * enhanced injection detection with per-category threat metadata; output safety
 * validation (sensitive data, excessive length); system-prompt hardening;
 * provider-request timeouts to prevent hung connections; and structured
 * safety-event logging to `ai_safety_events` for audit/observability.
 */
import { Request, Response } from 'express';
import https from 'https';
import { getDatabase } from '../db/database.js';
import {
  parseGroundedOutput,
  parseBudgetInsightOutput as parseBudgetInsightSchema,
  parseTaskBreakdownOutput as parseTaskBreakdownSchema,
  formatValidationErrors,
  type EventSuggestionSchema,
  type TaskSuggestionSchema,
  type RsvpSuggestionSchema,
} from '../lib/ai-schemas.js';
import {
  sanitiseInput,
  validateAiOutput,
  hardenSystemPrompt,
  withProviderTimeout,
  logAiSafetyEvent,
} from '../lib/ai-safety.js';

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

/**
 * Sanitise user-supplied text before including in prompts.
 *
 * Delegates to the `ai-safety` module which provides enhanced injection
 * detection with structured threat metadata and safety-event logging.
 * Returns the cleaned text for backward-compatible use by prompt builders.
 */
function sanitisePrompt(input: string, workflowType: string, userId?: number, entityId?: number | null): string {
  const result = sanitiseInput(input);
  if (result.injectionDetected) {
    void logAiSafetyEvent({
      userId,
      eventType: 'input_sanitised',
      workflowType,
      entityId: entityId ?? null,
      threatCategories: result.detectedCategories,
      detail: `Injection patterns detected (${result.substitutionCount} substitution(s)): ${result.detectedCategories.join(', ')}`,
    });
  }
  return result.text;
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
    const safePrompt = sanitisePrompt(prompt, ctx, userId);
    const raw = await withProviderTimeout(
      callAiProvider(provider, hardenSystemPrompt(SYSTEM_PROMPTS[ctx]), safePrompt),
    );
    const outputCheck = validateAiOutput(raw);
    if (!outputCheck.safe) {
      void logAiSafetyEvent({
        userId,
        eventType: 'output_rejected',
        workflowType: ctx,
        entityId: null,
        threatCategories: [],
        detail: `Output safety issues: ${outputCheck.issues.join('; ')}`,
      });
    }
    return res.json({ suggestion: outputCheck.text });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown AI error';
    if (message.includes('timed out')) {
      void logAiSafetyEvent({
        userId,
        eventType: 'provider_timeout',
        workflowType: ctx,
        entityId: null,
        threatCategories: [],
        detail: message,
      });
    }
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

// ── Structured output types (re-exported for backward compatibility) ──────────

/**
 * @deprecated Use `EventSuggestionSchema` from `../lib/ai-schemas` directly.
 * Kept here for backward compatibility with existing consumers.
 */
export type EventSuggestion = EventSuggestionSchema;

/**
 * @deprecated Use `TaskSuggestionSchema` from `../lib/ai-schemas` directly.
 * Kept here for backward compatibility with existing consumers.
 */
export type TaskSuggestion = TaskSuggestionSchema;

/**
 * @deprecated Use `RsvpSuggestionSchema` from `../lib/ai-schemas` directly.
 * Kept here for backward compatibility with existing consumers.
 */
export type RsvpSuggestion = RsvpSuggestionSchema;

export type GroundedSuggestion = EventSuggestion | TaskSuggestion | RsvpSuggestion;

interface GroundedSuggestionResponse {
  workflowType: WorkflowType;
  entityId: number;
  structured: GroundedSuggestion;
  raw: string;
  /** Traceability: lists the event context fields that were included in the
   *  grounded prompt so consumers can audit what data the model received.
   *  Present only for event workflow requests. */
  contextSummary?: { groundedFields: string[] };
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
  end_date: string | null;
  event_time: string | null;
  capacity: number | null;
  status: string;
  event_type: string | null;
  venue_name: string | null;
  tags: string | null;
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
    end_date: string | null;
    event_time: string | null;
    capacity: number | null;
    status: string;
    event_type: string | null;
    venue_name: string | null;
    tags: string | null;
  }>(
    `SELECT id, title, description, date, end_date, event_time, capacity, status,
            event_type, location AS venue_name, tags
     FROM events WHERE id = $1 AND deleted_at IS NULL`,
    [entityId],
  );
  if (!event) return null;

  // Use canonical_status for accurate confirmed RSVP counts (v21+ schema).
  const rsvpStats = await db.get<{ confirmed: number; total: number }>(
    `SELECT
       COUNT(*) FILTER (WHERE canonical_status = 'confirmed')::int AS confirmed,
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

  // Use canonical_status for accurate RSVP statistics (v21+ schema).
  const stats = await db.get<{
    confirmed: number;
    declined: number;
    pending: number;
    total: number;
  }>(
    `SELECT
       COUNT(*) FILTER (WHERE canonical_status = 'confirmed')::int AS confirmed,
       COUNT(*) FILTER (WHERE canonical_status = 'declined')::int AS declined,
       COUNT(*) FILTER (WHERE canonical_status = 'pending')::int AS pending,
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
  event: `You are a festival event planning AI assistant. You will receive details about a real event including its title, description, type, dates, location, capacity, tags, and current RSVP numbers.
Use ALL provided fields to tailor your response specifically to this event. Return ONLY a valid JSON object with this exact schema (no markdown, no explanation):
{"title":"improved title suggestion","description":"improved description","venueType":"ideal venue type","promotionalTips":["tip 1","tip 2","tip 3"]}`,
  task: `You are a task management AI for festival events. You will receive an event title and its current task list.
Suggest the next best task and return ONLY a valid JSON object (no markdown, no explanation):
{"actionTitle":"task title","dueDateRange":"suggested due date range","owner":"suggested role/person type","dependencies":["dep1","dep2"]}`,
  rsvp: `You are an RSVP management AI for festival events. You will receive attendance statistics for a real event.
Analyze and return ONLY a valid JSON object (no markdown, no explanation):
{"confirmationMessage":"suggested confirmation message","reminderMessage":"suggested reminder message","capacityTip":"capacity management tip"}`,
};

/**
 * Returns the set of event context field names that have non-null, non-empty
 * values.  Used for the contextSummary traceability field in the response.
 */
function resolvePopulatedEventFields(ctx: EventContext): string[] {
  const fields: string[] = ['title', 'status'];
  if (ctx.description) fields.push('description');
  if (ctx.event_type && ctx.event_type !== 'Other') fields.push('event_type');
  if (ctx.date) fields.push('date');
  if (ctx.end_date) fields.push('end_date');
  if (ctx.event_time) fields.push('event_time');
  if (ctx.venue_name) fields.push('location');
  if (ctx.capacity !== null) fields.push('capacity');
  if (ctx.tags) fields.push('tags');
  if (ctx.totalRsvps > 0) fields.push('rsvp_stats');
  return fields;
}

function buildGroundedUserMessage(
  workflowType: WorkflowType,
  context: EventContext | TaskContext | RsvpContext,
  userPrompt: string,
): string {
  switch (workflowType) {
    case 'event': {
      const ctx = context as EventContext;
      // Only include fields with real values to avoid injecting noise.
      const lines: string[] = ['Event details:'];
      lines.push(`Title: ${ctx.title}`);
      if (ctx.event_type && ctx.event_type !== 'Other') {
        lines.push(`Type: ${ctx.event_type}`);
      }
      if (ctx.description) lines.push(`Description: ${ctx.description}`);
      if (ctx.date) {
        const dateRange = ctx.end_date ? `${ctx.date} – ${ctx.end_date}` : ctx.date;
        lines.push(`Date: ${dateRange}`);
      }
      if (ctx.event_time) lines.push(`Time: ${ctx.event_time}`);
      if (ctx.venue_name) lines.push(`Location: ${ctx.venue_name}`);
      if (ctx.capacity !== null) lines.push(`Capacity: ${ctx.capacity}`);
      if (ctx.tags) lines.push(`Tags: ${ctx.tags}`);
      lines.push(`Status: ${ctx.status}`);
      lines.push(`RSVPs: ${ctx.confirmedRsvps} confirmed / ${ctx.totalRsvps} total`);
      lines.push('');
      lines.push(`User request: ${userPrompt}`);
      return lines.join('\n');
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

/**
 * Parse raw AI model output into a typed `GroundedSuggestion`.
 *
 * Delegates to the shared `ai-schemas` module for runtime validation with
 * actionable error details.  Returns `null` on failure to maintain backward
 * compatibility with existing consumers; validation errors are emitted to the
 * logger for observability.
 *
 * @deprecated Prefer `parseGroundedOutput` from `../lib/ai-schemas` directly
 * to access the full `ParseResult<T>` with structured validation errors.
 */
export function parseStructuredOutput(
  workflowType: WorkflowType,
  raw: string,
): GroundedSuggestion | null {
  const result = parseGroundedOutput(workflowType, raw);
  if (result.ok) return result.data;

  // Emit validation errors for observability without blocking the call.
  const errorSummary = formatValidationErrors(result.errors);
  console.warn(
    `[ai-schemas] parseStructuredOutput validation failed for '${workflowType}': ${errorSummary}`,
  );
  return null;
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

  const systemPrompt = hardenSystemPrompt(GROUNDED_SYSTEM_PROMPTS[workflowType]);
  const userMessage = buildGroundedUserMessage(
    workflowType,
    context,
    sanitisePrompt(prompt, workflowType, userId, parsedEntityId),
  );

  const startTime = Date.now();
  try {
    const raw = await withProviderTimeout(callAiProvider(provider, systemPrompt, userMessage));
    const durationMs = Date.now() - startTime;

    void logAiRequest({
      userId,
      workflowType,
      entityId: parsedEntityId,
      provider: provider.kind,
      durationMs,
      status: 'success',
    });

    const outputCheck = validateAiOutput(raw);
    if (!outputCheck.safe) {
      void logAiSafetyEvent({
        userId,
        eventType: 'output_rejected',
        workflowType,
        entityId: parsedEntityId,
        threatCategories: [],
        detail: `Output safety issues: ${outputCheck.issues.join('; ')}`,
      });
    }

    const structured = parseStructuredOutput(workflowType, outputCheck.text);
    const response: GroundedSuggestionResponse = {
      workflowType,
      entityId: parsedEntityId,
      structured: structured ?? ({} as GroundedSuggestion),
      raw: outputCheck.text,
      // Traceability: include the event fields that were grounded into the prompt.
      ...(workflowType === 'event' && {
        contextSummary: { groundedFields: resolvePopulatedEventFields(context as EventContext) },
      }),
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
    if (message.includes('timed out')) {
      void logAiSafetyEvent({
        userId,
        eventType: 'provider_timeout',
        workflowType,
        entityId: parsedEntityId,
        threatCategories: [],
        detail: message,
      });
    }
    return res.status(502).json({ error: `AI request failed: ${message}` });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Task Breakdown — Story #950
// Generate task breakdowns from event context with timeline constraints,
// dependency hints, priority, and owner suggestions.
// ─────────────────────────────────────────────────────────────────────────────

/** A single task item in an AI-generated task breakdown. */
export interface TaskBreakdownItem {
  title: string;
  owner: string;
  dueWindow: string;
  dependencies: string[];
  priority: 'low' | 'medium' | 'high' | 'urgent';
  timelineConstraint: string;
}

/** Full task breakdown response returned by POST /api/ai/task-breakdown. */
export interface TaskBreakdownResponse {
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

interface TaskBreakdownContext {
  eventId: number;
  eventTitle: string;
  eventDate: string | null;
  endDate: string | null;
  eventTime: string | null;
  eventType: string | null;
  status: string;
  capacity: number | null;
  tags: string | null;
  existingTasks: Array<{ title: string; status: string; due_date: string | null }>;
}

interface TaskBreakdownBody {
  eventId: number;
  prompt?: string;
}

async function fetchTaskBreakdownContext(eventId: number): Promise<TaskBreakdownContext | null> {
  const db = getDatabase();
  const event = await db.get<{
    id: number;
    title: string;
    date: string | null;
    end_date: string | null;
    event_time: string | null;
    event_type: string | null;
    status: string;
    capacity: number | null;
    tags: string | null;
  }>(
    `SELECT id, title, date, end_date, event_time, event_type, status, capacity, tags
     FROM events WHERE id = $1 AND deleted_at IS NULL`,
    [eventId],
  );
  if (!event) return null;

  const tasks = await db.all<{ title: string; status: string; due_date: string | null }>(
    `SELECT title, status, due_date
     FROM tasks WHERE event_id = $1 ORDER BY created_at DESC LIMIT 30`,
    [eventId],
  );

  return {
    eventId: event.id,
    eventTitle: event.title,
    eventDate: event.date,
    endDate: event.end_date,
    eventTime: event.event_time,
    eventType: event.event_type,
    status: event.status,
    capacity: event.capacity,
    tags: event.tags,
    existingTasks: tasks,
  };
}

function resolveTaskBreakdownGroundedFields(ctx: TaskBreakdownContext): string[] {
  const fields: string[] = ['eventTitle', 'status'];
  if (ctx.eventType) fields.push('eventType');
  if (ctx.eventDate) fields.push('eventDate');
  if (ctx.endDate) fields.push('endDate');
  if (ctx.eventTime) fields.push('eventTime');
  if (ctx.capacity !== null) fields.push('capacity');
  if (ctx.tags) fields.push('tags');
  if (ctx.existingTasks.length > 0) fields.push('existingTasks');
  return fields;
}

const TASK_BREAKDOWN_SYSTEM_PROMPT = `You are a festival event planning AI specializing in task management and project planning.
You will receive event details (title, type, dates, capacity, status, tags) and the current task list.
Generate a comprehensive task breakdown for the organizer. Return ONLY a valid JSON array of up to 8 tasks (no markdown, no explanation):
[{"title":"task title","owner":"suggested role or person type","dueWindow":"e.g. 6-8 weeks before event","dependencies":["existing or prior task name"],"priority":"high","timelineConstraint":"must be completed before venue booking"},...]
Rules:
- priority must be one of: low, medium, high, urgent
- dueWindow must reference the event date when known (e.g. "4 weeks before event" or a date range like "2026-07-01 to 2026-07-07")
- timelineConstraint must explain the scheduling rationale
- dependencies must reference either existing tasks or other generated tasks by title
- owner should be a role or person type (e.g. "Event coordinator", "AV team", "Marketing lead")`;

function buildTaskBreakdownUserMessage(ctx: TaskBreakdownContext, userPrompt: string): string {
  const lines: string[] = ['Event details:'];
  lines.push(`Title: ${ctx.eventTitle}`);
  if (ctx.eventType) lines.push(`Type: ${ctx.eventType}`);
  lines.push(`Status: ${ctx.status}`);
  if (ctx.eventDate) {
    const dateRange = ctx.endDate ? `${ctx.eventDate} – ${ctx.endDate}` : ctx.eventDate;
    lines.push(`Date: ${dateRange}`);
  }
  if (ctx.eventTime) lines.push(`Time: ${ctx.eventTime}`);
  if (ctx.capacity !== null) lines.push(`Capacity: ${ctx.capacity}`);
  if (ctx.tags) lines.push(`Tags: ${ctx.tags}`);

  lines.push('');
  if (ctx.existingTasks.length > 0) {
    lines.push('Existing tasks:');
    for (const t of ctx.existingTasks) {
      const due = t.due_date ? ` (due: ${t.due_date})` : '';
      lines.push(`- [${t.status}] ${t.title}${due}`);
    }
  } else {
    lines.push('Existing tasks: none');
  }

  lines.push('');
  lines.push(`User request: ${userPrompt}`);
  return lines.join('\n');
}

/**
 * Parse raw AI model output into an array of TaskBreakdownItem objects.
 *
 * Delegates to the shared `ai-schemas` module for runtime validation with
 * actionable error details.  Returns `null` on failure to maintain backward
 * compatibility with existing consumers; validation errors are emitted to the
 * logger for observability.
 *
 * @deprecated Prefer `parseTaskBreakdownOutput` from `../lib/ai-schemas` directly
 * to access the full `ParseResult<TaskBreakdownItemSchema[]>` with errors.
 */
export function parseTaskBreakdownOutput(raw: string): TaskBreakdownItem[] | null {
  const result = parseTaskBreakdownSchema(raw);
  if (result.ok) return result.data;

  const errorSummary = formatValidationErrors(result.errors);
  console.warn(`[ai-schemas] parseTaskBreakdownOutput validation failed: ${errorSummary}`);
  return null;
}

/**
 * POST /api/ai/task-breakdown
 *
 * Generates a structured task breakdown grounded in live event context.
 * Fetches event details (title, type, dates, capacity, tags) and the current
 * task list before calling the AI model.  Returns a JSON array of TaskBreakdownItem
 * objects — each with title, owner suggestion, due-window, dependency hints,
 * priority, and timeline constraints — alongside the raw model response and
 * a contextSummary for traceability.  Users can copy or manually apply the
 * generated tasks.
 */
export async function getTaskBreakdown(req: AuthRequest, res: Response): Promise<Response> {
  const { eventId, prompt } = req.body as Partial<TaskBreakdownBody>;

  const effectivePrompt =
    prompt?.trim() || 'Generate a comprehensive task breakdown for this event.';

  const parsedEventId = typeof eventId === 'string' ? parseInt(eventId, 10) : eventId;
  if (
    !parsedEventId ||
    typeof parsedEventId !== 'number' ||
    !Number.isInteger(parsedEventId) ||
    parsedEventId <= 0
  ) {
    return res.status(400).json({ error: 'eventId must be a positive integer.' });
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

  let context: TaskBreakdownContext | null = null;
  try {
    context = await fetchTaskBreakdownContext(parsedEventId);
  } catch {
    return res.status(500).json({ error: 'Failed to fetch event context.' });
  }

  if (!context) {
    return res.status(404).json({ error: `Event ${parsedEventId} not found.` });
  }

  const userMessage = buildTaskBreakdownUserMessage(
    context,
    sanitisePrompt(effectivePrompt, 'task-breakdown', userId, parsedEventId),
  );

  const startTime = Date.now();
  try {
    const raw = await withProviderTimeout(
      callAiProvider(provider, hardenSystemPrompt(TASK_BREAKDOWN_SYSTEM_PROMPT), userMessage),
    );
    const durationMs = Date.now() - startTime;

    void logAiRequest({
      userId,
      workflowType: 'task-breakdown',
      entityId: parsedEventId,
      provider: provider.kind,
      durationMs,
      status: 'success',
    });

    const outputCheck = validateAiOutput(raw);
    if (!outputCheck.safe) {
      void logAiSafetyEvent({
        userId,
        eventType: 'output_rejected',
        workflowType: 'task-breakdown',
        entityId: parsedEventId,
        threatCategories: [],
        detail: `Output safety issues: ${outputCheck.issues.join('; ')}`,
      });
    }

    const tasks = parseTaskBreakdownOutput(outputCheck.text) ?? [];
    const response: TaskBreakdownResponse = {
      workflowType: 'task-breakdown',
      eventId: parsedEventId,
      eventTitle: context.eventTitle,
      tasks,
      raw: outputCheck.text,
      contextSummary: {
        groundedFields: resolveTaskBreakdownGroundedFields(context),
        totalExistingTasks: context.existingTasks.length,
      },
    };
    return res.json(response);
  } catch (err) {
    const durationMs = Date.now() - startTime;
    const message = err instanceof Error ? err.message : 'Unknown AI error';
    void logAiRequest({
      userId,
      workflowType: 'task-breakdown',
      entityId: parsedEventId,
      provider: provider.kind,
      durationMs,
      status: 'error',
      errorMessage: message,
    });
    if (message.includes('timed out')) {
      void logAiSafetyEvent({
        userId,
        eventType: 'provider_timeout',
        workflowType: 'task-breakdown',
        entityId: parsedEventId,
        threatCategories: [],
        detail: message,
      });
    }
    return res.status(502).json({ error: `AI request failed: ${message}` });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Budget Insight Assistance — Story #952
// Analyse live budget categories and expenses for an event, compute variance
// and overspend flags, then call the AI model with full financial context to
// produce structured, actionable budget insight recommendations.
// ─────────────────────────────────────────────────────────────────────────────

/** One category's financial snapshot used to build the AI prompt. */
export interface BudgetCategorySnapshot {
  name: string;
  allocated: number;
  spent: number;
  variance: number; // allocated - spent  (negative = overspend)
  variancePct: number; // variance / allocated * 100  (NaN when allocated = 0)
  isOverspent: boolean;
  expenseCount: number;
}

/** A single actionable budget recommendation returned by the AI. */
export interface BudgetRecommendation {
  category: string;
  insight: string;
  action: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
}

/** Full structured response from POST /api/ai/budget-insight. */
export interface BudgetInsightResponse {
  workflowType: 'budget-insight';
  eventId: number;
  eventTitle: string;
  summary: string;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  totalAllocated: number;
  totalSpent: number;
  totalVariance: number;
  overspentCategories: string[];
  anomalies: string[];
  recommendations: BudgetRecommendation[];
  raw: string;
  contextSummary: {
    groundedFields: string[];
    categoryCount: number;
    expenseCount: number;
  };
}

interface BudgetInsightContext {
  eventId: number;
  eventTitle: string;
  eventDate: string | null;
  eventStatus: string;
  categories: BudgetCategorySnapshot[];
  totalAllocated: number;
  totalSpent: number;
  totalVariance: number;
  overspentCategories: string[];
  expenseCount: number;
}

interface BudgetInsightBody {
  eventId: number;
  prompt?: string;
}

async function fetchBudgetInsightContext(eventId: number): Promise<BudgetInsightContext | null> {
  const db = getDatabase();

  const event = await db.get<{ id: number; title: string; date: string | null; status: string }>(
    `SELECT id, title, date, status FROM events WHERE id = $1 AND deleted_at IS NULL`,
    [eventId],
  );
  if (!event) return null;

  // Fetch budget categories with their allocated amounts.
  const categories = await db.all<{
    id: number;
    name: string;
    allocated_amount: number;
  }>(
    `SELECT id, name, COALESCE(allocated_amount, 0) AS allocated_amount
     FROM budget_categories
     WHERE event_id = $1
     ORDER BY name`,
    [eventId],
  );

  // Fetch approved/pending expense totals per category (exclude rejected).
  const expenseTotals = await db.all<{
    category_id: number | null;
    total_spent: number;
    expense_count: number;
  }>(
    `SELECT category_id,
            COALESCE(SUM(amount), 0)::numeric AS total_spent,
            COUNT(*)::int AS expense_count
     FROM expenses
     WHERE event_id = $1
       AND approval_status IN ('approved', 'pending')
     GROUP BY category_id`,
    [eventId],
  );

  const spendByCategory = new Map<number | null, { spent: number; count: number }>();
  for (const row of expenseTotals) {
    spendByCategory.set(row.category_id, {
      spent: Number(row.total_spent),
      count: row.expense_count,
    });
  }

  // Uncategorised expenses (category_id IS NULL)
  const uncategorised = spendByCategory.get(null);

  const snapshots: BudgetCategorySnapshot[] = categories.map((cat) => {
    const spend = spendByCategory.get(cat.id) ?? { spent: 0, count: 0 };
    const allocated = Number(cat.allocated_amount);
    const spent = spend.spent;
    const variance = allocated - spent;
    const variancePct = allocated !== 0 ? (variance / allocated) * 100 : NaN;
    return {
      name: cat.name,
      allocated,
      spent,
      variance,
      variancePct,
      isOverspent: spent > allocated,
      expenseCount: spend.count,
    };
  });

  // Add a synthetic "Uncategorised" entry when uncategorised spend exists.
  if (uncategorised && uncategorised.spent > 0) {
    snapshots.push({
      name: 'Uncategorised',
      allocated: 0,
      spent: uncategorised.spent,
      variance: -uncategorised.spent,
      variancePct: NaN,
      isOverspent: true,
      expenseCount: uncategorised.count,
    });
  }

  const totalAllocated = snapshots.reduce((s, c) => s + c.allocated, 0);
  const totalSpent = snapshots.reduce((s, c) => s + c.spent, 0);
  const totalVariance = totalAllocated - totalSpent;
  const overspentCategories = snapshots.filter((c) => c.isOverspent).map((c) => c.name);
  const expenseCount = snapshots.reduce((s, c) => s + c.expenseCount, 0);

  return {
    eventId: event.id,
    eventTitle: event.title,
    eventDate: event.date,
    eventStatus: event.status,
    categories: snapshots,
    totalAllocated,
    totalSpent,
    totalVariance,
    overspentCategories,
    expenseCount,
  };
}

function resolveBudgetGroundedFields(ctx: BudgetInsightContext): string[] {
  const fields: string[] = ['eventTitle', 'eventStatus'];
  if (ctx.eventDate) fields.push('eventDate');
  if (ctx.categories.length > 0) fields.push('budgetCategories');
  if (ctx.expenseCount > 0) fields.push('expenses');
  if (ctx.overspentCategories.length > 0) fields.push('overspendFlags');
  if (ctx.totalAllocated > 0) fields.push('totalAllocated');
  if (ctx.totalSpent > 0) fields.push('totalSpent');
  return fields;
}

const BUDGET_INSIGHT_SYSTEM_PROMPT = `You are a financial risk analyst AI for festival event management.
You will receive live budget data for an event: category allocations, actual spend, variance figures, and overspend flags.
Analyse the data and return ONLY a valid JSON object (no markdown, no explanation):
{
  "summary": "2-3 sentence overall budget health summary",
  "riskLevel": "low|medium|high|critical",
  "anomalies": ["anomaly 1", "anomaly 2"],
  "recommendations": [
    {"category":"category name or Overall","insight":"what the data shows","action":"specific action to take","priority":"low|medium|high|critical"},
    ...at least 3 recommendations...
  ]
}
Rules:
- riskLevel must be one of: low, medium, high, critical
- priority must be one of: low, medium, high, critical
- Include at least 3 recommendations. When categories are overspent or at risk, provide category-specific recommendations.
- anomalies should flag unusual patterns: sudden large expenses, zero allocation with spend, categories >90% spent, etc.
- When budget data is empty or partial, still return valid JSON with recommendations about setting up budgets.`;

function buildBudgetInsightUserMessage(ctx: BudgetInsightContext, userPrompt: string): string {
  const lines: string[] = ['Event budget data:'];
  lines.push(`Event: ${ctx.eventTitle}`);
  lines.push(`Status: ${ctx.eventStatus}`);
  if (ctx.eventDate) lines.push(`Date: ${ctx.eventDate}`);
  lines.push(`Total Allocated: $${ctx.totalAllocated.toFixed(2)}`);
  lines.push(`Total Spent: $${ctx.totalSpent.toFixed(2)}`);
  lines.push(
    `Total Variance: $${ctx.totalVariance.toFixed(2)} (${ctx.totalVariance >= 0 ? 'under budget' : 'OVER BUDGET'})`,
  );

  if (ctx.categories.length > 0) {
    lines.push('');
    lines.push('Category breakdown:');
    for (const cat of ctx.categories) {
      const pct = !isNaN(cat.variancePct)
        ? ` (${cat.variancePct >= 0 ? '' : '-'}${Math.abs(cat.variancePct).toFixed(1)}% variance)`
        : '';
      const flag = cat.isOverspent ? ' ⚠ OVERSPENT' : '';
      lines.push(
        `- ${cat.name}: allocated $${cat.allocated.toFixed(2)}, spent $${cat.spent.toFixed(2)}, variance $${cat.variance.toFixed(2)}${pct}${flag}`,
      );
    }
  } else {
    lines.push('');
    lines.push('No budget categories defined yet.');
  }

  if (ctx.overspentCategories.length > 0) {
    lines.push('');
    lines.push(`Overspent categories: ${ctx.overspentCategories.join(', ')}`);
  }

  lines.push('');
  lines.push(`User request: ${userPrompt}`);
  return lines.join('\n');
}

/**
 * Parse raw AI model output into a structured BudgetInsightResponse payload.
 *
 * Delegates to the shared `ai-schemas` module for runtime validation with
 * actionable error details.  Returns `null` on failure to maintain backward
 * compatibility with existing consumers; validation errors are emitted to the
 * logger for observability.
 *
 * @deprecated Prefer `parseBudgetInsightOutput` from `../lib/ai-schemas` directly
 * to access the full `ParseResult<BudgetInsightOutputSchema>` with errors.
 */
export function parseBudgetInsightOutput(raw: string): {
  summary: string;
  riskLevel: BudgetInsightResponse['riskLevel'];
  anomalies: string[];
  recommendations: BudgetRecommendation[];
} | null {
  const result = parseBudgetInsightSchema(raw);
  if (result.ok) return result.data;

  const errorSummary = formatValidationErrors(result.errors);
  console.warn(`[ai-schemas] parseBudgetInsightOutput validation failed: ${errorSummary}`);
  return null;
}

/**
 * POST /api/ai/budget-insight
 *
 * Fetches live budget categories and expense totals for an event, computes
 * variance, overspend flags, and spend ratios, then calls the AI model to
 * produce structured budget insights.  Returns a BudgetInsightResponse with:
 * - overall summary and risk level
 * - at least 3 actionable category-level recommendations
 * - detected anomalies (large spikes, zero-allocation spend, near-threshold categories)
 * - raw model output for traceability
 * Handles missing/partial budget data safely (empty categories, no expenses).
 */
export async function getBudgetInsight(req: AuthRequest, res: Response): Promise<Response> {
  const { eventId, prompt } = req.body as Partial<BudgetInsightBody>;

  const effectivePrompt =
    prompt?.trim() || 'Analyse the budget for this event and provide risk and variance insights.';

  const parsedEventId = typeof eventId === 'string' ? parseInt(eventId, 10) : eventId;
  if (
    !parsedEventId ||
    typeof parsedEventId !== 'number' ||
    !Number.isInteger(parsedEventId) ||
    parsedEventId <= 0
  ) {
    return res.status(400).json({ error: 'eventId must be a positive integer.' });
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

  let context: BudgetInsightContext | null = null;
  try {
    context = await fetchBudgetInsightContext(parsedEventId);
  } catch {
    return res.status(500).json({ error: 'Failed to fetch budget context.' });
  }

  if (!context) {
    return res.status(404).json({ error: `Event ${parsedEventId} not found.` });
  }

  const userMessage = buildBudgetInsightUserMessage(
    context,
    sanitisePrompt(effectivePrompt, 'budget_insight', userId, parsedEventId),
  );

  const startTime = Date.now();
  try {
    const raw = await withProviderTimeout(
      callAiProvider(provider, hardenSystemPrompt(BUDGET_INSIGHT_SYSTEM_PROMPT), userMessage),
    );
    const durationMs = Date.now() - startTime;

    void logAiRequest({
      userId,
      workflowType: 'budget_insight',
      entityId: parsedEventId,
      provider: provider.kind,
      durationMs,
      status: 'success',
    });

    const outputCheck = validateAiOutput(raw);
    if (!outputCheck.safe) {
      void logAiSafetyEvent({
        userId,
        eventType: 'output_rejected',
        workflowType: 'budget_insight',
        entityId: parsedEventId,
        threatCategories: [],
        detail: `Output safety issues: ${outputCheck.issues.join('; ')}`,
      });
    }

    const parsed = parseBudgetInsightOutput(outputCheck.text);

    const response: BudgetInsightResponse = {
      workflowType: 'budget-insight',
      eventId: parsedEventId,
      eventTitle: context.eventTitle,
      summary: parsed?.summary ?? '',
      riskLevel: parsed?.riskLevel ?? 'medium',
      totalAllocated: context.totalAllocated,
      totalSpent: context.totalSpent,
      totalVariance: context.totalVariance,
      overspentCategories: context.overspentCategories,
      anomalies: parsed?.anomalies ?? [],
      recommendations: parsed?.recommendations ?? [],
      raw: outputCheck.text,
      contextSummary: {
        groundedFields: resolveBudgetGroundedFields(context),
        categoryCount: context.categories.length,
        expenseCount: context.expenseCount,
      },
    };
    return res.json(response);
  } catch (err) {
    const durationMs = Date.now() - startTime;
    const message = err instanceof Error ? err.message : 'Unknown AI error';
    void logAiRequest({
      userId,
      workflowType: 'budget_insight',
      entityId: parsedEventId,
      provider: provider.kind,
      durationMs,
      status: 'error',
      errorMessage: message,
    });
    if (message.includes('timed out')) {
      void logAiSafetyEvent({
        userId,
        eventType: 'provider_timeout',
        workflowType: 'budget_insight',
        entityId: parsedEventId,
        threatCategories: [],
        detail: message,
      });
    }
    return res.status(502).json({ error: `AI request failed: ${message}` });
  }
}
