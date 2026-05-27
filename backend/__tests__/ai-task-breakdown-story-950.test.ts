/**
 * Tests: AI Task Breakdown — Story #950
 * "Generate Task Breakdowns From Event Context"
 *
 * Acceptance criteria verified:
 *  AC1 — AI task output includes task title, owner suggestion, due-window,
 *         and dependency hints.
 *  AC2 — Output format is predictable for rendering in UI (schema validation).
 *  AC3 — User can copy/apply generated tasks manually (structured array output).
 *  AC4 — Unit tests validate structured output schema (this file).
 *
 * Additional coverage:
 *  - parseTaskBreakdownOutput validates each field and defaults gracefully.
 *  - priority is validated against the enum; defaults to 'medium' for unknown values.
 *  - contextSummary.groundedFields lists only populated event context fields.
 *  - contextSummary.totalExistingTasks reflects existing task count.
 *  - Timeline constraints and dependency hints are included in the user message.
 *  - Null/empty event fields are omitted from the grounded user message.
 *  - getTaskBreakdown returns 400 for missing/invalid eventId.
 *  - getTaskBreakdown returns 404 for unknown event.
 *  - getTaskBreakdown returns 503 when no AI provider is configured.
 *  - getTaskBreakdown returns 502 when the AI provider call fails.
 *  - getTaskBreakdown returns an empty tasks array (not an error) when the model
 *    returns unparseable JSON, ensuring UI renders gracefully.
 *  - Rate limiting is enforced for authenticated users.
 */

import { EventEmitter } from 'node:events';
import https from 'https';
import type { Request, Response } from 'express';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ── Test helpers ───────────────────────────────────────────────────────────────

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
    captured.hostname = (options as { hostname?: string }).hostname;
    captured.path = (options as { path?: string }).path;
    captured.headers = (options as { headers?: Record<string, string | number> }).headers;

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

// ── AC2 + AC4: parseTaskBreakdownOutput schema validation ─────────────────────

describe('#950 — parseTaskBreakdownOutput schema validation', () => {
  it('parses a valid task breakdown array with all fields', async () => {
    const { parseTaskBreakdownOutput } = await loadController();

    const raw = JSON.stringify([
      {
        title: 'Book venue',
        owner: 'Event coordinator',
        dueWindow: '8 weeks before event',
        dependencies: [],
        priority: 'high',
        timelineConstraint: 'Must be confirmed before ticket sales open',
      },
      {
        title: 'Set up ticketing platform',
        owner: 'Tech team',
        dueWindow: '6 weeks before event',
        dependencies: ['Book venue'],
        priority: 'high',
        timelineConstraint: 'Depends on confirmed venue capacity',
      },
    ]);

    const result = parseTaskBreakdownOutput(raw);

    expect(result).not.toBeNull();
    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(2);

    // AC1 — Each task includes title, owner, dueWindow, dependencies
    const first = result![0];
    expect(first.title).toBe('Book venue');
    expect(first.owner).toBe('Event coordinator');
    expect(first.dueWindow).toBe('8 weeks before event');
    expect(first.dependencies).toEqual([]);
    expect(first.priority).toBe('high');
    expect(first.timelineConstraint).toBe('Must be confirmed before ticket sales open');

    const second = result![1];
    expect(second.title).toBe('Set up ticketing platform');
    expect(second.dependencies).toEqual(['Book venue']);
  });

  it('defaults priority to "medium" for unrecognised priority values', async () => {
    const { parseTaskBreakdownOutput } = await loadController();

    const raw = JSON.stringify([
      {
        title: 'Hire catering',
        owner: 'Catering manager',
        dueWindow: '4 weeks before event',
        dependencies: [],
        priority: 'super-urgent',
        timelineConstraint: '',
      },
    ]);

    const result = parseTaskBreakdownOutput(raw);
    expect(result).not.toBeNull();
    expect(result![0].priority).toBe('medium');
  });

  it('accepts all valid priority values', async () => {
    const { parseTaskBreakdownOutput } = await loadController();

    for (const priority of ['low', 'medium', 'high', 'urgent']) {
      const raw = JSON.stringify([
        {
          title: 'Task',
          owner: '',
          dueWindow: '',
          dependencies: [],
          priority,
          timelineConstraint: '',
        },
      ]);
      const result = parseTaskBreakdownOutput(raw);
      expect(result).not.toBeNull();
      expect(result![0].priority).toBe(priority);
    }
  });

  it('defaults missing optional fields to empty strings / empty arrays', async () => {
    const { parseTaskBreakdownOutput } = await loadController();

    const raw = JSON.stringify([{ title: 'Minimal task' }]);
    const result = parseTaskBreakdownOutput(raw);

    expect(result).not.toBeNull();
    expect(result![0].title).toBe('Minimal task');
    expect(result![0].owner).toBe('');
    expect(result![0].dueWindow).toBe('');
    expect(result![0].dependencies).toEqual([]);
    expect(result![0].priority).toBe('medium');
    expect(result![0].timelineConstraint).toBe('');
  });

  it('returns null when raw is not a JSON array', async () => {
    const { parseTaskBreakdownOutput } = await loadController();

    expect(parseTaskBreakdownOutput('{"title":"not an array"}')).toBeNull();
    expect(parseTaskBreakdownOutput('null')).toBeNull();
    expect(parseTaskBreakdownOutput('not-json')).toBeNull();
    expect(parseTaskBreakdownOutput('[]')).toBeNull(); // empty array → null
  });

  it('strips markdown code fences before parsing', async () => {
    const { parseTaskBreakdownOutput } = await loadController();

    const raw =
      '```json\n[{"title":"Fenced task","owner":"Lead","dueWindow":"3 weeks","dependencies":[],"priority":"low","timelineConstraint":""}]\n```';
    const result = parseTaskBreakdownOutput(raw);

    expect(result).not.toBeNull();
    expect(result![0].title).toBe('Fenced task');
  });

  it('skips items without a title and still returns valid items', async () => {
    const { parseTaskBreakdownOutput } = await loadController();

    const raw = JSON.stringify([
      { owner: 'Lead' }, // no title — should be skipped
      {
        title: 'Valid task',
        owner: 'Planner',
        dueWindow: '2 weeks',
        dependencies: [],
        priority: 'medium',
        timelineConstraint: '',
      },
    ]);
    const result = parseTaskBreakdownOutput(raw);

    expect(result).not.toBeNull();
    expect(result).toHaveLength(1);
    expect(result![0].title).toBe('Valid task');
  });
});

// ── AC1 + AC2: getTaskBreakdown endpoint — happy path ─────────────────────────

describe('#950 — getTaskBreakdown happy path', () => {
  it('returns structured task array with all required fields grounded in event context', async () => {
    process.env.OPENAI_API_KEY = 'openai-key';

    const eventRow = {
      id: 5,
      title: 'Summer Music Festival',
      date: '2026-08-15',
      end_date: '2026-08-17',
      event_time: '14:00',
      event_type: 'Music',
      status: 'Draft',
      capacity: 5000,
      tags: 'music, outdoor, family',
    };
    const taskRows = [{ title: 'Book headliner', status: 'In Progress', due_date: '2026-05-01' }];

    mockDb.get
      .mockResolvedValueOnce({ count: 1 }) // rate limit
      .mockResolvedValueOnce(eventRow); // event fetch
    mockDb.all.mockResolvedValueOnce(taskRows); // existing tasks

    const aiTasks = [
      {
        title: 'Secure venue permit',
        owner: 'Event coordinator',
        dueWindow: '12 weeks before event',
        dependencies: [],
        priority: 'urgent',
        timelineConstraint: 'Local council requires 3-month notice',
      },
      {
        title: 'Launch ticket sales',
        owner: 'Marketing team',
        dueWindow: '8 weeks before event',
        dependencies: ['Secure venue permit'],
        priority: 'high',
        timelineConstraint: 'Depends on permit approval',
      },
      {
        title: 'Hire catering vendors',
        owner: 'Operations lead',
        dueWindow: '6 weeks before event',
        dependencies: [],
        priority: 'medium',
        timelineConstraint: 'Must be finalised before logistics planning',
      },
    ];

    const { captured, restore } = mockHttpsJsonReply({
      choices: [{ message: { content: JSON.stringify(aiTasks) } }],
    });

    try {
      const { getTaskBreakdown } = await loadController();
      const req = makeReq(
        { eventId: 5, prompt: 'Generate a full task plan' },
        { id: 1, email: 'organiser@test.com', role_id: 2 },
      );
      const res = makeRes();

      await getTaskBreakdown(req, res);

      // AC2 — predictable output format
      expect(res.statusCode).toBe(200);
      const body = res.body as {
        workflowType: string;
        eventId: number;
        eventTitle: string;
        tasks: Array<{
          title: string;
          owner: string;
          dueWindow: string;
          dependencies: string[];
          priority: string;
          timelineConstraint: string;
        }>;
        raw: string;
        contextSummary: { groundedFields: string[]; totalExistingTasks: number };
      };

      expect(body.workflowType).toBe('task-breakdown');
      expect(body.eventId).toBe(5);
      expect(body.eventTitle).toBe('Summer Music Festival');
      expect(Array.isArray(body.tasks)).toBe(true);
      expect(body.tasks).toHaveLength(3);

      // AC1 — each task has the required fields
      for (const task of body.tasks) {
        expect(typeof task.title).toBe('string');
        expect(task.title.length).toBeGreaterThan(0);
        expect(typeof task.owner).toBe('string');
        expect(typeof task.dueWindow).toBe('string');
        expect(Array.isArray(task.dependencies)).toBe(true);
        expect(['low', 'medium', 'high', 'urgent']).toContain(task.priority);
        expect(typeof task.timelineConstraint).toBe('string');
      }

      // Verify contextSummary traceability
      expect(body.contextSummary.groundedFields).toContain('eventTitle');
      expect(body.contextSummary.groundedFields).toContain('status');
      expect(body.contextSummary.groundedFields).toContain('eventType');
      expect(body.contextSummary.groundedFields).toContain('eventDate');
      expect(body.contextSummary.groundedFields).toContain('capacity');
      expect(body.contextSummary.groundedFields).toContain('tags');
      expect(body.contextSummary.groundedFields).toContain('existingTasks');
      expect(body.contextSummary.totalExistingTasks).toBe(1);

      // The grounded user message must include event context
      const sentBody = JSON.parse(captured.body) as {
        messages: Array<{ role: string; content: string }>;
      };
      const userContent = sentBody.messages.find((m) => m.role === 'user')?.content ?? '';
      expect(userContent).toContain('Summer Music Festival');
      expect(userContent).toContain('Type: Music');
      expect(userContent).toContain('2026-08-15');
      expect(userContent).toContain('Capacity: 5000');
      expect(userContent).toContain('Tags: music, outdoor, family');
      expect(userContent).toContain('Book headliner');
    } finally {
      restore();
    }
  });

  it('uses a default prompt when no prompt is supplied', async () => {
    process.env.OPENAI_API_KEY = 'openai-key';

    mockDb.get.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({
      id: 3,
      title: 'Art Fair',
      date: null,
      end_date: null,
      event_time: null,
      event_type: null,
      status: 'Active',
      capacity: null,
      tags: null,
    });
    mockDb.all.mockResolvedValueOnce([]);

    const { captured, restore } = mockHttpsJsonReply({
      choices: [
        {
          message: {
            content: JSON.stringify([
              {
                title: 'Set up exhibits',
                owner: 'Curator',
                dueWindow: '1 week before event',
                dependencies: [],
                priority: 'high',
                timelineConstraint: '',
              },
            ]),
          },
        },
      ],
    });

    try {
      const { getTaskBreakdown } = await loadController();
      const req = makeReq({ eventId: 3 }, { id: 1, email: 'planner@test.com', role_id: 2 });
      const res = makeRes();

      await getTaskBreakdown(req, res);

      expect(res.statusCode).toBe(200);

      // Default prompt should appear in the sent message
      const sentBody = JSON.parse(captured.body) as {
        messages: Array<{ role: string; content: string }>;
      };
      const userContent = sentBody.messages.find((m) => m.role === 'user')?.content ?? '';
      expect(userContent).toContain('Generate a comprehensive task breakdown');
    } finally {
      restore();
    }
  });
});

// ── AC1: Grounded user message includes timeline context ──────────────────────

describe('#950 — grounded user message includes timeline context', () => {
  it('includes event dates in the user message for timeline-aware generation', async () => {
    process.env.OPENAI_API_KEY = 'openai-key';

    mockDb.get.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({
      id: 7,
      title: 'Winter Gala',
      date: '2026-12-20',
      end_date: '2026-12-20',
      event_time: '19:00',
      event_type: 'Gala',
      status: 'Draft',
      capacity: 300,
      tags: null,
    });
    mockDb.all.mockResolvedValueOnce([
      { title: 'Venue deposit paid', status: 'Complete', due_date: '2026-10-01' },
      { title: 'Send invitations', status: 'Pending', due_date: '2026-11-01' },
    ]);

    const { captured, restore } = mockHttpsJsonReply({
      choices: [
        {
          message: {
            content: JSON.stringify([
              {
                title: 'Finalise catering menu',
                owner: 'Catering lead',
                dueWindow: '4 weeks before event',
                dependencies: ['Send invitations'],
                priority: 'high',
                timelineConstraint: 'Guest dietary requirements must be confirmed first',
              },
            ]),
          },
        },
      ],
    });

    try {
      const { getTaskBreakdown } = await loadController();
      const req = makeReq(
        { eventId: 7, prompt: 'What tasks remain for the gala?' },
        { id: 1, email: 'planner@test.com', role_id: 2 },
      );
      const res = makeRes();

      await getTaskBreakdown(req, res);

      expect(res.statusCode).toBe(200);

      const sentBody = JSON.parse(captured.body) as {
        messages: Array<{ role: string; content: string }>;
      };
      const userContent = sentBody.messages.find((m) => m.role === 'user')?.content ?? '';

      // Timeline context must be present in the grounded message
      expect(userContent).toContain('2026-12-20');
      expect(userContent).toContain('Time: 19:00');
      expect(userContent).toContain('Capacity: 300');

      // Existing tasks must be included for dependency awareness
      expect(userContent).toContain('Venue deposit paid');
      expect(userContent).toContain('Send invitations');

      // Dependency hints in the structured output
      const body = res.body as { tasks: Array<{ dependencies: string[] }> };
      expect(body.tasks[0].dependencies).toContain('Send invitations');
    } finally {
      restore();
    }
  });

  it('omits null event fields from the grounded user message (noise reduction)', async () => {
    process.env.OPENAI_API_KEY = 'openai-key';

    mockDb.get.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({
      id: 9,
      title: 'Unnamed Event',
      date: null,
      end_date: null,
      event_time: null,
      event_type: null,
      status: 'Draft',
      capacity: null,
      tags: null,
    });
    mockDb.all.mockResolvedValueOnce([]);

    const { captured, restore } = mockHttpsJsonReply({
      choices: [
        {
          message: {
            content: JSON.stringify([
              {
                title: 'Define event scope',
                owner: 'Organiser',
                dueWindow: 'ASAP',
                dependencies: [],
                priority: 'urgent',
                timelineConstraint: '',
              },
            ]),
          },
        },
      ],
    });

    try {
      const { getTaskBreakdown } = await loadController();
      const req = makeReq(
        { eventId: 9, prompt: 'Start planning' },
        { id: 1, email: 'planner@test.com', role_id: 2 },
      );
      const res = makeRes();

      await getTaskBreakdown(req, res);

      expect(res.statusCode).toBe(200);

      const sentBody = JSON.parse(captured.body) as {
        messages: Array<{ role: string; content: string }>;
      };
      const userContent = sentBody.messages.find((m) => m.role === 'user')?.content ?? '';

      // Null fields must NOT appear in the grounded message
      expect(userContent).not.toContain('Type:');
      expect(userContent).not.toContain('Date:');
      expect(userContent).not.toContain('Time:');
      expect(userContent).not.toContain('Capacity:');
      expect(userContent).not.toContain('Tags:');

      // Required fields must still be present
      expect(userContent).toContain('Title: Unnamed Event');
      expect(userContent).toContain('Status: Draft');
    } finally {
      restore();
    }
  });
});

// ── AC3: Structured output for manual copy/apply ──────────────────────────────

describe('#950 — structured output for manual copy/apply', () => {
  it('returns raw model response alongside structured tasks for traceability', async () => {
    process.env.OPENAI_API_KEY = 'openai-key';

    const rawContent = JSON.stringify([
      {
        title: 'Print programmes',
        owner: 'Design team',
        dueWindow: '2 weeks before event',
        dependencies: [],
        priority: 'low',
        timelineConstraint: '',
      },
    ]);

    mockDb.get.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({
      id: 11,
      title: 'Book Launch',
      date: '2026-09-10',
      end_date: null,
      event_time: null,
      event_type: 'Conference',
      status: 'Active',
      capacity: 100,
      tags: null,
    });
    mockDb.all.mockResolvedValueOnce([]);

    const { restore } = mockHttpsJsonReply({
      choices: [{ message: { content: rawContent } }],
    });

    try {
      const { getTaskBreakdown } = await loadController();
      const req = makeReq(
        { eventId: 11, prompt: 'Plan tasks' },
        { id: 2, email: 'user@test.com', role_id: 2 },
      );
      const res = makeRes();

      await getTaskBreakdown(req, res);

      expect(res.statusCode).toBe(200);

      const body = res.body as { tasks: unknown[]; raw: string };

      // AC3 — structured array for UI rendering
      expect(Array.isArray(body.tasks)).toBe(true);
      expect(body.tasks).toHaveLength(1);

      // Raw response is preserved for traceability
      expect(typeof body.raw).toBe('string');
      expect(body.raw).toBe(rawContent);
    } finally {
      restore();
    }
  });

  it('returns empty tasks array (not an error) when model returns unparseable JSON', async () => {
    process.env.OPENAI_API_KEY = 'openai-key';

    mockDb.get.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({
      id: 12,
      title: 'Bad Output Event',
      date: null,
      end_date: null,
      event_time: null,
      event_type: null,
      status: 'Draft',
      capacity: null,
      tags: null,
    });
    mockDb.all.mockResolvedValueOnce([]);

    const { restore } = mockHttpsJsonReply({
      choices: [{ message: { content: 'Sorry, I cannot help with that right now.' } }],
    });

    try {
      const { getTaskBreakdown } = await loadController();
      const req = makeReq(
        { eventId: 12, prompt: 'plan tasks' },
        { id: 1, email: 'planner@test.com', role_id: 2 },
      );
      const res = makeRes();

      await getTaskBreakdown(req, res);

      expect(res.statusCode).toBe(200);
      const body = res.body as { tasks: unknown[]; raw: string };
      expect(Array.isArray(body.tasks)).toBe(true);
      expect(body.tasks).toHaveLength(0);
      expect(typeof body.raw).toBe('string');
    } finally {
      restore();
    }
  });
});

// ── Input validation ───────────────────────────────────────────────────────────

describe('#950 — getTaskBreakdown input validation', () => {
  it('returns 400 when eventId is missing', async () => {
    const { getTaskBreakdown } = await loadController();
    const req = makeReq({}, { id: 1, email: 'planner@test.com', role_id: 2 });
    const res = makeRes();

    await getTaskBreakdown(req, res);

    expect(res.statusCode).toBe(400);
    expect((res.body as { error: string }).error).toContain('eventId');
  });

  it('returns 400 when eventId is not a positive integer', async () => {
    const { getTaskBreakdown } = await loadController();

    for (const eventId of [0, -1, 'abc', 1.5]) {
      const req = makeReq({ eventId }, { id: 1, email: 'planner@test.com', role_id: 2 });
      const res = makeRes();
      await getTaskBreakdown(req, res);
      expect(res.statusCode).toBe(400);
    }
  });

  it('returns 404 when the event is not found', async () => {
    process.env.OPENAI_API_KEY = 'openai-key';

    mockDb.get
      .mockResolvedValueOnce({ count: 1 }) // rate limit
      .mockResolvedValueOnce(null); // event not found

    const { getTaskBreakdown } = await loadController();
    const req = makeReq({ eventId: 999 }, { id: 1, email: 'planner@test.com', role_id: 2 });
    const res = makeRes();

    await getTaskBreakdown(req, res);

    expect(res.statusCode).toBe(404);
    expect((res.body as { error: string }).error).toContain('999');
  });
});

// ── Provider configuration errors ─────────────────────────────────────────────

describe('#950 — getTaskBreakdown provider configuration errors', () => {
  it('returns 503 when no AI provider is configured', async () => {
    // No env vars set
    mockDb.get.mockResolvedValueOnce({ count: 1 });

    const { getTaskBreakdown } = await loadController();
    const req = makeReq({ eventId: 1 }, { id: 1, email: 'planner@test.com', role_id: 2 });
    const res = makeRes();

    await getTaskBreakdown(req, res);

    expect(res.statusCode).toBe(503);
    expect((res.body as { error: string }).error).toContain('not configured');
  });

  it('returns 503 when Azure OpenAI is partially configured', async () => {
    process.env.AZURE_OPENAI_ENDPOINT = 'https://example.openai.azure.com';
    // API key deliberately missing

    mockDb.get.mockResolvedValueOnce({ count: 1 });

    const { getTaskBreakdown } = await loadController();
    const req = makeReq({ eventId: 1 }, { id: 1, email: 'planner@test.com', role_id: 2 });
    const res = makeRes();

    await getTaskBreakdown(req, res);

    expect(res.statusCode).toBe(503);
    expect((res.body as { error: string }).error).toContain('partially configured');
  });
});

// ── Rate limiting ──────────────────────────────────────────────────────────────

describe('#950 — getTaskBreakdown rate limiting', () => {
  it('returns 429 when the per-user rate limit is exceeded', async () => {
    process.env.OPENAI_API_KEY = 'openai-key';

    // Rate limit UPSERT returns count > 20
    mockDb.get.mockResolvedValueOnce({ count: 21 });

    const { getTaskBreakdown } = await loadController();
    const req = makeReq({ eventId: 1 }, { id: 1, email: 'planner@test.com', role_id: 2 });
    const res = makeRes();

    await getTaskBreakdown(req, res);

    expect(res.statusCode).toBe(429);
    expect((res.body as { error: string }).error).toContain('rate limit');
  });
});

// ── AI provider failure ────────────────────────────────────────────────────────

describe('#950 — getTaskBreakdown AI provider failure', () => {
  it('returns 502 when the AI provider call throws an error', async () => {
    process.env.OPENAI_API_KEY = 'openai-key';

    mockDb.get.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({
      id: 15,
      title: 'Error Event',
      date: null,
      end_date: null,
      event_time: null,
      event_type: null,
      status: 'Draft',
      capacity: null,
      tags: null,
    });
    mockDb.all.mockResolvedValueOnce([]);

    const spy = vi.spyOn(https, 'request').mockImplementation((_options, _callback) => {
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

    try {
      const { getTaskBreakdown } = await loadController();
      const req = makeReq({ eventId: 15 }, { id: 1, email: 'planner@test.com', role_id: 2 });
      const res = makeRes();

      await getTaskBreakdown(req, res);

      expect(res.statusCode).toBe(502);
      expect((res.body as { error: string }).error).toContain('AI request failed');
    } finally {
      spy.mockRestore();
    }
  });
});

// ── contextSummary traceability ────────────────────────────────────────────────

describe('#950 — contextSummary groundedFields', () => {
  it('lists only populated event context fields in groundedFields', async () => {
    process.env.OPENAI_API_KEY = 'openai-key';

    mockDb.get.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({
      id: 20,
      title: 'Partial Event',
      date: '2026-06-01',
      end_date: null, // missing
      event_time: null, // missing
      event_type: 'Conference',
      status: 'Active',
      capacity: 200,
      tags: null, // missing
    });
    mockDb.all.mockResolvedValueOnce([
      { title: 'Reserve speakers', status: 'Pending', due_date: null },
    ]);

    const { restore } = mockHttpsJsonReply({
      choices: [
        {
          message: {
            content: JSON.stringify([
              {
                title: 'Arrange AV setup',
                owner: 'AV team',
                dueWindow: '1 week before',
                dependencies: [],
                priority: 'medium',
                timelineConstraint: '',
              },
            ]),
          },
        },
      ],
    });

    try {
      const { getTaskBreakdown } = await loadController();
      const req = makeReq({ eventId: 20 }, { id: 1, email: 'user@test.com', role_id: 2 });
      const res = makeRes();

      await getTaskBreakdown(req, res);

      expect(res.statusCode).toBe(200);

      const body = res.body as {
        contextSummary: { groundedFields: string[]; totalExistingTasks: number };
      };

      const fields = body.contextSummary.groundedFields;
      expect(fields).toContain('eventTitle');
      expect(fields).toContain('status');
      expect(fields).toContain('eventType');
      expect(fields).toContain('eventDate');
      expect(fields).toContain('capacity');
      expect(fields).toContain('existingTasks');

      // Null fields must NOT appear
      expect(fields).not.toContain('endDate');
      expect(fields).not.toContain('eventTime');
      expect(fields).not.toContain('tags');

      expect(body.contextSummary.totalExistingTasks).toBe(1);
    } finally {
      restore();
    }
  });
});
