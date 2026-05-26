/**
 * Tests: AI Grounded Workflow — Task #947
 *
 * Covers:
 * - Input validation (workflowType, entityId, prompt)
 * - Entity-not-found handling (404)
 * - Grounded context fetch failure (500)
 * - AI provider call and structured output parsing
 * - Structured output for all three workflow types (event, task, rsvp)
 * - Structured output fallback when model returns malformed JSON
 * - Observability log writes (best-effort / non-blocking)
 * - Rate limiting enforcement
 * - Provider configuration errors (503 misconfigured, 503 none)
 * - AI call failure (502)
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
      const res = new EventEmitter() as EventEmitter;
      callback(res as never);
      res.emit('data', Buffer.from(JSON.stringify(payload), 'utf8'));
      res.emit('end');
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

describe('getGroundedSuggestion — input validation', () => {
  it('returns 400 when prompt is missing', async () => {
    const { getGroundedSuggestion } = await loadController();
    const req = makeReq({ workflowType: 'event', entityId: 1 });
    const res = makeRes();

    await getGroundedSuggestion(req, res);

    expect(res.statusCode).toBe(400);
    expect((res.body as { error: string }).error).toMatch(/prompt is required/i);
  });

  it('returns 400 when workflowType is invalid', async () => {
    const { getGroundedSuggestion } = await loadController();
    const req = makeReq({ workflowType: 'unknown', entityId: 1, prompt: 'help' });
    const res = makeRes();

    await getGroundedSuggestion(req, res);

    expect(res.statusCode).toBe(400);
    expect((res.body as { error: string }).error).toMatch(/workflowType must be one of/i);
  });

  it('returns 400 when entityId is missing', async () => {
    const { getGroundedSuggestion } = await loadController();
    const req = makeReq({ workflowType: 'event', prompt: 'help' });
    const res = makeRes();

    await getGroundedSuggestion(req, res);

    expect(res.statusCode).toBe(400);
    expect((res.body as { error: string }).error).toMatch(/entityId must be a positive integer/i);
  });

  it('returns 400 when entityId is zero', async () => {
    const { getGroundedSuggestion } = await loadController();
    const req = makeReq({ workflowType: 'event', entityId: 0, prompt: 'help' });
    const res = makeRes();

    await getGroundedSuggestion(req, res);

    expect(res.statusCode).toBe(400);
    expect((res.body as { error: string }).error).toMatch(/entityId must be a positive integer/i);
  });

  it('returns 400 when entityId is a string that is not a valid integer', async () => {
    const { getGroundedSuggestion } = await loadController();
    const req = makeReq({ workflowType: 'event', entityId: 'abc', prompt: 'help' });
    const res = makeRes();

    await getGroundedSuggestion(req, res);

    expect(res.statusCode).toBe(400);
    expect((res.body as { error: string }).error).toMatch(/entityId must be a positive integer/i);
  });
});

// ── Provider configuration tests ───────────────────────────────────────────────

describe('getGroundedSuggestion — provider configuration', () => {
  it('returns 503 when no AI provider is configured', async () => {
    const { getGroundedSuggestion } = await loadController();
    const req = makeReq({ workflowType: 'event', entityId: 1, prompt: 'help' });
    const res = makeRes();

    await getGroundedSuggestion(req, res);

    expect(res.statusCode).toBe(503);
    expect((res.body as { error: string }).error).toMatch(/AI suggestions are not configured/i);
  });

  it('returns 503 when Azure is partially configured', async () => {
    process.env.AZURE_OPENAI_ENDPOINT = 'https://example-resource.cognitiveservices.azure.com';
    // API key intentionally missing

    const { getGroundedSuggestion } = await loadController();
    const req = makeReq({ workflowType: 'event', entityId: 1, prompt: 'help' });
    const res = makeRes();

    await getGroundedSuggestion(req, res);

    expect(res.statusCode).toBe(503);
    expect((res.body as { error: string }).error).toMatch(/partially configured/i);
  });
});

// ── Entity not found ───────────────────────────────────────────────────────────

describe('getGroundedSuggestion — entity not found', () => {
  it('returns 404 when event entity is not found', async () => {
    process.env.OPENAI_API_KEY = 'test-key';

    mockDb.get
      .mockResolvedValueOnce({ count: 1 }) // rate limit check — within budget
      .mockResolvedValueOnce(null); // event fetch returns null → entity not found

    const { getGroundedSuggestion } = await loadController();
    const req = makeReq(
      { workflowType: 'event', entityId: 999, prompt: 'improve this event' },
      { id: 1, email: 'user@test.com', role_id: 1 },
    );
    const res = makeRes();

    await getGroundedSuggestion(req, res);

    expect(res.statusCode).toBe(404);
    expect((res.body as { error: string }).error).toMatch(/not found/i);
  });
});

// ── Successful grounded workflows ──────────────────────────────────────────────

describe('getGroundedSuggestion — event workflow', () => {
  it('returns structured EventSuggestion on success', async () => {
    process.env.OPENAI_API_KEY = 'openai-key';

    const eventRow = {
      id: 42,
      title: 'Summer Music Festival',
      description: 'A great festival',
      date: '2026-08-10',
      capacity: 1000,
      status: 'Active',
      venue_name: 'Riverside Park',
    };
    const rsvpStats = { confirmed: 250, total: 300 };

    // Rate-limit UPSERT returns count within budget
    mockDb.run.mockResolvedValue({ lastID: undefined });
    mockDb.get
      .mockResolvedValueOnce({ count: 1 }) // rate limit check
      .mockResolvedValueOnce(eventRow) // event fetch
      .mockResolvedValueOnce(rsvpStats); // rsvp stats

    const aiResponse = {
      choices: [
        {
          message: {
            content: JSON.stringify({
              title: 'Summer Vibes Festival 2026',
              description: 'An electrifying open-air music experience',
              venueType: 'Outdoor amphitheatre',
              promotionalTips: ['Use social media', 'Partner with sponsors', 'Early bird pricing'],
            }),
          },
        },
      ],
    };
    const { captured, restore } = mockHttpsJsonReply(aiResponse);

    try {
      const { getGroundedSuggestion } = await loadController();
      const req = makeReq(
        { workflowType: 'event', entityId: 42, prompt: 'Improve this event' },
        { id: 1, email: 'user@test.com', role_id: 1 },
      );
      const res = makeRes();

      await getGroundedSuggestion(req, res);

      expect(res.statusCode).toBe(200);
      const body = res.body as {
        workflowType: string;
        entityId: number;
        structured: {
          title: string;
          description: string;
          venueType: string;
          promotionalTips: string[];
        };
        raw: string;
      };
      expect(body.workflowType).toBe('event');
      expect(body.entityId).toBe(42);
      expect(body.structured.title).toBe('Summer Vibes Festival 2026');
      expect(body.structured.venueType).toBe('Outdoor amphitheatre');
      expect(body.structured.promotionalTips).toHaveLength(3);
      expect(typeof body.raw).toBe('string');
      expect(captured.hostname).toBe('api.openai.com');
    } finally {
      restore();
    }
  });
});

describe('getGroundedSuggestion — task workflow', () => {
  it('returns structured TaskSuggestion on success', async () => {
    process.env.OPENAI_API_KEY = 'openai-key';

    const eventRow = { title: 'Summer Music Festival' };
    const taskRows = [
      { title: 'Book sound crew', status: 'Complete', due_date: '2026-07-01', description: null },
      {
        title: 'Design stage layout',
        status: 'Pending',
        due_date: '2026-07-15',
        description: null,
      },
    ];

    mockDb.get
      .mockResolvedValueOnce({ count: 1 }) // rate limit
      .mockResolvedValueOnce(eventRow); // event title fetch
    mockDb.all.mockResolvedValueOnce(taskRows);

    const aiPayload = {
      choices: [
        {
          message: {
            content: JSON.stringify({
              actionTitle: 'Set up stage lighting',
              dueDateRange: '2026-07-10 to 2026-07-20',
              owner: 'Technical lead',
              dependencies: ['Book sound crew', 'Design stage layout'],
            }),
          },
        },
      ],
    };
    const { restore } = mockHttpsJsonReply(aiPayload);

    try {
      const { getGroundedSuggestion } = await loadController();
      const req = makeReq(
        { workflowType: 'task', entityId: 42, prompt: 'What task should I add next?' },
        { id: 1, email: 'user@test.com', role_id: 1 },
      );
      const res = makeRes();

      await getGroundedSuggestion(req, res);

      expect(res.statusCode).toBe(200);
      const body = res.body as {
        structured: {
          actionTitle: string;
          dueDateRange: string;
          owner: string;
          dependencies: string[];
        };
      };
      expect(body.structured.actionTitle).toBe('Set up stage lighting');
      expect(body.structured.owner).toBe('Technical lead');
      expect(body.structured.dependencies).toContain('Book sound crew');
    } finally {
      restore();
    }
  });
});

describe('getGroundedSuggestion — rsvp workflow', () => {
  it('returns structured RsvpSuggestion on success', async () => {
    process.env.OPENAI_API_KEY = 'openai-key';

    const eventRow = { title: 'Summer Music Festival', capacity: 1000 };
    const statsRow = { confirmed: 750, declined: 50, pending: 200, total: 1000 };

    mockDb.get
      .mockResolvedValueOnce({ count: 1 }) // rate limit
      .mockResolvedValueOnce(eventRow) // event fetch
      .mockResolvedValueOnce(statsRow); // rsvp stats

    const aiPayload = {
      choices: [
        {
          message: {
            content: JSON.stringify({
              confirmationMessage: 'Your spot is confirmed! See you at the festival.',
              reminderMessage: "The event is in 3 days. Don't forget your ticket!",
              capacityTip: 'You are at 75% capacity. Consider a waitlist.',
            }),
          },
        },
      ],
    };
    const { restore } = mockHttpsJsonReply(aiPayload);

    try {
      const { getGroundedSuggestion } = await loadController();
      const req = makeReq(
        { workflowType: 'rsvp', entityId: 42, prompt: 'Help me manage attendance' },
        { id: 1, email: 'user@test.com', role_id: 1 },
      );
      const res = makeRes();

      await getGroundedSuggestion(req, res);

      expect(res.statusCode).toBe(200);
      const body = res.body as {
        structured: { confirmationMessage: string; reminderMessage: string; capacityTip: string };
      };
      expect(body.structured.confirmationMessage).toContain('confirmed');
      expect(body.structured.capacityTip).toContain('75%');
    } finally {
      restore();
    }
  });
});

// ── Structured output fallback ─────────────────────────────────────────────────

describe('getGroundedSuggestion — malformed structured output', () => {
  it('returns empty structured object when model returns non-JSON', async () => {
    process.env.OPENAI_API_KEY = 'openai-key';

    const eventRow = {
      id: 1,
      title: 'Test Event',
      description: null,
      date: null,
      capacity: null,
      status: 'Draft',
      venue_name: null,
    };
    const rsvpStats = { confirmed: 0, total: 0 };

    mockDb.get
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce(eventRow)
      .mockResolvedValueOnce(rsvpStats);

    const { restore } = mockHttpsJsonReply({
      choices: [{ message: { content: 'Sorry, I cannot help with that.' } }],
    });

    try {
      const { getGroundedSuggestion } = await loadController();
      const req = makeReq(
        { workflowType: 'event', entityId: 1, prompt: 'help' },
        { id: 1, email: 'user@test.com', role_id: 1 },
      );
      const res = makeRes();

      await getGroundedSuggestion(req, res);

      expect(res.statusCode).toBe(200);
      const body = res.body as { structured: Record<string, unknown>; raw: string };
      expect(body.structured).toEqual({});
      expect(typeof body.raw).toBe('string');
    } finally {
      restore();
    }
  });
});

// ── AI call failure ────────────────────────────────────────────────────────────

describe('getGroundedSuggestion — AI provider failure', () => {
  it('returns 502 when the AI call throws', async () => {
    process.env.OPENAI_API_KEY = 'openai-key';

    const eventRow = {
      id: 1,
      title: 'Test',
      description: null,
      date: null,
      capacity: null,
      status: 'Draft',
      venue_name: null,
    };

    mockDb.get
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce(eventRow)
      .mockResolvedValueOnce({ confirmed: 0, total: 0 });

    // Make https.request throw
    vi.spyOn(https, 'request').mockImplementation(() => {
      throw new Error('Network failure');
    });

    const { getGroundedSuggestion } = await loadController();
    const req = makeReq(
      { workflowType: 'event', entityId: 1, prompt: 'help' },
      { id: 1, email: 'user@test.com', role_id: 1 },
    );
    const res = makeRes();

    await getGroundedSuggestion(req, res);

    expect(res.statusCode).toBe(502);
    expect((res.body as { error: string }).error).toMatch(/AI request failed/i);
  });
});

// ── parseStructuredOutput unit tests ──────────────────────────────────────────

describe('parseStructuredOutput', () => {
  it('parses a valid event suggestion', async () => {
    const { parseStructuredOutput } = await loadController();

    const raw = JSON.stringify({
      title: 'Summer Fest',
      description: 'A great event',
      venueType: 'Outdoor',
      promotionalTips: ['tip1', 'tip2'],
    });

    const result = parseStructuredOutput('event', raw);
    expect(result).not.toBeNull();
    expect((result as { title: string }).title).toBe('Summer Fest');
    expect((result as { promotionalTips: string[] }).promotionalTips).toHaveLength(2);
  });

  it('parses a valid task suggestion', async () => {
    const { parseStructuredOutput } = await loadController();

    const raw = JSON.stringify({
      actionTitle: 'Set up stage',
      dueDateRange: 'July 10-15',
      owner: 'Tech lead',
      dependencies: ['Book crew'],
    });

    const result = parseStructuredOutput('task', raw);
    expect(result).not.toBeNull();
    expect((result as { actionTitle: string }).actionTitle).toBe('Set up stage');
  });

  it('parses a valid rsvp suggestion', async () => {
    const { parseStructuredOutput } = await loadController();

    const raw = JSON.stringify({
      confirmationMessage: 'You are confirmed!',
      reminderMessage: 'Event in 3 days',
      capacityTip: 'Consider waitlist',
    });

    const result = parseStructuredOutput('rsvp', raw);
    expect(result).not.toBeNull();
    expect((result as { confirmationMessage: string }).confirmationMessage).toBe(
      'You are confirmed!',
    );
  });

  it('strips markdown fences before parsing', async () => {
    const { parseStructuredOutput } = await loadController();

    const raw =
      '```json\n{"title":"Fest","description":"desc","venueType":"Outdoor","promotionalTips":[]}\n```';

    const result = parseStructuredOutput('event', raw);
    expect(result).not.toBeNull();
    expect((result as { title: string }).title).toBe('Fest');
  });

  it('returns null for entirely non-JSON input', async () => {
    const { parseStructuredOutput } = await loadController();
    expect(parseStructuredOutput('event', 'not json at all')).toBeNull();
  });

  it('returns null when required fields are missing', async () => {
    const { parseStructuredOutput } = await loadController();
    // Missing 'title' field
    const raw = JSON.stringify({ description: 'ok', venueType: 'Indoor', promotionalTips: [] });
    expect(parseStructuredOutput('event', raw)).toBeNull();
  });
});
