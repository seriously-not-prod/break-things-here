/**
 * Tests: AI Analytics Narrative Summaries — Story #955
 *
 * Covers:
 * - Input validation (missing eventId, zero/negative/non-integer eventId,
 *   invalid windowDays, prompt length limit)
 * - Provider configuration errors (503 none, 503 partial Azure)
 * - Entity not found (404)
 * - Successful narrative generation (structured response, trend direction,
 *   notable changes, suggested actions, context summary)
 * - Sparse data scenario (dataQuality forced to 'sparse')
 * - Prior period grounding (priorPeriodGrounded: true vs false)
 * - AI provider failure (502)
 * - parseAnalyticsNarrativeOutput unit tests (valid JSON, markdown fences,
 *   missing required fields, invalid enum values, array truncation)
 */

import { EventEmitter } from 'node:events';
import https from 'https';
import type { Request, Response } from 'express';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ── Shared test helpers ────────────────────────────────────────────────────────

interface MockResponse {
  statusCode: number;
  body: unknown;
}

function makeReq(
  body: Record<string, unknown>,
  user?: { id: number; email: string; role_id: number },
): Request {
  return { body, user } as unknown as Request;
}

function makeRes(): Response & MockResponse {
  const res = {
    statusCode: 200,
    body: null as unknown,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      return this;
    },
  };
  return res as unknown as Response & MockResponse;
}

interface CapturedRequest {
  hostname?: string;
  path?: string;
  headers?: Record<string, string | number>;
  body: string;
}

function mockHttpsJsonReply(payload: unknown): {
  captured: CapturedRequest;
  restore: () => void;
} {
  const captured: CapturedRequest = { body: '' };
  const spy = vi.spyOn(https, 'request').mockImplementation((options, callback) => {
    captured.hostname = options.hostname;
    captured.path = options.path;
    captured.headers = options.headers as Record<string, string | number>;

    const req = new EventEmitter() as EventEmitter & {
      write: (chunk: string) => void;
      end: () => void;
    };
    req.write = (chunk: string) => {
      captured.body += chunk;
    };
    req.end = () => {
      const resEmitter = new EventEmitter();
      callback(resEmitter as never);
      resEmitter.emit('data', Buffer.from(JSON.stringify(payload), 'utf8'));
      resEmitter.emit('end');
    };
    return req as never;
  });

  return { captured, restore: () => spy.mockRestore() };
}

function clearAiEnv(): void {
  delete process.env.AZURE_OPENAI_ENDPOINT;
  delete process.env.ENDPOINT;
  delete process.env.AZURE_OPENAI_API_KEY;
  delete process.env.API_KEY;
  delete process.env.AZURE_OPENAI_DEPLOYMENT;
  delete process.env.AZURE_OPENAI_API_VERSION;
  delete process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_MODEL;
}

async function loadController() {
  vi.resetModules();
  return import('../src/controllers/ai-controller.js');
}

// ── Database mock ──────────────────────────────────────────────────────────────

const mockDb = {
  get: vi.fn(),
  all: vi.fn(),
  run: vi.fn(),
};

vi.mock('../src/db/database.js', () => ({
  getDatabase: () => mockDb,
}));

// ── Helpers for standard DB mock sequences ─────────────────────────────────────

/**
 * Sets up mock DB responses for a successful analytics narrative fetch:
 * 1. rate-limit check → within budget
 * 2. event lookup → found
 * 3. current RSVP stats
 * 4. current task stats
 * 5. current budget stats
 * 6. prior RSVP stats
 * 7. prior task stats
 * 8. prior budget stats
 */
function mockSuccessfulDbCalls(
  opts: {
    priorTotal?: number;
    priorTasksTotal?: number;
    priorAllocated?: number;
  } = {},
): void {
  const { priorTotal = 30, priorTasksTotal = 8, priorAllocated = 5000 } = opts;

  mockDb.get
    .mockResolvedValueOnce({ count: 1 }) // rate limit within budget
    .mockResolvedValueOnce({ title: 'Summer Festival', status: 'Active' }) // event lookup
    .mockResolvedValueOnce({ confirmed: 45, total: 60 }) // current RSVP
    .mockResolvedValueOnce({ complete: 12, total: 20 }) // current tasks
    .mockResolvedValueOnce({ allocated: '8000', spent: '6000' }) // current budget
    .mockResolvedValueOnce({ confirmed: 30, total: priorTotal }) // prior RSVP
    .mockResolvedValueOnce({ complete: 8, total: priorTasksTotal }) // prior tasks
    .mockResolvedValueOnce({ allocated: String(priorAllocated), spent: '4000' }); // prior budget
}

// ── Setup / teardown ───────────────────────────────────────────────────────────

beforeEach(() => {
  mockDb.get.mockReset();
  mockDb.all.mockReset();
  mockDb.run.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
  clearAiEnv();
});

// ── Validation tests ───────────────────────────────────────────────────────────

describe('getAnalyticsNarrative — input validation', () => {
  it('returns 400 when eventId is missing', async () => {
    const { getAnalyticsNarrative } = await loadController();
    const req = makeReq({});
    const res = makeRes();

    await getAnalyticsNarrative(req, res);

    expect(res.statusCode).toBe(400);
    expect((res.body as { error: string }).error).toMatch(/eventId must be a positive integer/i);
  });

  it('returns 400 when eventId is zero', async () => {
    const { getAnalyticsNarrative } = await loadController();
    const req = makeReq({ eventId: 0 });
    const res = makeRes();

    await getAnalyticsNarrative(req, res);

    expect(res.statusCode).toBe(400);
    expect((res.body as { error: string }).error).toMatch(/eventId must be a positive integer/i);
  });

  it('returns 400 when eventId is negative', async () => {
    const { getAnalyticsNarrative } = await loadController();
    const req = makeReq({ eventId: -3 });
    const res = makeRes();

    await getAnalyticsNarrative(req, res);

    expect(res.statusCode).toBe(400);
    expect((res.body as { error: string }).error).toMatch(/eventId must be a positive integer/i);
  });

  it('returns 400 when eventId is a non-numeric string', async () => {
    const { getAnalyticsNarrative } = await loadController();
    const req = makeReq({ eventId: 'abc' });
    const res = makeRes();

    await getAnalyticsNarrative(req, res);

    expect(res.statusCode).toBe(400);
    expect((res.body as { error: string }).error).toMatch(/eventId must be a positive integer/i);
  });

  it('returns 400 when eventId is a float', async () => {
    const { getAnalyticsNarrative } = await loadController();
    const req = makeReq({ eventId: 1.5 });
    const res = makeRes();

    await getAnalyticsNarrative(req, res);

    expect(res.statusCode).toBe(400);
    expect((res.body as { error: string }).error).toMatch(/eventId must be a positive integer/i);
  });

  it('returns 400 when windowDays is 0', async () => {
    const { getAnalyticsNarrative } = await loadController();
    const req = makeReq({ eventId: 1, windowDays: 0 });
    const res = makeRes();

    await getAnalyticsNarrative(req, res);

    expect(res.statusCode).toBe(400);
    expect((res.body as { error: string }).error).toMatch(
      /windowDays must be an integer between 1 and 90/i,
    );
  });

  it('returns 400 when windowDays is 91', async () => {
    const { getAnalyticsNarrative } = await loadController();
    const req = makeReq({ eventId: 1, windowDays: 91 });
    const res = makeRes();

    await getAnalyticsNarrative(req, res);

    expect(res.statusCode).toBe(400);
    expect((res.body as { error: string }).error).toMatch(
      /windowDays must be an integer between 1 and 90/i,
    );
  });

  it('returns 400 when prompt exceeds 500 characters', async () => {
    const { getAnalyticsNarrative } = await loadController();
    const req = makeReq({ eventId: 1, prompt: 'x'.repeat(501) });
    const res = makeRes();

    await getAnalyticsNarrative(req, res);

    expect(res.statusCode).toBe(400);
    expect((res.body as { error: string }).error).toMatch(/prompt must not exceed 500 characters/i);
  });
});

// ── Provider configuration tests ───────────────────────────────────────────────

describe('getAnalyticsNarrative — provider configuration', () => {
  it('returns 503 when no AI provider is configured', async () => {
    const { getAnalyticsNarrative } = await loadController();
    const req = makeReq({ eventId: 1 });
    const res = makeRes();

    await getAnalyticsNarrative(req, res);

    expect(res.statusCode).toBe(503);
    expect((res.body as { error: string }).error).toMatch(/AI suggestions are not configured/i);
  });

  it('returns 503 when Azure is partially configured', async () => {
    process.env.AZURE_OPENAI_ENDPOINT = 'https://example-resource.cognitiveservices.azure.com';
    // API key intentionally missing

    const { getAnalyticsNarrative } = await loadController();
    const req = makeReq({ eventId: 1 });
    const res = makeRes();

    await getAnalyticsNarrative(req, res);

    expect(res.statusCode).toBe(503);
    expect((res.body as { error: string }).error).toMatch(/partially configured/i);
  });
});

// ── Entity not found ───────────────────────────────────────────────────────────

describe('getAnalyticsNarrative — entity not found', () => {
  it('returns 404 when event does not exist', async () => {
    process.env.AZURE_OPENAI_ENDPOINT = 'https://example.cognitiveservices.azure.com';
    process.env.AZURE_OPENAI_API_KEY = 'test-key';
    process.env.AZURE_OPENAI_DEPLOYMENT = 'gpt-4o';

    mockDb.get
      .mockResolvedValueOnce({ count: 1 }) // rate limit
      .mockResolvedValueOnce(undefined); // event not found

    const { getAnalyticsNarrative } = await loadController();
    const req = makeReq({ eventId: 999 }, { id: 1, email: 'user@test.com', role_id: 1 });
    const res = makeRes();

    await getAnalyticsNarrative(req, res);

    expect(res.statusCode).toBe(404);
    expect((res.body as { error: string }).error).toMatch(/999/);
  });
});

// ── Successful generation ──────────────────────────────────────────────────────

describe('getAnalyticsNarrative — successful generation', () => {
  it('returns structured narrative with all required fields', async () => {
    process.env.AZURE_OPENAI_ENDPOINT = 'https://example.cognitiveservices.azure.com';
    process.env.AZURE_OPENAI_API_KEY = 'test-key';
    process.env.AZURE_OPENAI_DEPLOYMENT = 'gpt-4o';

    mockSuccessfulDbCalls();

    const aiPayload = {
      choices: [
        {
          message: {
            content: JSON.stringify({
              headline: 'Summer Festival is on track with strong RSVP momentum',
              trendDirection: 'up',
              summary:
                'Confirmed RSVPs have grown from 30 to 45 this week, and task completion rate is at 60%. Budget utilisation stands at 75%.',
              notableChanges: [
                'Confirmed RSVPs increased by 15 (from 30 to 45)',
                'Tasks completed rose from 8 to 12',
                'Budget spend increased by $2,000',
              ],
              suggestedActions: [
                'Send reminder to 15 pending RSVPs to maximise attendance',
                'Review the 8 incomplete tasks and assign owners',
                'Monitor budget — 75% utilisation with tasks still in progress',
              ],
              dataQuality: 'sufficient',
            }),
          },
        },
      ],
    };

    const { restore } = mockHttpsJsonReply(aiPayload);

    const { getAnalyticsNarrative } = await loadController();
    const req = makeReq(
      { eventId: 1, windowDays: 7 },
      { id: 42, email: 'user@test.com', role_id: 1 },
    );
    const res = makeRes();

    await getAnalyticsNarrative(req, res);
    restore();

    expect(res.statusCode).toBe(200);

    const body = res.body as {
      workflowType: string;
      eventId: number;
      eventTitle: string;
      headline: string;
      trendDirection: string;
      summary: string;
      notableChanges: string[];
      suggestedActions: string[];
      dataQuality: string;
      contextSummary: {
        windowDays: number;
        currentPeriodGrounded: boolean;
        priorPeriodGrounded: boolean;
      };
      raw: string;
    };

    expect(body.workflowType).toBe('analytics-narrative');
    expect(body.eventId).toBe(1);
    expect(body.eventTitle).toBe('Summer Festival');
    expect(body.headline).toBeTruthy();
    expect(body.headline.length).toBeLessThanOrEqual(120);
    expect(body.trendDirection).toBe('up');
    expect(body.summary).toBeTruthy();
    expect(Array.isArray(body.notableChanges)).toBe(true);
    expect(body.notableChanges.length).toBeGreaterThan(0);
    expect(Array.isArray(body.suggestedActions)).toBe(true);
    expect(body.suggestedActions.length).toBeGreaterThan(0);
    expect(body.dataQuality).toBe('sufficient');
    expect(body.contextSummary.windowDays).toBe(7);
    expect(body.contextSummary.currentPeriodGrounded).toBe(true);
    expect(body.contextSummary.priorPeriodGrounded).toBe(true);
    expect(typeof body.raw).toBe('string');
  });

  it('uses default windowDays of 7 when not specified', async () => {
    process.env.AZURE_OPENAI_ENDPOINT = 'https://example.cognitiveservices.azure.com';
    process.env.AZURE_OPENAI_API_KEY = 'test-key';
    process.env.AZURE_OPENAI_DEPLOYMENT = 'gpt-4o';

    mockSuccessfulDbCalls();

    const aiPayload = {
      choices: [
        {
          message: {
            content: JSON.stringify({
              headline: 'Event metrics look solid',
              trendDirection: 'stable',
              summary: 'Metrics are holding steady.',
              notableChanges: [],
              suggestedActions: [],
              dataQuality: 'sufficient',
            }),
          },
        },
      ],
    };

    const { restore } = mockHttpsJsonReply(aiPayload);

    const { getAnalyticsNarrative } = await loadController();
    const req = makeReq({ eventId: 1 }, { id: 5, email: 'u@test.com', role_id: 1 });
    const res = makeRes();

    await getAnalyticsNarrative(req, res);
    restore();

    expect(res.statusCode).toBe(200);
    expect((res.body as { contextSummary: { windowDays: number } }).contextSummary.windowDays).toBe(
      7,
    );
  });

  it('accepts optional organiser prompt', async () => {
    process.env.AZURE_OPENAI_ENDPOINT = 'https://example.cognitiveservices.azure.com';
    process.env.AZURE_OPENAI_API_KEY = 'test-key';
    process.env.AZURE_OPENAI_DEPLOYMENT = 'gpt-4o';

    mockSuccessfulDbCalls();

    const aiPayload = {
      choices: [
        {
          message: {
            content: JSON.stringify({
              headline: 'RSVP acceptance is strong',
              trendDirection: 'up',
              summary: 'Good acceptance rate noted.',
              notableChanges: ['Acceptance rate is 75%'],
              suggestedActions: ['Continue outreach'],
              dataQuality: 'sufficient',
            }),
          },
        },
      ],
    };

    const { captured, restore } = mockHttpsJsonReply(aiPayload);

    const { getAnalyticsNarrative } = await loadController();
    const req = makeReq(
      { eventId: 1, prompt: 'Focus on RSVP trends' },
      { id: 3, email: 'u@test.com', role_id: 1 },
    );
    const res = makeRes();

    await getAnalyticsNarrative(req, res);
    restore();

    expect(res.statusCode).toBe(200);
    const requestBody = JSON.parse(captured.body) as {
      messages: { role: string; content: string }[];
    };
    const userMessage = requestBody.messages.find((m) => m.role === 'user')?.content ?? '';
    expect(userMessage).toContain('Focus on RSVP trends');
  });
});

// ── Sparse data ────────────────────────────────────────────────────────────────

describe('getAnalyticsNarrative — sparse data', () => {
  it('forces dataQuality to sparse when metrics are minimal', async () => {
    process.env.AZURE_OPENAI_ENDPOINT = 'https://example.cognitiveservices.azure.com';
    process.env.AZURE_OPENAI_API_KEY = 'test-key';
    process.env.AZURE_OPENAI_DEPLOYMENT = 'gpt-4o';

    mockDb.get
      .mockResolvedValueOnce({ count: 1 }) // rate limit
      .mockResolvedValueOnce({ title: 'New Event', status: 'Draft' }) // event
      .mockResolvedValueOnce({ confirmed: 1, total: 2 }) // current RSVP (< 5)
      .mockResolvedValueOnce({ complete: 0, total: 1 }) // current tasks (< 3)
      .mockResolvedValueOnce({ allocated: '0', spent: '0' }) // current budget = 0
      .mockResolvedValueOnce({ confirmed: 0, total: 0 }) // prior RSVP
      .mockResolvedValueOnce({ complete: 0, total: 0 }) // prior tasks
      .mockResolvedValueOnce({ allocated: '0', spent: '0' }); // prior budget

    const aiPayload = {
      choices: [
        {
          message: {
            content: JSON.stringify({
              headline: 'Limited data available for New Event',
              trendDirection: 'stable',
              summary: 'Only 2 RSVPs so far.',
              notableChanges: [],
              suggestedActions: ['Start promoting the event'],
              dataQuality: 'sufficient', // model says sufficient — should be overridden
            }),
          },
        },
      ],
    };

    const { restore } = mockHttpsJsonReply(aiPayload);

    const { getAnalyticsNarrative } = await loadController();
    const req = makeReq({ eventId: 2 }, { id: 1, email: 'u@test.com', role_id: 1 });
    const res = makeRes();

    await getAnalyticsNarrative(req, res);
    restore();

    expect(res.statusCode).toBe(200);
    // Despite model returning 'sufficient', sparse override must apply
    expect((res.body as { dataQuality: string }).dataQuality).toBe('sparse');
  });
});

// ── Prior period grounding ─────────────────────────────────────────────────────

describe('getAnalyticsNarrative — prior period grounding', () => {
  it('sets priorPeriodGrounded to false when no historical data exists', async () => {
    process.env.AZURE_OPENAI_ENDPOINT = 'https://example.cognitiveservices.azure.com';
    process.env.AZURE_OPENAI_API_KEY = 'test-key';
    process.env.AZURE_OPENAI_DEPLOYMENT = 'gpt-4o';

    mockDb.get
      .mockResolvedValueOnce({ count: 1 }) // rate limit
      .mockResolvedValueOnce({ title: 'Brand New Event', status: 'Planning' }) // event
      .mockResolvedValueOnce({ confirmed: 10, total: 15 }) // current RSVP
      .mockResolvedValueOnce({ complete: 3, total: 5 }) // current tasks
      .mockResolvedValueOnce({ allocated: '2000', spent: '500' }) // current budget
      .mockResolvedValueOnce({ confirmed: 0, total: 0 }) // prior RSVP (no data)
      .mockResolvedValueOnce({ complete: 0, total: 0 }) // prior tasks (no data)
      .mockResolvedValueOnce({ allocated: '0', spent: '0' }); // prior budget (no data)

    const aiPayload = {
      choices: [
        {
          message: {
            content: JSON.stringify({
              headline: 'Brand New Event has 10 confirmed RSVPs',
              trendDirection: 'stable',
              summary: 'No prior period data available for comparison.',
              notableChanges: [],
              suggestedActions: ['Track RSVP growth over the next week'],
              dataQuality: 'sufficient',
            }),
          },
        },
      ],
    };

    const { restore } = mockHttpsJsonReply(aiPayload);

    const { getAnalyticsNarrative } = await loadController();
    const req = makeReq({ eventId: 5 }, { id: 2, email: 'u@test.com', role_id: 1 });
    const res = makeRes();

    await getAnalyticsNarrative(req, res);
    restore();

    expect(res.statusCode).toBe(200);
    const body = res.body as {
      contextSummary: { priorPeriodGrounded: boolean };
    };
    expect(body.contextSummary.priorPeriodGrounded).toBe(false);
  });
});

// ── AI provider failure ────────────────────────────────────────────────────────

describe('getAnalyticsNarrative — provider failure', () => {
  it('returns 502 when AI provider throws', async () => {
    process.env.AZURE_OPENAI_ENDPOINT = 'https://example.cognitiveservices.azure.com';
    process.env.AZURE_OPENAI_API_KEY = 'test-key';
    process.env.AZURE_OPENAI_DEPLOYMENT = 'gpt-4o';

    mockSuccessfulDbCalls();

    vi.spyOn(https, 'request').mockImplementation((_options, _callback) => {
      const req = new EventEmitter() as EventEmitter & {
        write: (chunk: string) => void;
        end: () => void;
      };
      req.write = () => undefined;
      req.end = () => {
        req.emit('error', new Error('Network failure'));
      };
      return req as never;
    });

    const { getAnalyticsNarrative } = await loadController();
    const req = makeReq({ eventId: 1 }, { id: 1, email: 'u@test.com', role_id: 1 });
    const res = makeRes();

    await getAnalyticsNarrative(req, res);

    expect(res.statusCode).toBe(502);
    expect((res.body as { error: string }).error).toMatch(/AI request failed/i);
  });
});

// ── Schema unit tests ──────────────────────────────────────────────────────────

describe('parseAnalyticsNarrativeOutput — unit tests', () => {
  it('parses valid JSON response', async () => {
    vi.resetModules();
    const { parseAnalyticsNarrativeOutput } = await import('../src/lib/ai-schemas.js');

    const raw = JSON.stringify({
      headline: 'Metrics improving across the board',
      trendDirection: 'up',
      summary: 'RSVPs are up and tasks are nearly done.',
      notableChanges: ['RSVPs increased by 10', 'Task completion rate hit 80%'],
      suggestedActions: ['Send final invites', 'Review blocked tasks'],
      dataQuality: 'sufficient',
    });

    const result = parseAnalyticsNarrativeOutput(raw);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.headline).toBe('Metrics improving across the board');
    expect(result.data.trendDirection).toBe('up');
    expect(result.data.summary).toBeTruthy();
    expect(result.data.notableChanges).toHaveLength(2);
    expect(result.data.suggestedActions).toHaveLength(2);
    expect(result.data.dataQuality).toBe('sufficient');
  });

  it('strips markdown fences from response', async () => {
    vi.resetModules();
    const { parseAnalyticsNarrativeOutput } = await import('../src/lib/ai-schemas.js');

    const raw =
      '```json\n' +
      JSON.stringify({
        headline: 'Headline here',
        trendDirection: 'stable',
        summary: 'Summary text.',
        notableChanges: [],
        suggestedActions: [],
        dataQuality: 'sparse',
      }) +
      '\n```';

    const result = parseAnalyticsNarrativeOutput(raw);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.headline).toBe('Headline here');
    expect(result.data.dataQuality).toBe('sparse');
  });

  it('fails when headline is missing', async () => {
    vi.resetModules();
    const { parseAnalyticsNarrativeOutput } = await import('../src/lib/ai-schemas.js');

    const raw = JSON.stringify({
      trendDirection: 'up',
      summary: 'Good summary.',
      notableChanges: [],
      suggestedActions: [],
      dataQuality: 'sufficient',
    });

    const result = parseAnalyticsNarrativeOutput(raw);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.some((e) => e.field === 'headline')).toBe(true);
  });

  it('fails when summary is missing', async () => {
    vi.resetModules();
    const { parseAnalyticsNarrativeOutput } = await import('../src/lib/ai-schemas.js');

    const raw = JSON.stringify({
      headline: 'A headline',
      trendDirection: 'down',
      notableChanges: [],
      suggestedActions: [],
      dataQuality: 'sufficient',
    });

    const result = parseAnalyticsNarrativeOutput(raw);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.some((e) => e.field === 'summary')).toBe(true);
  });

  it('fails on invalid JSON', async () => {
    vi.resetModules();
    const { parseAnalyticsNarrativeOutput } = await import('../src/lib/ai-schemas.js');

    const result = parseAnalyticsNarrativeOutput('not json at all');

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors[0].field).toBe('<root>');
  });

  it('defaults trendDirection to stable for unknown values', async () => {
    vi.resetModules();
    const { parseAnalyticsNarrativeOutput } = await import('../src/lib/ai-schemas.js');

    const raw = JSON.stringify({
      headline: 'A headline',
      trendDirection: 'sideways', // invalid
      summary: 'Summary.',
      notableChanges: [],
      suggestedActions: [],
      dataQuality: 'sufficient',
    });

    const result = parseAnalyticsNarrativeOutput(raw);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.trendDirection).toBe('stable');
  });

  it('defaults dataQuality to sufficient for unknown values', async () => {
    vi.resetModules();
    const { parseAnalyticsNarrativeOutput } = await import('../src/lib/ai-schemas.js');

    const raw = JSON.stringify({
      headline: 'A headline',
      trendDirection: 'up',
      summary: 'Summary.',
      notableChanges: [],
      suggestedActions: [],
      dataQuality: 'unknown',
    });

    const result = parseAnalyticsNarrativeOutput(raw);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.dataQuality).toBe('sufficient');
  });

  it('truncates notableChanges to 5 items', async () => {
    vi.resetModules();
    const { parseAnalyticsNarrativeOutput } = await import('../src/lib/ai-schemas.js');

    const raw = JSON.stringify({
      headline: 'A headline',
      trendDirection: 'up',
      summary: 'Summary.',
      notableChanges: ['c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7'],
      suggestedActions: [],
      dataQuality: 'sufficient',
    });

    const result = parseAnalyticsNarrativeOutput(raw);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.notableChanges).toHaveLength(5);
  });

  it('truncates suggestedActions to 3 items', async () => {
    vi.resetModules();
    const { parseAnalyticsNarrativeOutput } = await import('../src/lib/ai-schemas.js');

    const raw = JSON.stringify({
      headline: 'A headline',
      trendDirection: 'up',
      summary: 'Summary.',
      notableChanges: [],
      suggestedActions: ['a1', 'a2', 'a3', 'a4', 'a5'],
      dataQuality: 'sufficient',
    });

    const result = parseAnalyticsNarrativeOutput(raw);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.suggestedActions).toHaveLength(3);
  });

  it('truncates headline to 120 characters', async () => {
    vi.resetModules();
    const { parseAnalyticsNarrativeOutput } = await import('../src/lib/ai-schemas.js');

    const raw = JSON.stringify({
      headline: 'x'.repeat(150),
      trendDirection: 'stable',
      summary: 'Summary.',
      notableChanges: [],
      suggestedActions: [],
      dataQuality: 'sufficient',
    });

    const result = parseAnalyticsNarrativeOutput(raw);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.headline.length).toBe(120);
  });

  it('fails when notableChanges is not an array', async () => {
    vi.resetModules();
    const { parseAnalyticsNarrativeOutput } = await import('../src/lib/ai-schemas.js');

    const raw = JSON.stringify({
      headline: 'Headline',
      trendDirection: 'up',
      summary: 'Summary.',
      notableChanges: 'should be array',
      suggestedActions: [],
      dataQuality: 'sufficient',
    });

    const result = parseAnalyticsNarrativeOutput(raw);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.some((e) => e.field === 'notableChanges')).toBe(true);
  });
});
