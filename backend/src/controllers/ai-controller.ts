/**
 * AI Suggestions controller — supports Azure OpenAI and OpenAI via REST API.
 * Configure one provider through environment variables; if unset, the endpoint
 * returns a graceful configuration error and the app remains functional.
 */
import { Request, Response } from 'express';
import https from 'https';
import { getDatabase } from '../db/database.js';

const OPENAI_API_KEY = process.env.OPENAI_API_KEY ?? '';
const OPENAI_MODEL = process.env.OPENAI_MODEL ?? 'gpt-4o-mini';

const AZURE_OPENAI_ENDPOINT = process.env.AZURE_OPENAI_ENDPOINT ?? process.env.ENDPOINT ?? '';
const AZURE_OPENAI_API_KEY = process.env.AZURE_OPENAI_API_KEY ?? process.env.API_KEY ?? '';
const AZURE_OPENAI_DEPLOYMENT = process.env.AZURE_OPENAI_DEPLOYMENT ?? OPENAI_MODEL;
const AZURE_OPENAI_API_VERSION = process.env.AZURE_OPENAI_API_VERSION ?? '2024-02-15-preview';

interface SuggestBody {
  context: 'event' | 'task' | 'rsvp' | 'general';
  prompt: string;
}

interface AiProviderConfig {
  hostname: string;
  path: string;
  headers: Record<string, string | number>;
  providerLabel: 'Azure OpenAI' | 'OpenAI';
}

function normaliseEndpoint(endpoint: string): string {
  if (!endpoint.trim()) return '';
  const withProtocol = /^https?:\/\//i.test(endpoint) ? endpoint : `https://${endpoint}`;
  return withProtocol.replace(/\/+$/, '');
}

function getAiProviderConfig(): AiProviderConfig | null {
  if (AZURE_OPENAI_ENDPOINT && AZURE_OPENAI_API_KEY) {
    const endpoint = normaliseEndpoint(AZURE_OPENAI_ENDPOINT);
    const url = new URL(endpoint);
    return {
      hostname: url.host,
      path: `${url.pathname.replace(/\/$/, '')}/openai/deployments/${encodeURIComponent(AZURE_OPENAI_DEPLOYMENT)}/chat/completions?api-version=${encodeURIComponent(AZURE_OPENAI_API_VERSION)}`,
      headers: {
        'api-key': AZURE_OPENAI_API_KEY,
      },
      providerLabel: 'Azure OpenAI',
    };
  }

  if (OPENAI_API_KEY) {
    return {
      hostname: 'api.openai.com',
      path: '/v1/chat/completions',
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      providerLabel: 'OpenAI',
    };
  }

  return null;
}

function callLlm(
  systemPrompt: string,
  userMessage: string,
  config: AiProviderConfig,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      model: OPENAI_MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
      max_tokens: 400,
      temperature: 0.7,
    });

    const req = https.request(
      {
        hostname: config.hostname,
        path: config.path,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...config.headers,
          'Content-Length': Buffer.byteLength(body),
        },
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
              reject(new Error(parsed.error.message ?? `${config.providerLabel} error`));
            } else {
              resolve(parsed.choices?.[0]?.message?.content?.trim() ?? '');
            }
          } catch {
            reject(new Error(`Failed to parse ${config.providerLabel} response`));
          }
        });
      },
    );

    req.on('error', reject);
    req.write(body);
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

  const providerConfig = getAiProviderConfig();
  if (!providerConfig) {
    return res.status(503).json({
      error:
        'AI suggestions are not configured. Set Azure OpenAI (AZURE_OPENAI_ENDPOINT + AZURE_OPENAI_API_KEY) or OPENAI_API_KEY in your .env file.',
    });
  }

  try {
    const suggestion = await callLlm(SYSTEM_PROMPTS[ctx], sanitisePrompt(prompt), providerConfig);
    return res.json({ suggestion });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown AI error';
    return res.status(502).json({ error: `AI request failed: ${message}` });
  }
}
