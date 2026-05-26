/**
 * Tests: AI Budget Insight Assistance — Story #952
 *
 * Covers:
 * - Input validation (missing eventId, non-positive eventId, non-integer eventId)
 * - Provider configuration errors (503 none, 503 partial Azure)
 * - Entity not found (404)
 * - Successful insight generation (structured response, context summary, 3+ recommendations)
 * - Partial/missing budget data (empty categories, no expenses)
 * - Overspend scenario
 * - AI provider failure (502)
 * - parseBudgetInsightOutput unit tests (valid JSON, markdown fences, invalid JSON, missing fields)
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

describe('getBudgetInsight — input validation', () => {
  it('returns 400 when eventId is missing', async () => {
    const { getBudgetInsight } = await loadController();
    const req = makeReq({});
    const res = makeRes();

    await getBudgetInsight(req, res);

    expect(res.statusCode).toBe(400);
    expect((res.body as { error: string }).error).toMatch(/eventId must be a positive integer/i);
  });

  it('returns 400 when eventId is zero', async () => {
    const { getBudgetInsight } = await loadController();
    const req = makeReq({ eventId: 0 });
    const res = makeRes();

    await getBudgetInsight(req, res);

    expect(res.statusCode).toBe(400);
    expect((res.body as { error: string }).error).toMatch(/eventId must be a positive integer/i);
  });

  it('returns 400 when eventId is negative', async () => {
    const { getBudgetInsight } = await loadController();
    const req = makeReq({ eventId: -5 });
    const res = makeRes();

    await getBudgetInsight(req, res);

    expect(res.statusCode).toBe(400);
    expect((res.body as { error: string }).error).toMatch(/eventId must be a positive integer/i);
  });

  it('returns 400 when eventId is a non-numeric string', async () => {
    const { getBudgetInsight } = await loadController();
    const req = makeReq({ eventId: 'abc' });
    const res = makeRes();

    await getBudgetInsight(req, res);

    expect(res.statusCode).toBe(400);
    expect((res.body as { error: string }).error).toMatch(/eventId must be a positive integer/i);
  });
});

// ── Provider configuration tests ───────────────────────────────────────────────

describe('getBudgetInsight — provider configuration', () => {
  it('returns 503 when no AI provider is configured', async () => {
    const { getBudgetInsight } = await loadController();
    const req = makeReq({ eventId: 1 });
    const res = makeRes();

    await getBudgetInsight(req, res);

    expect(res.statusCode).toBe(503);
    expect((res.body as { error: string }).error).toMatch(/AI suggestions are not configured/i);
  });

  it('returns 503 when Azure is partially configured', async () => {
    process.env.AZURE_OPENAI_ENDPOINT = 'https://example-resource.cognitiveservices.azure.com';
    // API key intentionally missing

    const { getBudgetInsight } = await loadController();
    const req = makeReq({ eventId: 1 });
    const res = makeRes();

    await getBudgetInsight(req, res);

    expect(res.statusCode).toBe(503);
    expect((res.body as { error: string }).error).toMatch(/partially configured/i);
  });
});

// ── Entity not found ───────────────────────────────────────────────────────────

describe('getBudgetInsight — entity not found', () => {
  it('returns 404 when event does not exist', async () => {
    process.env.AZURE_OPENAI_ENDPOINT = 'https://example.cognitiveservices.azure.com';
    process.env.AZURE_OPENAI_API_KEY = 'test-key';
    process.env.AZURE_OPENAI_DEPLOYMENT = 'gpt-4o';

    // Event lookup returns undefined
    mockDb.get.mockResolvedValueOnce(undefined);

    const { getBudgetInsight } = await loadController();
    const req = makeReq({ eventId: 999 });
    const res = makeRes();

    await getBudgetInsight(req, res);

    expect(res.statusCode).toBe(404);
    expect((res.body as { error: string }).error).toMatch(/999/);
  });
});

// ── Successful generation ──────────────────────────────────────────────────────

describe('getBudgetInsight — successful insight generation', () => {
  it('returns structured response with 3+ recommendations', async () => {
    process.env.AZURE_OPENAI_ENDPOINT = 'https://example.cognitiveservices.azure.com';
    process.env.AZURE_OPENAI_API_KEY = 'test-key';
    process.env.AZURE_OPENAI_DEPLOYMENT = 'gpt-4o';

    mockDb.get
      .mockResolvedValueOnce({ count: 1 }) // rate limit check — within budget
      .mockResolvedValueOnce({
        id: 1,
        title: 'Summer Festival',
        date: '2025-08-15',
        status: 'active',
      });
    mockDb.all
      .mockResolvedValueOnce([
        { id: 10, name: 'Stage & Sound', allocated_amount: 5000 },
        { id: 11, name: 'Catering', allocated_amount: 3000 },
        { id: 12, name: 'Marketing', allocated_amount: 1500 },
      ])
      .mockResolvedValueOnce([
        { category_id: 10, total_spent: 4500, expense_count: 3 },
        { category_id: 11, total_spent: 3200, expense_count: 5 },
      ]);

    const aiPayload = {
      choices: [
        {
          message: {
            content: JSON.stringify({
              summary: 'Budget is mostly on track. Catering is overspent.',
              riskLevel: 'medium',
              anomalies: ['Catering is 7% over allocated budget'],
              recommendations: [
                {
                  category: 'Catering',
                  insight: 'Spending exceeds allocation by $200.',
                  action: 'Negotiate vendor discount or reduce menu items.',
                  priority: 'high',
                },
                {
                  category: 'Marketing',
                  insight: 'No spend recorded yet — risk of last-minute rush.',
                  action: 'Begin marketing spend by 4 weeks before event.',
                  priority: 'medium',
                },
                {
                  category: 'Overall',
                  insight: 'Total spend is 92% of total allocation.',
                  action: 'Hold 10% contingency for last-minute expenses.',
                  priority: 'low',
                },
              ],
            }),
          },
        },
      ],
    };

    const { restore } = mockHttpsJsonReply(aiPayload);

    const { getBudgetInsight } = await loadController();
    const req = makeReq({ eventId: 1 }, { id: 42, email: 'user@test.com', role_id: 1 });
    const res = makeRes();

    await getBudgetInsight(req, res);
    restore();

    expect(res.statusCode).toBe(200);

    const body = res.body as {
      workflowType: string;
      eventId: number;
      eventTitle: string;
      riskLevel: string;
      totalAllocated: number;
      totalSpent: number;
      overspentCategories: string[];
      recommendations: unknown[];
      contextSummary: { categoryCount: number; expenseCount: number };
    };

    expect(body.workflowType).toBe('budget-insight');
    expect(body.eventId).toBe(1);
    expect(body.eventTitle).toBe('Summer Festival');
    expect(body.riskLevel).toBe('medium');
    expect(body.totalAllocated).toBe(9500);
    expect(body.totalSpent).toBe(7700);
    expect(body.overspentCategories).toContain('Catering');
    expect(body.recommendations.length).toBeGreaterThanOrEqual(3);
    expect(body.contextSummary.categoryCount).toBe(3);
    expect(body.contextSummary.expenseCount).toBe(8);
  });

  it('handles empty budget categories safely', async () => {
    process.env.AZURE_OPENAI_ENDPOINT = 'https://example.cognitiveservices.azure.com';
    process.env.AZURE_OPENAI_API_KEY = 'test-key';
    process.env.AZURE_OPENAI_DEPLOYMENT = 'gpt-4o';

    mockDb.get.mockResolvedValueOnce({
      id: 2,
      title: 'Empty Budget Event',
      date: null,
      status: 'draft',
    }); // no user passed — no rate limit check needed
    mockDb.all
      .mockResolvedValueOnce([]) // no categories
      .mockResolvedValueOnce([]); // no expenses

    const aiPayload = {
      choices: [
        {
          message: {
            content: JSON.stringify({
              summary: 'No budget categories defined.',
              riskLevel: 'high',
              anomalies: [],
              recommendations: [
                { category: 'Overall', insight: 'No budget set up.', action: 'Create budget categories.', priority: 'high' },
                { category: 'Overall', insight: 'Allocate funds to at least 3 categories.', action: 'Set up venue, food, and marketing budgets.', priority: 'high' },
                { category: 'Overall', insight: 'Without budget tracking, overspend risk is high.', action: 'Enable expense tracking immediately.', priority: 'critical' },
              ],
            }),
          },
        },
      ],
    };

    const { restore } = mockHttpsJsonReply(aiPayload);

    const { getBudgetInsight } = await loadController();
    const req = makeReq({ eventId: 2 });
    const res = makeRes();

    await getBudgetInsight(req, res);
    restore();

    expect(res.statusCode).toBe(200);
    const body = res.body as {
      totalAllocated: number;
      totalSpent: number;
      overspentCategories: string[];
      contextSummary: { categoryCount: number };
    };
    expect(body.totalAllocated).toBe(0);
    expect(body.totalSpent).toBe(0);
    expect(body.overspentCategories).toHaveLength(0);
    expect(body.contextSummary.categoryCount).toBe(0);
  });

  it('detects overspent categories and includes them in response', async () => {
    process.env.AZURE_OPENAI_ENDPOINT = 'https://example.cognitiveservices.azure.com';
    process.env.AZURE_OPENAI_API_KEY = 'test-key';
    process.env.AZURE_OPENAI_DEPLOYMENT = 'gpt-4o';

    mockDb.get.mockResolvedValueOnce({
      id: 3,
      title: 'Overspend Festival',
      date: '2025-09-20',
      status: 'active',
    }); // no user passed — no rate limit check needed
    mockDb.all
      .mockResolvedValueOnce([
        { id: 20, name: 'Venue', allocated_amount: 2000 },
        { id: 21, name: 'Lighting', allocated_amount: 1000 },
      ])
      .mockResolvedValueOnce([
        { category_id: 20, total_spent: 2500, expense_count: 2 }, // overspent
        { category_id: 21, total_spent: 900, expense_count: 1 },
      ]);

    const aiPayload = {
      choices: [
        {
          message: {
            content: JSON.stringify({
              summary: 'Venue is significantly overspent.',
              riskLevel: 'critical',
              anomalies: ['Venue spend is 25% over allocation'],
              recommendations: [
                { category: 'Venue', insight: 'Overspent by $500.', action: 'Negotiate refund or cut other costs.', priority: 'critical' },
                { category: 'Lighting', insight: 'Under budget — good.', action: 'Maintain current spend rate.', priority: 'low' },
                { category: 'Overall', insight: 'Total overspend of $400.', action: 'Review all vendor invoices.', priority: 'high' },
              ],
            }),
          },
        },
      ],
    };

    const { restore } = mockHttpsJsonReply(aiPayload);

    const { getBudgetInsight } = await loadController();
    const req = makeReq({ eventId: 3 });
    const res = makeRes();

    await getBudgetInsight(req, res);
    restore();

    expect(res.statusCode).toBe(200);
    const body = res.body as {
      riskLevel: string;
      totalVariance: number;
      overspentCategories: string[];
    };
    expect(body.riskLevel).toBe('critical');
    expect(body.totalVariance).toBe(-400); // 3000 allocated - 3400 spent
    expect(body.overspentCategories).toContain('Venue');
    expect(body.overspentCategories).not.toContain('Lighting');
  });
});

// ── AI provider failure ────────────────────────────────────────────────────────

describe('getBudgetInsight — AI provider failure', () => {
  it('returns 502 when the AI call throws', async () => {
    process.env.AZURE_OPENAI_ENDPOINT = 'https://example.cognitiveservices.azure.com';
    process.env.AZURE_OPENAI_API_KEY = 'test-key';
    process.env.AZURE_OPENAI_DEPLOYMENT = 'gpt-4o';

    mockDb.get.mockResolvedValueOnce({
      id: 4,
      title: 'Test Event',
      date: null,
      status: 'draft',
    });
    mockDb.all.mockResolvedValueOnce([]).mockResolvedValueOnce([]);

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

    const { getBudgetInsight } = await loadController();
    const req = makeReq({ eventId: 4 });
    const res = makeRes();

    await getBudgetInsight(req, res);

    expect(res.statusCode).toBe(502);
    expect((res.body as { error: string }).error).toMatch(/AI request failed/i);
  });
});

// ── parseBudgetInsightOutput unit tests ───────────────────────────────────────

describe('parseBudgetInsightOutput', () => {
  it('parses valid JSON with all fields correctly', async () => {
    const { parseBudgetInsightOutput } = await loadController();

    const input = JSON.stringify({
      summary: 'Budget looks good.',
      riskLevel: 'low',
      anomalies: ['Category X near threshold'],
      recommendations: [
        { category: 'Stage', insight: 'On track.', action: 'Continue monitoring.', priority: 'low' },
        { category: 'Food', insight: 'High spend.', action: 'Reduce catering cost.', priority: 'high' },
        { category: 'Overall', insight: 'Reserve contingency.', action: 'Set aside 10%.', priority: 'medium' },
      ],
    });

    const result = parseBudgetInsightOutput(input);

    expect(result).not.toBeNull();
    expect(result!.summary).toBe('Budget looks good.');
    expect(result!.riskLevel).toBe('low');
    expect(result!.anomalies).toHaveLength(1);
    expect(result!.recommendations).toHaveLength(3);
  });

  it('strips markdown code fences before parsing', async () => {
    const { parseBudgetInsightOutput } = await loadController();

    const raw = '```json\n' + JSON.stringify({
      summary: 'OK',
      riskLevel: 'medium',
      anomalies: [],
      recommendations: [
        { category: 'Overall', insight: 'Fine.', action: 'Monitor.', priority: 'low' },
        { category: 'Venue', insight: 'Watch spend.', action: 'Check weekly.', priority: 'medium' },
        { category: 'Food', insight: 'On track.', action: 'Keep going.', priority: 'low' },
      ],
    }) + '\n```';

    const result = parseBudgetInsightOutput(raw);

    expect(result).not.toBeNull();
    expect(result!.riskLevel).toBe('medium');
    expect(result!.recommendations).toHaveLength(3);
  });

  it('returns null for invalid JSON', async () => {
    const { parseBudgetInsightOutput } = await loadController();

    const result = parseBudgetInsightOutput('not valid json at all');

    expect(result).toBeNull();
  });

  it('returns null when recommendations array is missing', async () => {
    const { parseBudgetInsightOutput } = await loadController();

    const input = JSON.stringify({
      summary: 'Budget summary.',
      riskLevel: 'high',
      anomalies: [],
      // recommendations missing
    });

    const result = parseBudgetInsightOutput(input);

    expect(result).toBeNull();
  });

  it('returns null when recommendations array is empty', async () => {
    const { parseBudgetInsightOutput } = await loadController();

    const input = JSON.stringify({
      summary: 'Nothing to say.',
      riskLevel: 'low',
      anomalies: [],
      recommendations: [],
    });

    const result = parseBudgetInsightOutput(input);

    expect(result).toBeNull();
  });

  it('defaults unknown riskLevel to medium', async () => {
    const { parseBudgetInsightOutput } = await loadController();

    const input = JSON.stringify({
      summary: 'Test',
      riskLevel: 'extreme', // invalid value
      anomalies: [],
      recommendations: [
        { category: 'Overall', insight: 'Fine.', action: 'OK.', priority: 'low' },
      ],
    });

    const result = parseBudgetInsightOutput(input);

    expect(result).not.toBeNull();
    expect(result!.riskLevel).toBe('medium');
  });

  it('defaults unknown priority to medium', async () => {
    const { parseBudgetInsightOutput } = await loadController();

    const input = JSON.stringify({
      summary: 'Test',
      riskLevel: 'low',
      anomalies: [],
      recommendations: [
        { category: 'Overall', insight: 'Fine.', action: 'OK.', priority: 'unknown-value' },
      ],
    });

    const result = parseBudgetInsightOutput(input);

    expect(result).not.toBeNull();
    expect(result!.recommendations[0].priority).toBe('medium');
  });

  it('skips recommendation items that lack an insight field', async () => {
    const { parseBudgetInsightOutput } = await loadController();

    const input = JSON.stringify({
      summary: 'Test',
      riskLevel: 'low',
      anomalies: [],
      recommendations: [
        { category: 'X', action: 'Do something.', priority: 'low' }, // missing insight
        { category: 'Y', insight: 'Good.', action: 'Keep it up.', priority: 'low' },
      ],
    });

    const result = parseBudgetInsightOutput(input);

    expect(result).not.toBeNull();
    expect(result!.recommendations).toHaveLength(1);
    expect(result!.recommendations[0].category).toBe('Y');
  });
});
