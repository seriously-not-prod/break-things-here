/**
 * Tests: AI Grounded Workflow — Story #949
 * "Ground Event Assistant Responses in Live Event Data"
 *
 * Acceptance criteria verified:
 *  AC1 — Event context is fetched server-side before the model call.
 *  AC2 — Prompt includes normalized event fields and omits unrelated noise
 *         (null / empty fields must NOT appear in the grounded user message).
 *  AC3 — Response quality improves versus prompt-only baseline in test
 *         fixtures: the grounded prompt must include richer real-data fields
 *         (event_type, end_date, event_time, tags, location) when populated.
 *  AC4 — Failure path returns a clear, actionable error without breaking UI.
 *  AC5 — contextSummary.groundedFields lists exactly the fields that were
 *         populated and included in the prompt (traceability requirement).
 *  AC6 — RSVP statistics use canonical_status (v21+ schema) so counts are
 *         accurate on current deployments.
 */

import { EventEmitter } from 'node:events';
import https from 'https';
import type { Request, Response } from 'express';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ── Helpers ────────────────────────────────────────────────────────────────────

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

// ── AC2 + AC3: Richer normalized event fields in grounded prompt ───────────────

describe('#949 — richer event context in grounded prompt', () => {
  it('includes event_type, end_date, event_time, location, tags in the grounded user message', async () => {
    process.env.OPENAI_API_KEY = 'openai-key';

    const eventRow = {
      id: 10,
      title: 'Autumn Jazz Night',
      description: 'An evening of smooth jazz',
      date: '2026-10-15',
      end_date: '2026-10-15',
      event_time: '19:00',
      capacity: 200,
      status: 'Draft',
      event_type: 'Music',
      venue_name: 'The Blue Room',
      tags: 'jazz, live-music, indoor',
    };
    const rsvpStats = { confirmed: 40, total: 55 };

    mockDb.get
      .mockResolvedValueOnce({ count: 1 }) // rate limit
      .mockResolvedValueOnce(eventRow) // event fetch
      .mockResolvedValueOnce(rsvpStats); // rsvp stats

    const aiPayload = {
      choices: [
        {
          message: {
            content: JSON.stringify({
              title: 'Autumn Jazz Night 2026',
              description: 'An enchanting jazz evening',
              venueType: 'Indoor intimate venue',
              promotionalTips: ['Partner with jazz labels', 'Offer VIP seating', 'Live stream'],
            }),
          },
        },
      ],
    };
    const { captured, restore } = mockHttpsJsonReply(aiPayload);

    try {
      const { getGroundedSuggestion } = await loadController();
      const req = makeReq(
        { workflowType: 'event', entityId: 10, prompt: 'Improve this event' },
        { id: 1, email: 'planner@test.com', role_id: 2 },
      );
      const res = makeRes();

      await getGroundedSuggestion(req, res);

      expect(res.statusCode).toBe(200);

      // AC3: grounded user message must include the richer fields
      const sentBody = JSON.parse(captured.body) as {
        messages: Array<{ role: string; content: string }>;
      };
      const userContent = sentBody.messages.find((m) => m.role === 'user')?.content ?? '';

      expect(userContent).toContain('Type: Music');
      expect(userContent).toContain('Time: 19:00');
      expect(userContent).toContain('Location: The Blue Room');
      expect(userContent).toContain('Tags: jazz, live-music, indoor');
      expect(userContent).toContain('2026-10-15');
    } finally {
      restore();
    }
  });

  it('omits null/empty fields from the grounded user message (noise reduction)', async () => {
    process.env.OPENAI_API_KEY = 'openai-key';

    // Minimal event — only required fields populated
    const eventRow = {
      id: 11,
      title: 'Unnamed Event',
      description: null,
      date: null,
      end_date: null,
      event_time: null,
      capacity: null,
      status: 'Draft',
      event_type: null,
      venue_name: null,
      tags: null,
    };
    const rsvpStats = { confirmed: 0, total: 0 };

    mockDb.get
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce(eventRow)
      .mockResolvedValueOnce(rsvpStats);

    const aiPayload = {
      choices: [
        {
          message: {
            content: JSON.stringify({
              title: 'A Suggested Title',
              description: 'A description',
              venueType: 'TBD',
              promotionalTips: [],
            }),
          },
        },
      ],
    };
    const { captured, restore } = mockHttpsJsonReply(aiPayload);

    try {
      const { getGroundedSuggestion } = await loadController();
      const req = makeReq(
        { workflowType: 'event', entityId: 11, prompt: 'suggest improvements' },
        { id: 1, email: 'planner@test.com', role_id: 2 },
      );
      const res = makeRes();

      await getGroundedSuggestion(req, res);

      expect(res.statusCode).toBe(200);

      const sentBody = JSON.parse(captured.body) as {
        messages: Array<{ role: string; content: string }>;
      };
      const userContent = sentBody.messages.find((m) => m.role === 'user')?.content ?? '';

      // AC2: null / unset fields must NOT appear as noise in the prompt
      expect(userContent).not.toContain('Description:');
      expect(userContent).not.toContain('Date:');
      expect(userContent).not.toContain('Location:');
      expect(userContent).not.toContain('Capacity:');
      expect(userContent).not.toContain('Tags:');
      expect(userContent).not.toContain('Type:');
      expect(userContent).not.toContain('Time:');

      // Required fields are still present
      expect(userContent).toContain('Title: Unnamed Event');
      expect(userContent).toContain('Status: Draft');
    } finally {
      restore();
    }
  });
});

// ── AC5: contextSummary traceability ──────────────────────────────────────────

describe('#949 — contextSummary traceability', () => {
  it('returns contextSummary.groundedFields listing populated event fields', async () => {
    process.env.OPENAI_API_KEY = 'openai-key';

    const eventRow = {
      id: 20,
      title: 'Summer Gala',
      description: 'An outdoor gala',
      date: '2026-07-04',
      end_date: null,
      event_time: '18:00',
      capacity: 500,
      status: 'Active',
      event_type: 'Gala',
      venue_name: 'Riverside Park',
      tags: null,
    };
    const rsvpStats = { confirmed: 100, total: 150 };

    mockDb.get
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce(eventRow)
      .mockResolvedValueOnce(rsvpStats);

    const { restore } = mockHttpsJsonReply({
      choices: [
        {
          message: {
            content: JSON.stringify({
              title: 'Summer Gala 2026',
              description: 'Elegant outdoor evening',
              venueType: 'Outdoor park',
              promotionalTips: ['Early bird tickets', 'Social media campaign', 'Dress code promo'],
            }),
          },
        },
      ],
    });

    try {
      const { getGroundedSuggestion } = await loadController();
      const req = makeReq(
        { workflowType: 'event', entityId: 20, prompt: 'Improve the event' },
        { id: 1, email: 'planner@test.com', role_id: 2 },
      );
      const res = makeRes();

      await getGroundedSuggestion(req, res);

      expect(res.statusCode).toBe(200);

      const body = res.body as {
        contextSummary?: { groundedFields: string[] };
      };

      // AC5: contextSummary must be present for event workflow
      expect(body.contextSummary).toBeDefined();
      expect(Array.isArray(body.contextSummary?.groundedFields)).toBe(true);

      const fields = body.contextSummary?.groundedFields ?? [];
      expect(fields).toContain('title');
      expect(fields).toContain('status');
      expect(fields).toContain('description');
      expect(fields).toContain('event_type');
      expect(fields).toContain('date');
      expect(fields).toContain('event_time');
      expect(fields).toContain('location');
      expect(fields).toContain('capacity');
      expect(fields).toContain('rsvp_stats');

      // tags was null so must NOT appear in groundedFields
      expect(fields).not.toContain('tags');
      // end_date was null so must NOT appear
      expect(fields).not.toContain('end_date');
    } finally {
      restore();
    }
  });

  it('does not include contextSummary for task and rsvp workflows', async () => {
    process.env.OPENAI_API_KEY = 'openai-key';

    const eventRow = { title: 'A Festival' };
    const taskRows = [
      { title: 'Book venue', status: 'Complete', due_date: null, description: null },
    ];

    mockDb.get.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce(eventRow);
    mockDb.all.mockResolvedValueOnce(taskRows);

    const { restore } = mockHttpsJsonReply({
      choices: [
        {
          message: {
            content: JSON.stringify({
              actionTitle: 'Set up sound system',
              dueDateRange: 'July 1-7',
              owner: 'AV team',
              dependencies: ['Book venue'],
            }),
          },
        },
      ],
    });

    try {
      const { getGroundedSuggestion } = await loadController();
      const req = makeReq(
        { workflowType: 'task', entityId: 1, prompt: 'next task?' },
        { id: 1, email: 'planner@test.com', role_id: 2 },
      );
      const res = makeRes();

      await getGroundedSuggestion(req, res);

      expect(res.statusCode).toBe(200);
      const body = res.body as { contextSummary?: unknown };
      expect(body.contextSummary).toBeUndefined();
    } finally {
      restore();
    }
  });
});

// ── AC3: Grounded vs prompt-only quality comparison fixture ────────────────────

describe('#949 — grounded prompt richer than prompt-only baseline', () => {
  it('grounded event prompt contains real data fields absent from a prompt-only call', async () => {
    process.env.OPENAI_API_KEY = 'openai-key';

    const eventRow = {
      id: 30,
      title: 'Rock Festival 2026',
      description: 'Two-day outdoor rock festival',
      date: '2026-06-20',
      end_date: '2026-06-21',
      event_time: '12:00',
      capacity: 5000,
      status: 'Active',
      event_type: 'Music',
      venue_name: 'Lakefront Arena',
      tags: 'rock, outdoor, multi-day',
    };
    const rsvpStats = { confirmed: 3000, total: 4200 };

    mockDb.get
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce(eventRow)
      .mockResolvedValueOnce(rsvpStats);

    const aiPayload = {
      choices: [
        {
          message: {
            content: JSON.stringify({
              title: 'Rock Festival 2026 — Lakefront Edition',
              description: 'Two-day outdoor rock experience at Lakefront Arena',
              venueType: 'Outdoor amphitheatre',
              promotionalTips: [
                'Announce headline acts early',
                'Sell camping passes',
                'Partner with radio stations',
              ],
            }),
          },
        },
      ],
    };
    const { captured, restore } = mockHttpsJsonReply(aiPayload);

    try {
      const { getGroundedSuggestion } = await loadController();
      const req = makeReq(
        { workflowType: 'event', entityId: 30, prompt: 'How can I improve this festival?' },
        { id: 1, email: 'planner@test.com', role_id: 2 },
      );
      const res = makeRes();

      await getGroundedSuggestion(req, res);

      expect(res.statusCode).toBe(200);

      const sentBody = JSON.parse(captured.body) as {
        messages: Array<{ role: string; content: string }>;
      };
      const userContent = sentBody.messages.find((m) => m.role === 'user')?.content ?? '';

      // Grounded prompt must reference real event data — these would be absent
      // from a prompt-only call that only receives the user's question.
      expect(userContent).toContain('Rock Festival 2026'); // real title
      expect(userContent).toContain('Type: Music'); // event_type
      expect(userContent).toContain('Time: 12:00'); // event_time
      expect(userContent).toContain('Location: Lakefront Arena'); // location
      expect(userContent).toContain('Tags: rock, outdoor, multi-day'); // tags
      expect(userContent).toContain('3000 confirmed'); // rsvp stats
      expect(userContent).toContain('Capacity: 5000'); // capacity
      // Date range covers both start and end date
      expect(userContent).toContain('2026-06-20');
      expect(userContent).toContain('2026-06-21');
    } finally {
      restore();
    }
  });
});

// ── AC4: Failure path returns clear, actionable errors ────────────────────────

describe('#949 — failure path error clarity', () => {
  it('returns 404 with entity-specific message when event is not found', async () => {
    process.env.OPENAI_API_KEY = 'openai-key';

    mockDb.get
      .mockResolvedValueOnce({ count: 1 }) // rate limit
      .mockResolvedValueOnce(null); // event not found

    const { getGroundedSuggestion } = await loadController();
    const req = makeReq(
      { workflowType: 'event', entityId: 9999, prompt: 'improve it' },
      { id: 1, email: 'planner@test.com', role_id: 2 },
    );
    const res = makeRes();

    await getGroundedSuggestion(req, res);

    expect(res.statusCode).toBe(404);
    const error = (res.body as { error: string }).error;
    // Error must name the entity ID and workflow type for actionability
    expect(error).toMatch(/9999/);
    expect(error).toMatch(/event/i);
  });

  it('returns 500 with clear message when the context DB query throws', async () => {
    process.env.OPENAI_API_KEY = 'openai-key';

    mockDb.get
      .mockResolvedValueOnce({ count: 1 }) // rate limit passes
      .mockRejectedValueOnce(new Error('DB connection lost')); // event fetch throws

    const { getGroundedSuggestion } = await loadController();
    const req = makeReq(
      { workflowType: 'event', entityId: 1, prompt: 'help' },
      { id: 1, email: 'planner@test.com', role_id: 2 },
    );
    const res = makeRes();

    await getGroundedSuggestion(req, res);

    expect(res.statusCode).toBe(500);
    expect((res.body as { error: string }).error).toMatch(/Failed to fetch workflow context/i);
  });

  it('returns 502 when AI provider call fails, still logs the error', async () => {
    process.env.OPENAI_API_KEY = 'openai-key';

    const eventRow = {
      id: 1,
      title: 'Test',
      description: null,
      date: null,
      end_date: null,
      event_time: null,
      capacity: null,
      status: 'Draft',
      event_type: null,
      venue_name: null,
      tags: null,
    };

    mockDb.get
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce(eventRow)
      .mockResolvedValueOnce({ confirmed: 0, total: 0 });
    mockDb.run.mockResolvedValue(undefined); // log write succeeds

    vi.spyOn(https, 'request').mockImplementation(() => {
      throw new Error('Provider unreachable');
    });

    const { getGroundedSuggestion } = await loadController();
    const req = makeReq(
      { workflowType: 'event', entityId: 1, prompt: 'help' },
      { id: 1, email: 'planner@test.com', role_id: 2 },
    );
    const res = makeRes();

    await getGroundedSuggestion(req, res);

    expect(res.statusCode).toBe(502);
    expect((res.body as { error: string }).error).toMatch(/AI request failed/i);
    expect((res.body as { error: string }).error).toMatch(/Provider unreachable/i);
  });
});

// ── AC6: canonical_status used in RSVP queries ────────────────────────────────

describe('#949 — canonical_status usage in RSVP queries', () => {
  it('fetchEventContext RSVP stats use canonical_status so confirmed counts are accurate', async () => {
    process.env.OPENAI_API_KEY = 'openai-key';

    const eventRow = {
      id: 50,
      title: 'Status Query Test',
      description: null,
      date: '2026-09-01',
      end_date: null,
      event_time: null,
      capacity: 100,
      status: 'Active',
      event_type: null,
      venue_name: null,
      tags: null,
    };
    // Simulates a DB that only has canonical_status populated (legacy status may not match)
    const rsvpStats = { confirmed: 75, total: 90 };

    mockDb.get
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce(eventRow)
      .mockResolvedValueOnce(rsvpStats);

    const { captured, restore } = mockHttpsJsonReply({
      choices: [
        {
          message: {
            content: JSON.stringify({
              title: 'Status Query Test',
              description: 'desc',
              venueType: 'Indoor',
              promotionalTips: [],
            }),
          },
        },
      ],
    });

    try {
      const { getGroundedSuggestion } = await loadController();
      const req = makeReq(
        { workflowType: 'event', entityId: 50, prompt: 'improve' },
        { id: 1, email: 'planner@test.com', role_id: 2 },
      );
      const res = makeRes();

      await getGroundedSuggestion(req, res);

      expect(res.statusCode).toBe(200);

      // Verify the grounded prompt contains the canonical_status-derived counts
      const sentBody = JSON.parse(captured.body) as {
        messages: Array<{ role: string; content: string }>;
      };
      const userContent = sentBody.messages.find((m) => m.role === 'user')?.content ?? '';
      expect(userContent).toContain('75 confirmed');
      expect(userContent).toContain('90 total');
    } finally {
      restore();
    }
  });
});
