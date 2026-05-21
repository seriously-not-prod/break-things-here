/**
 * AI Suggestions controller — prefers Azure OpenAI and falls back to OpenAI.
 * If neither provider is configured, returns a clear 503 response.
 */
import { Request, Response } from 'express';
import https from 'https';
import { getDatabase } from '../db/database.js';

const AZURE_OPENAI_ENDPOINT = process.env.AZURE_OPENAI_ENDPOINT ?? process.env.ENDPOINT ?? '';
const AZURE_OPENAI_API_KEY = process.env.AZURE_OPENAI_API_KEY ?? process.env.API_KEY ?? '';
const AZURE_OPENAI_DEPLOYMENT = process.env.AZURE_OPENAI_DEPLOYMENT ?? 'gpt-4o-mini';
const AZURE_OPENAI_API_VERSION = process.env.AZURE_OPENAI_API_VERSION ?? '2024-02-15-preview';

const OPENAI_API_KEY = process.env.OPENAI_API_KEY ?? '';
const OPENAI_MODEL = process.env.OPENAI_MODEL ?? 'gpt-4o-mini';

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
  const hasAnyAzureConfig = Boolean(
    AZURE_OPENAI_ENDPOINT ||
    AZURE_OPENAI_API_KEY ||
    process.env.AZURE_OPENAI_ENDPOINT ||
    process.env.AZURE_OPENAI_API_KEY ||
    process.env.ENDPOINT ||
    process.env.API_KEY,
  );

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
