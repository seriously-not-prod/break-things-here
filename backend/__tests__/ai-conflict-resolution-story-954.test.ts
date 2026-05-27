/**
 * Tests: AI Timeline Conflict Resolution Suggestions — Story #954
 *
 * Covers:
 * - Input validation (missing eventId, non-positive, non-integer eventId)
 * - Provider configuration errors (503 none, 503 partial Azure)
 * - Entity not found (404)
 * - Conflict-free event (empty suggestions, no AI hallucination)
 * - Conflict-heavy event (suggestions grounded in real data)
 * - Hallucination prevention (activityIds not in grounded set are dropped)
 * - Dependency and resource impact notes present in output
 * - Advisory-only label always present
 * - AI provider failure (502)
 * - Rate limit enforcement (429)
 * - parseConflictResolutionOutput unit tests:
 *   valid JSON, markdown fences, invalid JSON, missing fields,
 *   hallucinated activity IDs filtered out, conflict-free inputs
 */

import { EventEmitter } from 'node:events';
import https from 'https';
import type { Request, Response } from 'express';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  parseConflictResolutionOutput,
} from '../src/lib/ai-schemas.js';

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

// ── Sample timeline activity data ─────────────────────────────────────────────

const conflictFreeActivities = [
  {
    id: 1,
    title: 'Setup',
    start_time: '2026-06-01T08:00:00Z',
    end_time: '2026-06-01T09:00:00Z',
    planned_start_time: null,
    planned_end_time: null,
    sort_order: 1,
    vendor_id: null,
    location: 'Main Stage',
    buffer_before_mins: 0,
    buffer_after_mins: 0,
  },
  {
    id: 2,
    title: 'Opening Act',
    start_time: '2026-06-01T10:00:00Z',
    end_time: '2026-06-01T11:00:00Z',
    planned_start_time: null,
    planned_end_time: null,
    sort_order: 2,
    vendor_id: null,
    location: 'Main Stage',
    buffer_before_mins: 0,
    buffer_after_mins: 0,
  },
];

const conflictActivities = [
  {
    id: 10,
    title: 'Sound Check',
    start_time: '2026-06-01T10:00:00Z',
    end_time: '2026-06-01T11:00:00Z',
    planned_start_time: null,
    planned_end_time: null,
    sort_order: 1,
    vendor_id: 5,
    location: 'Main Stage',
    buffer_before_mins: 0,
    buffer_after_mins: 30,
  },
  {
    id: 11,
    title: 'Main Show',
    start_time: '2026-06-01T10:30:00Z',
    end_time: '2026-06-01T12:00:00Z',
    planned_start_time: null,
    planned_end_time: null,
    sort_order: 2,
    vendor_id: 5,
    location: 'Main Stage',
    buffer_before_mins: 0,
    buffer_after_mins: 0,
  },
  {
    id: 12,
    title: 'Backstage Prep',
    start_time: '2026-06-01T10:15:00Z',
    end_time: '2026-06-01T11:30:00Z',
    planned_start_time: null,
    planned_end_time: null,
    sort_order: 3,
    vendor_id: null,
    location: null,
    buffer_before_mins: 0,
    buffer_after_mins: 0,
  },
];

const validConflictResponseJson = JSON.stringify({
  summary: 'Two conflicts detected: Sound Check overlaps with Main Show and Backstage Prep.',
  conflictCount: 2,
  advisoryLabel:
    'AI advisory only — suggestions are based solely on detected timeline conflict data. Review each proposal carefully before making any scheduling changes.',
  suggestions: [
    {
      activityAId: 10,
      activityATitle: 'Sound Check',
      activityBId: 11,
      activityBTitle: 'Main Show',
      reason: 'resource_double_book',
      suggestion:
        'Consider moving Sound Check to 09:00-10:00 to avoid overlapping with Main Show.',
      dependencyImpact: 'Sound Check must complete before Main Show begins.',
      resourceImpact:
        'Both activities share vendor 5 and Main Stage; rescheduling frees the shared resource.',
      alternativeSlots: ['09:00-10:00', '07:30-08:30'],
    },
    {
      activityAId: 10,
      activityATitle: 'Sound Check',
      activityBId: 12,
      activityBTitle: 'Backstage Prep',
      reason: 'overlap',
      suggestion: 'Consider moving Backstage Prep to start after Sound Check ends at 11:00.',
      dependencyImpact: 'Backstage Prep has no shared dependencies.',
      resourceImpact: 'No shared resource; schedule adjustment is straightforward.',
      alternativeSlots: ['11:00-12:15'],
    },
  ],
});

// ── Controller tests ──────────────────────────────────────────────────────────

describe('getConflictResolutionSuggestions controller', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearAiEnv();
    mockDb.run.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns 400 when eventId is missing', async () => {
    const ctrl = await loadController();
    const res = makeRes();
    await ctrl.getConflictResolutionSuggestions(makeReq({}), res);
    expect(res.statusCode).toBe(400);
    expect((res.body as { error: string }).error).toMatch(/eventId/);
  });

  it('returns 400 when eventId is zero', async () => {
    const ctrl = await loadController();
    const res = makeRes();
    await ctrl.getConflictResolutionSuggestions(makeReq({ eventId: 0 }), res);
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 when eventId is negative', async () => {
    const ctrl = await loadController();
    const res = makeRes();
    await ctrl.getConflictResolutionSuggestions(makeReq({ eventId: -1 }), res);
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 when eventId is a non-integer float', async () => {
    const ctrl = await loadController();
    const res = makeRes();
    await ctrl.getConflictResolutionSuggestions(makeReq({ eventId: 1.5 }), res);
    expect(res.statusCode).toBe(400);
  });

  it('returns 503 when no AI provider is configured', async () => {
    const ctrl = await loadController();
    const res = makeRes();
    await ctrl.getConflictResolutionSuggestions(makeReq({ eventId: 1 }), res);
    expect(res.statusCode).toBe(503);
    expect((res.body as { error: string }).error).toMatch(/not configured/i);
  });

  it('returns 503 when Azure is partially configured', async () => {
    process.env.AZURE_OPENAI_ENDPOINT = 'https://test.openai.azure.com';
    const ctrl = await loadController();
    const res = makeRes();
    await ctrl.getConflictResolutionSuggestions(makeReq({ eventId: 1 }), res);
    expect(res.statusCode).toBe(503);
    expect((res.body as { error: string }).error).toMatch(/partially configured/i);
  });

  it('returns 429 when rate limit is exceeded', async () => {
    process.env.OPENAI_API_KEY = 'sk-test';
    mockDb.get.mockResolvedValueOnce({ count: 21 }); // rate limit row
    const ctrl = await loadController();
    const res = makeRes();
    await ctrl.getConflictResolutionSuggestions(
      makeReq({ eventId: 1 }, { id: 42, email: 'u@e.com', role_id: 1 }),
      res,
    );
    expect(res.statusCode).toBe(429);
  });

  it('returns 404 when event not found', async () => {
    process.env.OPENAI_API_KEY = 'sk-test';
    mockDb.get
      .mockResolvedValueOnce({ count: 1 }) // rate limit
      .mockResolvedValueOnce(null); // event lookup
    const ctrl = await loadController();
    const res = makeRes();
    await ctrl.getConflictResolutionSuggestions(
      makeReq({ eventId: 99 }, { id: 1, email: 'u@e.com', role_id: 1 }),
      res,
    );
    expect(res.statusCode).toBe(404);
  });

  it('returns conflict-free response with empty suggestions when no conflicts exist', async () => {
    process.env.OPENAI_API_KEY = 'sk-test';
    mockDb.get
      .mockResolvedValueOnce({ count: 1 }) // rate limit
      .mockResolvedValueOnce({ title: 'Summer Fest' }); // event
    mockDb.all.mockResolvedValueOnce(conflictFreeActivities); // activities

    const noConflictResponse = JSON.stringify({
      summary: 'No conflicts detected for this event.',
      conflictCount: 0,
      advisoryLabel:
        'AI advisory only — suggestions are based solely on detected timeline conflict data.',
      suggestions: [],
    });

    const { restore } = mockHttpsJsonReply({
      choices: [{ message: { content: noConflictResponse } }],
    });

    const ctrl = await loadController();
    const res = makeRes();
    await ctrl.getConflictResolutionSuggestions(
      makeReq({ eventId: 1 }, { id: 1, email: 'u@e.com', role_id: 1 }),
      res,
    );
    restore();

    expect(res.statusCode).toBe(200);
    const body = res.body as {
      workflowType: string;
      conflictCount: number;
      suggestions: unknown[];
      advisoryLabel: string;
    };
    expect(body.workflowType).toBe('conflict-resolution');
    expect(body.conflictCount).toBe(0);
    expect(body.suggestions).toHaveLength(0);
    expect(body.advisoryLabel).toBeTruthy();
  });

  it('returns grounded suggestions for conflict-heavy inputs', async () => {
    process.env.OPENAI_API_KEY = 'sk-test';
    mockDb.get
      .mockResolvedValueOnce({ count: 1 }) // rate limit
      .mockResolvedValueOnce({ title: 'Summer Fest' }); // event
    mockDb.all.mockResolvedValueOnce(conflictActivities); // activities

    const { restore } = mockHttpsJsonReply({
      choices: [{ message: { content: validConflictResponseJson } }],
    });

    const ctrl = await loadController();
    const res = makeRes();
    await ctrl.getConflictResolutionSuggestions(
      makeReq({ eventId: 1 }, { id: 1, email: 'u@e.com', role_id: 1 }),
      res,
    );
    restore();

    expect(res.statusCode).toBe(200);
    const body = res.body as {
      workflowType: string;
      eventId: number;
      eventTitle: string;
      conflictCount: number;
      suggestions: Array<{
        activityAId: number;
        activityBId: number;
        reason: string;
        suggestion: string;
        dependencyImpact: string;
        resourceImpact: string;
        alternativeSlots: string[];
        conflictId: string;
      }>;
      advisoryLabel: string;
      contextSummary: { activityCount: number; groundedConflicts: number };
    };
    expect(body.workflowType).toBe('conflict-resolution');
    expect(body.eventId).toBe(1);
    expect(body.eventTitle).toBe('Summer Fest');
    expect(body.conflictCount).toBeGreaterThan(0);
    expect(body.suggestions.length).toBeGreaterThan(0);
    expect(body.advisoryLabel).toBeTruthy();

    const first = body.suggestions[0];
    expect(first.activityAId).toBe(10);
    expect(first.activityBId).toBe(11);
    expect(first.suggestion).toBeTruthy();
    expect(first.dependencyImpact).toBeTruthy();
    expect(first.resourceImpact).toBeTruthy();
    expect(first.alternativeSlots).toBeInstanceOf(Array);
    expect(first.conflictId).toBe('10-11');
  });

  it('drops suggestions with hallucinated activity IDs', async () => {
    process.env.OPENAI_API_KEY = 'sk-test';
    mockDb.get
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ title: 'Summer Fest' });
    mockDb.all.mockResolvedValueOnce(conflictActivities);

    const hallucinatedResponse = JSON.stringify({
      summary: 'Conflicts with hallucinated activity.',
      conflictCount: 1,
      advisoryLabel: 'AI advisory only.',
      suggestions: [
        {
          activityAId: 999, // NOT in grounded set
          activityATitle: 'Fake Activity',
          activityBId: 11,
          activityBTitle: 'Main Show',
          reason: 'overlap',
          suggestion: 'Move fake activity.',
          dependencyImpact: 'None.',
          resourceImpact: 'None.',
          alternativeSlots: [],
        },
        {
          activityAId: 10,
          activityATitle: 'Sound Check',
          activityBId: 11,
          activityBTitle: 'Main Show',
          reason: 'resource_double_book',
          suggestion: 'Move Sound Check earlier.',
          dependencyImpact: 'Must finish before Main Show.',
          resourceImpact: 'Frees shared vendor and stage.',
          alternativeSlots: ['09:00-10:00'],
        },
      ],
    });

    const { restore } = mockHttpsJsonReply({
      choices: [{ message: { content: hallucinatedResponse } }],
    });

    const ctrl = await loadController();
    const res = makeRes();
    await ctrl.getConflictResolutionSuggestions(
      makeReq({ eventId: 1 }, { id: 1, email: 'u@e.com', role_id: 1 }),
      res,
    );
    restore();

    expect(res.statusCode).toBe(200);
    const body = res.body as { suggestions: Array<{ activityAId: number }> };
    // The hallucinated ID 999 suggestion is dropped; only grounded ID 10 remains.
    expect(body.suggestions).toHaveLength(1);
    expect(body.suggestions[0].activityAId).toBe(10);
  });

  it('returns 502 when AI provider call fails', async () => {
    process.env.OPENAI_API_KEY = 'sk-test';
    mockDb.get
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ title: 'Summer Fest' });
    mockDb.all.mockResolvedValueOnce(conflictActivities);

    vi.spyOn(https, 'request').mockImplementation((_, callback) => {
      const req = new EventEmitter() as EventEmitter & {
        write: (chunk: string) => void;
        end: () => void;
      };
      req.write = () => undefined;
      req.end = () => {
        const resEmitter = new EventEmitter();
        callback(resEmitter as never);
        resEmitter.emit('data', Buffer.from(JSON.stringify({ error: { message: 'quota exceeded' } })));
        resEmitter.emit('end');
      };
      return req as never;
    });

    const ctrl = await loadController();
    const res = makeRes();
    await ctrl.getConflictResolutionSuggestions(
      makeReq({ eventId: 1 }, { id: 1, email: 'u@e.com', role_id: 1 }),
      res,
    );

    expect(res.statusCode).toBe(502);
    expect((res.body as { error: string }).error).toMatch(/quota exceeded/i);
  });

  it('advisory label is always present in the response', async () => {
    process.env.OPENAI_API_KEY = 'sk-test';
    mockDb.get
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ title: 'Summer Fest' });
    mockDb.all.mockResolvedValueOnce(conflictFreeActivities);

    const { restore } = mockHttpsJsonReply({
      choices: [{ message: { content: 'not valid json at all' } }],
    });

    const ctrl = await loadController();
    const res = makeRes();
    await ctrl.getConflictResolutionSuggestions(
      makeReq({ eventId: 1 }, { id: 1, email: 'u@e.com', role_id: 1 }),
      res,
    );
    restore();

    expect(res.statusCode).toBe(200);
    const body = res.body as { advisoryLabel: string };
    expect(body.advisoryLabel).toBeTruthy();
    expect(body.advisoryLabel.toLowerCase()).toMatch(/advisory/);
  });

  it('accepts a string eventId (coerces to integer)', async () => {
    process.env.OPENAI_API_KEY = 'sk-test';
    mockDb.get
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ title: 'Summer Fest' });
    mockDb.all.mockResolvedValueOnce([]);

    const { restore } = mockHttpsJsonReply({
      choices: [{ message: { content: JSON.stringify({
        summary: 'No conflicts.',
        conflictCount: 0,
        advisoryLabel: 'AI advisory only.',
        suggestions: [],
      }) } }],
    });

    const ctrl = await loadController();
    const res = makeRes();
    await ctrl.getConflictResolutionSuggestions(
      makeReq({ eventId: '1' as unknown as number }, { id: 1, email: 'u@e.com', role_id: 1 }),
      res,
    );
    restore();

    expect(res.statusCode).toBe(200);
  });
});

// ── parseConflictResolutionOutput unit tests ──────────────────────────────────

describe('parseConflictResolutionOutput', () => {
  const validIds = new Set([10, 11, 12]);

  it('parses valid JSON with grounded suggestions', () => {
    const result = parseConflictResolutionOutput(validConflictResponseJson, validIds);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.suggestions).toHaveLength(2);
    expect(result.data.conflictCount).toBe(2);
    expect(result.data.advisoryLabel).toBeTruthy();
    expect(result.data.suggestions[0].conflictId).toBe('10-11');
  });

  it('parses JSON wrapped in markdown fences', () => {
    const wrapped = '```json\n' + validConflictResponseJson + '\n```';
    const result = parseConflictResolutionOutput(wrapped, validIds);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.suggestions.length).toBeGreaterThan(0);
  });

  it('returns ok with empty suggestions for conflict-free inputs', () => {
    const raw = JSON.stringify({
      summary: 'No conflicts.',
      conflictCount: 0,
      advisoryLabel: 'AI advisory only.',
      suggestions: [],
    });
    const result = parseConflictResolutionOutput(raw, new Set([1, 2]));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.suggestions).toHaveLength(0);
    expect(result.data.conflictCount).toBe(0);
  });

  it('returns error for invalid JSON', () => {
    const result = parseConflictResolutionOutput('not json', validIds);
    expect(result.ok).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('returns error when suggestions is not an array', () => {
    const result = parseConflictResolutionOutput(
      JSON.stringify({ summary: 'test', suggestions: 'oops' }),
      validIds,
    );
    expect(result.ok).toBe(false);
    expect(result.errors[0].field).toBe('suggestions');
  });

  it('drops suggestions with hallucinated activity IDs', () => {
    const raw = JSON.stringify({
      summary: 'Conflicts',
      conflictCount: 1,
      advisoryLabel: 'Advisory.',
      suggestions: [
        {
          activityAId: 999, // not in validIds
          activityATitle: 'Ghost',
          activityBId: 11,
          activityBTitle: 'Main Show',
          reason: 'overlap',
          suggestion: 'Move ghost activity.',
          dependencyImpact: '',
          resourceImpact: '',
          alternativeSlots: [],
        },
      ],
    });
    const result = parseConflictResolutionOutput(raw, validIds);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.suggestions).toHaveLength(0);
  });

  it('drops suggestions with missing suggestion text', () => {
    const raw = JSON.stringify({
      summary: 'Conflicts',
      conflictCount: 1,
      advisoryLabel: 'Advisory.',
      suggestions: [
        {
          activityAId: 10,
          activityATitle: 'Sound Check',
          activityBId: 11,
          activityBTitle: 'Main Show',
          reason: 'overlap',
          suggestion: '', // empty — should be dropped
          dependencyImpact: '',
          resourceImpact: '',
          alternativeSlots: [],
        },
      ],
    });
    const result = parseConflictResolutionOutput(raw, validIds);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.suggestions).toHaveLength(0);
  });

  it('uses fallback advisory label when not provided', () => {
    const raw = JSON.stringify({
      summary: 'Conflicts',
      conflictCount: 1,
      suggestions: [
        {
          activityAId: 10,
          activityATitle: 'Sound Check',
          activityBId: 11,
          activityBTitle: 'Main Show',
          reason: 'overlap',
          suggestion: 'Shift Sound Check earlier.',
          dependencyImpact: '',
          resourceImpact: '',
          alternativeSlots: [],
        },
      ],
    });
    const result = parseConflictResolutionOutput(raw, validIds);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.advisoryLabel).toMatch(/advisory/i);
  });

  it('defaults conflictCount to suggestions length when not provided', () => {
    const raw = JSON.stringify({
      summary: 'Conflicts',
      advisoryLabel: 'Advisory.',
      suggestions: [
        {
          activityAId: 10,
          activityATitle: 'Sound Check',
          activityBId: 11,
          activityBTitle: 'Main Show',
          reason: 'overlap',
          suggestion: 'Shift Sound Check earlier.',
          dependencyImpact: '',
          resourceImpact: '',
          alternativeSlots: [],
        },
      ],
    });
    const result = parseConflictResolutionOutput(raw, validIds);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.conflictCount).toBe(1);
  });

  it('builds conflictId as "activityAId-activityBId"', () => {
    const raw = JSON.stringify({
      summary: 'Conflicts',
      conflictCount: 1,
      advisoryLabel: 'Advisory.',
      suggestions: [
        {
          activityAId: 10,
          activityATitle: 'Sound Check',
          activityBId: 12,
          activityBTitle: 'Backstage Prep',
          reason: 'adjacent_no_buffer',
          suggestion: 'Add a 30-min buffer.',
          dependencyImpact: 'Backstage Prep needs to start after buffer.',
          resourceImpact: 'No shared resource.',
          alternativeSlots: ['11:30-12:00'],
        },
      ],
    });
    const result = parseConflictResolutionOutput(raw, validIds);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.suggestions[0].conflictId).toBe('10-12');
  });

  it('handles string activityAId / activityBId (coerced to int)', () => {
    const raw = JSON.stringify({
      summary: 'Conflicts',
      conflictCount: 1,
      advisoryLabel: 'Advisory.',
      suggestions: [
        {
          activityAId: '10',
          activityATitle: 'Sound Check',
          activityBId: '11',
          activityBTitle: 'Main Show',
          reason: 'overlap',
          suggestion: 'Shift Sound Check earlier.',
          dependencyImpact: '',
          resourceImpact: '',
          alternativeSlots: [],
        },
      ],
    });
    const result = parseConflictResolutionOutput(raw, validIds);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.suggestions).toHaveLength(1);
    expect(result.data.suggestions[0].activityAId).toBe(10);
  });
});
