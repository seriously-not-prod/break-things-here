/**
 * Tests: AI Vendor Recommendation and Comparison Assistance — Story #953
 *
 * Covers:
 * - Input validation (missing eventId, non-positive, non-integer eventId)
 * - Provider configuration errors (503 none, 503 partial Azure)
 * - Entity not found (404)
 * - No vendors for event (422)
 * - Successful recommendation generation (ranked output, advisory label)
 * - Hallucination prevention (vendorIds not in grounded set are dropped)
 * - AI provider failure (502)
 * - Rate limit enforcement (429)
 * - parseVendorRecommendationOutput unit tests (valid JSON, markdown fences,
 *   invalid JSON, missing fields, hallucinated vendor IDs filtered out)
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

// ── Sample vendor data ─────────────────────────────────────────────────────────

const sampleVendors = [
  {
    id: 10,
    name: 'Best AV Solutions',
    category: 'AV Equipment',
    status: 'Confirmed',
    quoted_amount: 2500,
    rating: 5,
    contract_file: 'av-contract.pdf',
    communication_count: 4,
    last_contact_at: '2025-07-01T10:00:00Z',
  },
  {
    id: 11,
    name: 'Budget Caterers',
    category: 'Catering',
    status: 'Quote Received',
    quoted_amount: 1800,
    rating: 3,
    contract_file: null,
    communication_count: 2,
    last_contact_at: '2025-06-15T09:00:00Z',
  },
  {
    id: 12,
    name: 'Premier Sound',
    category: 'AV Equipment',
    status: 'Contacted',
    quoted_amount: 3200,
    rating: 4,
    contract_file: null,
    communication_count: 1,
    last_contact_at: null,
  },
];

const sampleAiRecommendationPayload = {
  choices: [
    {
      message: {
        content: JSON.stringify({
          summary:
            'Based on available data, Best AV Solutions leads on rating and contract readiness. Budget Caterers offers the lowest quoted amount.',
          advisoryLabel:
            'AI advisory only — recommendations are based solely on available vendor data. Verify all information independently before making contracting decisions.',
          recommendations: [
            {
              vendorId: 10,
              vendorName: 'Best AV Solutions',
              rank: 1,
              score: 88,
              rationale:
                'Highest rating (5/5), contract on file, 4 communications logged, status Confirmed.',
              strengths: ['5-star rating', 'Contract on file', 'Status: Confirmed'],
              concerns: [],
            },
            {
              vendorId: 12,
              vendorName: 'Premier Sound',
              rank: 2,
              score: 62,
              rationale: 'Good rating (4/5) but no contract on file and minimal communication.',
              strengths: ['4-star rating'],
              concerns: ['No contract on file', 'Only 1 communication logged'],
            },
            {
              vendorId: 11,
              vendorName: 'Budget Caterers',
              rank: 3,
              score: 55,
              rationale: 'Lowest quoted amount but average rating (3/5) and no contract on file.',
              strengths: ['Lowest quoted amount'],
              concerns: ['3-star rating', 'No contract on file'],
            },
          ],
        }),
      },
    },
  ],
};

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

describe('getVendorRecommendation — input validation', () => {
  it('returns 400 when eventId is missing', async () => {
    const { getVendorRecommendation } = await loadController();
    const req = makeReq({});
    const res = makeRes();

    await getVendorRecommendation(req, res);

    expect(res.statusCode).toBe(400);
    expect((res.body as { error: string }).error).toMatch(/eventId must be a positive integer/i);
  });

  it('returns 400 when eventId is zero', async () => {
    const { getVendorRecommendation } = await loadController();
    const req = makeReq({ eventId: 0 });
    const res = makeRes();

    await getVendorRecommendation(req, res);

    expect(res.statusCode).toBe(400);
    expect((res.body as { error: string }).error).toMatch(/eventId must be a positive integer/i);
  });

  it('returns 400 when eventId is negative', async () => {
    const { getVendorRecommendation } = await loadController();
    const req = makeReq({ eventId: -3 });
    const res = makeRes();

    await getVendorRecommendation(req, res);

    expect(res.statusCode).toBe(400);
    expect((res.body as { error: string }).error).toMatch(/eventId must be a positive integer/i);
  });

  it('returns 400 when eventId is a non-numeric string', async () => {
    const { getVendorRecommendation } = await loadController();
    const req = makeReq({ eventId: 'abc' });
    const res = makeRes();

    await getVendorRecommendation(req, res);

    expect(res.statusCode).toBe(400);
    expect((res.body as { error: string }).error).toMatch(/eventId must be a positive integer/i);
  });
});

// ── Provider configuration tests ───────────────────────────────────────────────

describe('getVendorRecommendation — provider configuration', () => {
  it('returns 503 when no AI provider is configured', async () => {
    const { getVendorRecommendation } = await loadController();
    const req = makeReq({ eventId: 1 });
    const res = makeRes();

    await getVendorRecommendation(req, res);

    expect(res.statusCode).toBe(503);
    expect((res.body as { error: string }).error).toMatch(/AI suggestions are not configured/i);
  });

  it('returns 503 when Azure is partially configured', async () => {
    process.env.AZURE_OPENAI_ENDPOINT = 'https://example-resource.cognitiveservices.azure.com';
    // API key intentionally missing

    const { getVendorRecommendation } = await loadController();
    const req = makeReq({ eventId: 1 });
    const res = makeRes();

    await getVendorRecommendation(req, res);

    expect(res.statusCode).toBe(503);
    expect((res.body as { error: string }).error).toMatch(/partially configured/i);
  });
});

// ── Entity not found ───────────────────────────────────────────────────────────

describe('getVendorRecommendation — entity not found', () => {
  it('returns 404 when event does not exist', async () => {
    process.env.AZURE_OPENAI_ENDPOINT = 'https://example.cognitiveservices.azure.com';
    process.env.AZURE_OPENAI_API_KEY = 'test-key';
    process.env.AZURE_OPENAI_DEPLOYMENT = 'gpt-4o';

    mockDb.get
      .mockResolvedValueOnce({ count: 1 }) // rate limit
      .mockResolvedValueOnce(undefined); // event not found

    const { getVendorRecommendation } = await loadController();
    const req = makeReq({ eventId: 999 }, { id: 1, email: 'u@test.com', role_id: 1 });
    const res = makeRes();

    await getVendorRecommendation(req, res);

    expect(res.statusCode).toBe(404);
    expect((res.body as { error: string }).error).toMatch(/999/);
  });
});

// ── No vendors ────────────────────────────────────────────────────────────────

describe('getVendorRecommendation — no vendors', () => {
  it('returns 422 when event has no vendors', async () => {
    process.env.AZURE_OPENAI_ENDPOINT = 'https://example.cognitiveservices.azure.com';
    process.env.AZURE_OPENAI_API_KEY = 'test-key';
    process.env.AZURE_OPENAI_DEPLOYMENT = 'gpt-4o';

    mockDb.get
      .mockResolvedValueOnce({ count: 1 }) // rate limit
      .mockResolvedValueOnce({ id: 1, title: 'Empty Event', date: null, status: 'draft' });
    mockDb.all.mockResolvedValueOnce([]); // no vendors

    const { getVendorRecommendation } = await loadController();
    const req = makeReq({ eventId: 1 }, { id: 1, email: 'u@test.com', role_id: 1 });
    const res = makeRes();

    await getVendorRecommendation(req, res);

    expect(res.statusCode).toBe(422);
    expect((res.body as { error: string }).error).toMatch(/No vendors found/i);
  });
});

// ── Successful generation ──────────────────────────────────────────────────────

describe('getVendorRecommendation — successful generation', () => {
  it('returns ranked recommendations with advisory label and context summary', async () => {
    process.env.AZURE_OPENAI_ENDPOINT = 'https://example.cognitiveservices.azure.com';
    process.env.AZURE_OPENAI_API_KEY = 'test-key';
    process.env.AZURE_OPENAI_DEPLOYMENT = 'gpt-4o';

    mockDb.get
      .mockResolvedValueOnce({ count: 1 }) // rate limit
      .mockResolvedValueOnce({
        id: 1,
        title: 'Summer Festival',
        date: '2025-08-15',
        status: 'active',
      });
    mockDb.all.mockResolvedValueOnce(sampleVendors);
    // log write
    mockDb.run.mockResolvedValue(undefined);

    const { restore } = mockHttpsJsonReply(sampleAiRecommendationPayload);

    const { getVendorRecommendation } = await loadController();
    const req = makeReq({ eventId: 1 }, { id: 42, email: 'user@test.com', role_id: 1 });
    const res = makeRes();

    await getVendorRecommendation(req, res);
    restore();

    expect(res.statusCode).toBe(200);

    const body = res.body as {
      workflowType: string;
      eventId: number;
      eventTitle: string;
      summary: string;
      recommendations: Array<{
        vendorId: number;
        rank: number;
        score: number;
        rationale: string;
        advisoryLabel?: string;
      }>;
      advisoryLabel: string;
      raw: string;
      contextSummary: { groundedFields: string[]; vendorCount: number };
    };

    expect(body.workflowType).toBe('vendor-recommendation');
    expect(body.eventId).toBe(1);
    expect(body.eventTitle).toBe('Summer Festival');
    expect(typeof body.summary).toBe('string');

    // Verify ranked recommendations are sorted by rank
    expect(body.recommendations.length).toBeGreaterThanOrEqual(1);
    const ranks = body.recommendations.map((r) => r.rank);
    expect(ranks).toEqual([...ranks].sort((a, b) => a - b));

    // Verify all vendorIds are from the grounded set
    const groundedIds = new Set([10, 11, 12]);
    for (const rec of body.recommendations) {
      expect(groundedIds.has(rec.vendorId)).toBe(true);
    }

    // Advisory label must be present and non-empty
    expect(typeof body.advisoryLabel).toBe('string');
    expect(body.advisoryLabel.length).toBeGreaterThan(0);
    expect(body.advisoryLabel.toLowerCase()).toMatch(/advisory/i);

    // Context summary
    expect(body.contextSummary.vendorCount).toBe(3);
    expect(Array.isArray(body.contextSummary.groundedFields)).toBe(true);
    expect(body.contextSummary.groundedFields).toContain('vendorList');
  });

  it('uses default prompt when no prompt is provided', async () => {
    process.env.OPENAI_API_KEY = 'test-openai-key';

    mockDb.get
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ id: 2, title: 'Conference', date: null, status: 'draft' });
    mockDb.all.mockResolvedValueOnce([sampleVendors[0]]);
    mockDb.run.mockResolvedValue(undefined);

    const singleVendorPayload = {
      choices: [
        {
          message: {
            content: JSON.stringify({
              summary: 'Only one vendor available.',
              advisoryLabel:
                'AI advisory only — recommendations are based solely on available vendor data.',
              recommendations: [
                {
                  vendorId: 10,
                  vendorName: 'Best AV Solutions',
                  rank: 1,
                  score: 80,
                  rationale: 'Only vendor available; rated 5/5 with contract on file.',
                  strengths: ['5-star rating', 'Contract on file'],
                  concerns: [],
                },
              ],
            }),
          },
        },
      ],
    };

    const { restore } = mockHttpsJsonReply(singleVendorPayload);

    const { getVendorRecommendation } = await loadController();
    // No prompt in body
    const req = makeReq({ eventId: 2 }, { id: 5, email: 'u@t.com', role_id: 1 });
    const res = makeRes();

    await getVendorRecommendation(req, res);
    restore();

    expect(res.statusCode).toBe(200);
    const body = res.body as { recommendations: Array<{ vendorId: number }> };
    expect(body.recommendations[0].vendorId).toBe(10);
  });
});

// ── Hallucination prevention ──────────────────────────────────────────────────

describe('getVendorRecommendation — hallucination prevention', () => {
  it('drops recommendations with vendorIds not in the grounded set', async () => {
    process.env.OPENAI_API_KEY = 'test-openai-key';

    mockDb.get
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ id: 3, title: 'Test Event', date: null, status: 'active' });
    // Only vendors 10 and 11 are in the DB
    mockDb.all.mockResolvedValueOnce([sampleVendors[0], sampleVendors[1]]);
    mockDb.run.mockResolvedValue(undefined);

    // AI returns a hallucinated vendor ID (999) not present in the grounded data
    const hallucinatedPayload = {
      choices: [
        {
          message: {
            content: JSON.stringify({
              summary: 'Advisory summary.',
              advisoryLabel: 'AI advisory only.',
              recommendations: [
                {
                  vendorId: 999, // hallucinated — not in grounded set
                  vendorName: 'Fake Vendor Inc.',
                  rank: 1,
                  score: 99,
                  rationale: 'This vendor is amazing.',
                  strengths: ['Invented strength'],
                  concerns: [],
                },
                {
                  vendorId: 10, // grounded — should survive
                  vendorName: 'Best AV Solutions',
                  rank: 2,
                  score: 80,
                  rationale: 'Rated 5/5, contract on file.',
                  strengths: ['5-star rating'],
                  concerns: [],
                },
              ],
            }),
          },
        },
      ],
    };

    const { restore } = mockHttpsJsonReply(hallucinatedPayload);

    const { getVendorRecommendation } = await loadController();
    const req = makeReq({ eventId: 3 }, { id: 7, email: 'u@t.com', role_id: 1 });
    const res = makeRes();

    await getVendorRecommendation(req, res);
    restore();

    expect(res.statusCode).toBe(200);
    const body = res.body as { recommendations: Array<{ vendorId: number; vendorName: string }> };

    // Hallucinated vendor (999) must be absent
    const ids = body.recommendations.map((r) => r.vendorId);
    expect(ids).not.toContain(999);
    // Grounded vendor (10) must be present
    expect(ids).toContain(10);
  });
});

// ── AI provider failure ────────────────────────────────────────────────────────

describe('getVendorRecommendation — AI provider failure', () => {
  it('returns 502 when AI provider call fails', async () => {
    process.env.OPENAI_API_KEY = 'test-openai-key';

    mockDb.get
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ id: 4, title: 'Event', date: null, status: 'active' });
    mockDb.all.mockResolvedValueOnce([sampleVendors[0]]);
    mockDb.run.mockResolvedValue(undefined);

    // Simulate network error
    vi.spyOn(https, 'request').mockImplementation((_opts, _cb) => {
      const req = new EventEmitter() as EventEmitter & {
        write: (chunk: string) => void;
        end: () => void;
      };
      req.write = () => undefined;
      req.end = () => {
        req.emit('error', new Error('Network connection refused'));
      };
      return req as never;
    });

    const { getVendorRecommendation } = await loadController();
    const reqObj = makeReq({ eventId: 4 }, { id: 8, email: 'u@t.com', role_id: 1 });
    const res = makeRes();

    await getVendorRecommendation(reqObj, res);

    expect(res.statusCode).toBe(502);
    expect((res.body as { error: string }).error).toMatch(/AI request failed/i);
  });
});

// ── Rate limit ─────────────────────────────────────────────────────────────────

describe('getVendorRecommendation — rate limit', () => {
  it('returns 429 when rate limit is exceeded', async () => {
    process.env.OPENAI_API_KEY = 'test-openai-key';

    // Rate limit count exceeds the 20/hr threshold
    mockDb.get.mockResolvedValueOnce({ count: 21 });

    const { getVendorRecommendation } = await loadController();
    const req = makeReq({ eventId: 1 }, { id: 5, email: 'u@test.com', role_id: 1 });
    const res = makeRes();

    await getVendorRecommendation(req, res);

    expect(res.statusCode).toBe(429);
    expect((res.body as { error: string }).error).toMatch(/rate limit/i);
  });
});

// ── parseVendorRecommendationOutput unit tests ─────────────────────────────────

describe('parseVendorRecommendationOutput — schema validation', () => {
  it('parses valid JSON with grounded vendor IDs', async () => {
    const { parseVendorRecommendationOutput: parseOutput } =
      await import('../src/lib/ai-schemas.js');

    const raw = JSON.stringify({
      summary: 'Advisory summary.',
      advisoryLabel: 'AI advisory only.',
      recommendations: [
        {
          vendorId: 1,
          vendorName: 'Vendor A',
          rank: 1,
          score: 85,
          rationale: 'Top rated vendor.',
          strengths: ['5-star rating'],
          concerns: [],
        },
      ],
    });

    const result = parseOutput(raw, new Set([1, 2]));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.recommendations[0].vendorId).toBe(1);
      expect(result.data.recommendations[0].score).toBe(85);
      expect(result.data.advisoryLabel).toBe('AI advisory only.');
    }
  });

  it('strips markdown fences before parsing', async () => {
    const { parseVendorRecommendationOutput: parseOutput } =
      await import('../src/lib/ai-schemas.js');

    const raw =
      '```json\n' +
      JSON.stringify({
        summary: 'Summary.',
        advisoryLabel: 'Advisory only.',
        recommendations: [
          {
            vendorId: 5,
            vendorName: 'Vendor B',
            rank: 1,
            score: 70,
            rationale: 'Good vendor.',
            strengths: ['Good rating'],
            concerns: ['No contract'],
          },
        ],
      }) +
      '\n```';

    const result = parseOutput(raw, new Set([5]));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.recommendations[0].vendorId).toBe(5);
    }
  });

  it('returns failure for invalid JSON', async () => {
    const { parseVendorRecommendationOutput: parseOutput } =
      await import('../src/lib/ai-schemas.js');

    const result = parseOutput('not valid json', new Set([1]));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.length).toBeGreaterThan(0);
    }
  });

  it('returns failure when recommendations array is missing', async () => {
    const { parseVendorRecommendationOutput: parseOutput } =
      await import('../src/lib/ai-schemas.js');

    const raw = JSON.stringify({ summary: 'No recs here.' });
    const result = parseOutput(raw, new Set([1]));
    expect(result.ok).toBe(false);
  });

  it('filters out hallucinated vendorIds not in the valid set', async () => {
    const { parseVendorRecommendationOutput: parseOutput } =
      await import('../src/lib/ai-schemas.js');

    const raw = JSON.stringify({
      summary: 'Advisory summary.',
      advisoryLabel: 'Advisory only.',
      recommendations: [
        {
          vendorId: 999, // hallucinated
          vendorName: 'Ghost Vendor',
          rank: 1,
          score: 95,
          rationale: 'Invented rationale.',
          strengths: [],
          concerns: [],
        },
        {
          vendorId: 1, // grounded
          vendorName: 'Real Vendor',
          rank: 2,
          score: 75,
          rationale: 'Rated 4/5.',
          strengths: ['Good rating'],
          concerns: [],
        },
      ],
    });

    const result = parseOutput(raw, new Set([1]));
    expect(result.ok).toBe(true);
    if (result.ok) {
      // Only the grounded vendor should remain
      expect(result.data.recommendations).toHaveLength(1);
      expect(result.data.recommendations[0].vendorId).toBe(1);
    }
  });

  it('fails when all recommendations have hallucinated vendorIds', async () => {
    const { parseVendorRecommendationOutput: parseOutput } =
      await import('../src/lib/ai-schemas.js');

    const raw = JSON.stringify({
      summary: 'Advisory summary.',
      advisoryLabel: 'Advisory only.',
      recommendations: [
        {
          vendorId: 999,
          vendorName: 'Ghost Vendor',
          rank: 1,
          score: 95,
          rationale: 'Invented.',
          strengths: [],
          concerns: [],
        },
      ],
    });

    const result = parseOutput(raw, new Set([1, 2, 3]));
    expect(result.ok).toBe(false);
  });

  it('clamps score to 0-100 range', async () => {
    const { parseVendorRecommendationOutput: parseOutput } =
      await import('../src/lib/ai-schemas.js');

    const raw = JSON.stringify({
      summary: 'Summary.',
      advisoryLabel: 'Advisory.',
      recommendations: [
        {
          vendorId: 1,
          vendorName: 'Vendor A',
          rank: 1,
          score: 150, // out of range — should be clamped to 100
          rationale: 'High score vendor.',
          strengths: [],
          concerns: [],
        },
      ],
    });

    const result = parseOutput(raw, new Set([1]));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.recommendations[0].score).toBeLessThanOrEqual(100);
    }
  });

  it('sorts recommendations by rank ascending', async () => {
    const { parseVendorRecommendationOutput: parseOutput } =
      await import('../src/lib/ai-schemas.js');

    const raw = JSON.stringify({
      summary: 'Summary.',
      advisoryLabel: 'Advisory.',
      recommendations: [
        {
          vendorId: 2,
          vendorName: 'B',
          rank: 3,
          score: 50,
          rationale: 'Third.',
          strengths: [],
          concerns: [],
        },
        {
          vendorId: 1,
          vendorName: 'A',
          rank: 1,
          score: 90,
          rationale: 'First.',
          strengths: [],
          concerns: [],
        },
        {
          vendorId: 3,
          vendorName: 'C',
          rank: 2,
          score: 70,
          rationale: 'Second.',
          strengths: [],
          concerns: [],
        },
      ],
    });

    const result = parseOutput(raw, new Set([1, 2, 3]));
    expect(result.ok).toBe(true);
    if (result.ok) {
      const ranks = result.data.recommendations.map((r) => r.rank);
      expect(ranks).toEqual([1, 2, 3]);
    }
  });

  it('uses default advisory label when model omits it', async () => {
    const { parseVendorRecommendationOutput: parseOutput } =
      await import('../src/lib/ai-schemas.js');

    const raw = JSON.stringify({
      summary: 'Summary.',
      // advisoryLabel intentionally omitted
      recommendations: [
        {
          vendorId: 1,
          vendorName: 'A',
          rank: 1,
          score: 80,
          rationale: 'Good.',
          strengths: [],
          concerns: [],
        },
      ],
    });

    const result = parseOutput(raw, new Set([1]));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.advisoryLabel).toMatch(/advisory/i);
    }
  });
});
