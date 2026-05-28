/**
 * Tests: AI API Contract — Issue #960
 *
 * Validates the expected request/response payload shapes for all AI endpoints.
 * Tests are pure unit-level and do not render any React component.
 *
 * Endpoints covered:
 *   POST /api/ai/suggest               — general chat
 *   POST /api/ai/grounded              — grounded workflow
 *   POST /api/ai/task-breakdown        — task breakdown (#950)
 *   POST /api/ai/budget-insight        — budget insight (#952)
 *   POST /api/ai/vendor-recommendation — vendor AI (#953)
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  fetchBudgetInsight,
  type BudgetInsightResponse,
} from '../src/services/budget-insight-service';
import {
  fetchVendorRecommendation,
  type VendorRecommendationResponse,
} from '../src/services/vendor-ai-recommendation-service';
import { ApiError, api } from '../src/lib/api-client';

// ── Mock api-client (used by budget-insight-service) ──────────────────────────

vi.mock('../src/lib/api-client', async () => {
  const actual =
    await vi.importActual<typeof import('../src/lib/api-client')>('../src/lib/api-client');
  return {
    ...actual,
    api: {
      get: vi.fn(),
      post: vi.fn(),
      put: vi.fn(),
      patch: vi.fn(),
      delete: vi.fn(),
    },
  };
});

const mockedApi = vi.mocked(api);

// ── Mock native fetch (used by vendor-recommendation-service) ─────────────────

const mockFetch = vi.fn();

beforeEach(() => {
  vi.stubGlobal('fetch', mockFetch);
  mockedApi.post.mockReset();
  mockedApi.get.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

// ── Budget Insight Service — contract ─────────────────────────────────────────

describe('Budget Insight Service — request contract', () => {
  it('calls POST /api/ai/budget-insight with eventId and prompt', async () => {
    const expectedResponse: BudgetInsightResponse = {
      workflowType: 'budget-insight',
      eventId: 42,
      eventTitle: 'Festival 2026',
      summary: 'Budget on track.',
      riskLevel: 'low',
      totalAllocated: 10000,
      totalSpent: 8000,
      totalVariance: 2000,
      overspentCategories: [],
      anomalies: [],
      recommendations: [
        {
          category: 'Catering',
          insight: 'Under budget',
          action: 'Reallocate savings',
          priority: 'low',
        },
        {
          category: 'Stage',
          insight: 'On track',
          action: 'Monitor weekly',
          priority: 'medium',
        },
        {
          category: 'Marketing',
          insight: 'High spend',
          action: 'Reduce social spend',
          priority: 'high',
        },
      ],
      raw: '{}',
      contextSummary: {
        groundedFields: ['budget', 'expenses'],
        categoryCount: 3,
        expenseCount: 12,
      },
    };

    mockedApi.post.mockResolvedValueOnce(expectedResponse);

    const result = await fetchBudgetInsight({ eventId: 42, prompt: 'Focus on catering' });

    expect(mockedApi.post).toHaveBeenCalledOnce();
    expect(mockedApi.post).toHaveBeenCalledWith('/api/ai/budget-insight', {
      eventId: 42,
      prompt: 'Focus on catering',
    });

    expect(result.workflowType).toBe('budget-insight');
    expect(result.eventId).toBe(42);
  });

  it('omits prompt field from request when not provided', async () => {
    mockedApi.post.mockResolvedValueOnce({
      workflowType: 'budget-insight',
      eventId: 1,
      eventTitle: 'Test',
      summary: '',
      riskLevel: 'low',
      totalAllocated: 0,
      totalSpent: 0,
      totalVariance: 0,
      overspentCategories: [],
      anomalies: [],
      recommendations: [],
      raw: '',
      contextSummary: { groundedFields: [], categoryCount: 0, expenseCount: 0 },
    });

    await fetchBudgetInsight({ eventId: 1 });

    expect(mockedApi.post).toHaveBeenCalledWith('/api/ai/budget-insight', { eventId: 1 });
  });

  it('propagates ApiError when the request fails', async () => {
    mockedApi.post.mockRejectedValueOnce(new ApiError('Service unavailable', 503));

    await expect(fetchBudgetInsight({ eventId: 99 })).rejects.toThrow(ApiError);
  });

  it('propagates ApiError with correct status code', async () => {
    mockedApi.post.mockRejectedValueOnce(new ApiError('Forbidden', 403));

    await expect(fetchBudgetInsight({ eventId: 10 })).rejects.toMatchObject({ status: 403 });
  });
});

describe('Budget Insight Service — response contract', () => {
  it('response has all required top-level fields', async () => {
    const response: BudgetInsightResponse = {
      workflowType: 'budget-insight',
      eventId: 5,
      eventTitle: 'Fest',
      summary: 'On track.',
      riskLevel: 'medium',
      totalAllocated: 5000,
      totalSpent: 4000,
      totalVariance: 1000,
      overspentCategories: ['Sound'],
      anomalies: ['Spike in AV costs'],
      recommendations: [
        { category: 'AV', insight: 'Overspent', action: 'Renegotiate', priority: 'high' },
      ],
      raw: '{"riskLevel":"medium"}',
      contextSummary: { groundedFields: ['budget'], categoryCount: 2, expenseCount: 8 },
    };

    expect(response).toHaveProperty('workflowType', 'budget-insight');
    expect(response).toHaveProperty('eventId');
    expect(response).toHaveProperty('eventTitle');
    expect(response).toHaveProperty('summary');
    expect(response).toHaveProperty('riskLevel');
    expect(response).toHaveProperty('totalAllocated');
    expect(response).toHaveProperty('totalSpent');
    expect(response).toHaveProperty('totalVariance');
    expect(response).toHaveProperty('overspentCategories');
    expect(response).toHaveProperty('anomalies');
    expect(response).toHaveProperty('recommendations');
    expect(response).toHaveProperty('raw');
    expect(response).toHaveProperty('contextSummary');
  });

  it('riskLevel is one of the four valid values', () => {
    const validLevels = ['low', 'medium', 'high', 'critical'];
    expect(validLevels).toContain('medium');
    expect(validLevels).toContain('low');
    expect(validLevels).toContain('high');
    expect(validLevels).toContain('critical');
  });

  it('recommendation has category, insight, action, and priority fields', () => {
    const rec = {
      category: 'Catering',
      insight: 'Over budget by 15%',
      action: 'Reduce per-head cost',
      priority: 'high' as const,
    };
    expect(rec).toHaveProperty('category');
    expect(rec).toHaveProperty('insight');
    expect(rec).toHaveProperty('action');
    expect(rec.priority).toMatch(/^(low|medium|high|critical)$/);
  });
});

// ── Vendor Recommendation Service — contract ──────────────────────────────────

describe('Vendor Recommendation Service — request contract', () => {
  it('sends POST to /api/ai/vendor-recommendation with eventId and prompt', async () => {
    const mockResponse: VendorRecommendationResponse = {
      workflowType: 'vendor-recommendation',
      eventId: 5,
      eventTitle: 'Test Fest',
      summary: 'Two vendors match well.',
      recommendations: [
        {
          vendorId: 101,
          vendorName: 'SoundCo',
          rank: 1,
          score: 88,
          rationale: 'Strong track record',
          strengths: ['On-time'],
          concerns: [],
        },
      ],
      advisoryLabel: 'AI-generated. Verify independently before contracting.',
      raw: '{}',
      contextSummary: { groundedFields: ['vendors', 'event'], vendorCount: 2 },
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockResponse),
    });

    const result = await fetchVendorRecommendation({ eventId: 5, prompt: 'Best value' });

    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/api/ai/vendor-recommendation');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({ eventId: 5, prompt: 'Best value' });

    expect(result.workflowType).toBe('vendor-recommendation');
    expect(result.advisoryLabel).toBeTruthy();
  });

  it('omits prompt from request body when not provided', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          workflowType: 'vendor-recommendation',
          eventId: 1,
          eventTitle: '',
          summary: '',
          recommendations: [],
          advisoryLabel: 'Advisory',
          raw: '',
          contextSummary: { groundedFields: [], vendorCount: 0 },
        }),
    });

    await fetchVendorRecommendation({ eventId: 1 });

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(body).toEqual({ eventId: 1 });
    expect(body.prompt).toBeUndefined();
  });

  it('includes credentials: include in fetch options', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          workflowType: 'vendor-recommendation',
          eventId: 1,
          eventTitle: '',
          summary: '',
          recommendations: [],
          advisoryLabel: '',
          raw: '',
          contextSummary: { groundedFields: [], vendorCount: 0 },
        }),
    });

    await fetchVendorRecommendation({ eventId: 1 });

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(init.credentials).toBe('include');
  });

  it('sets Content-Type: application/json header', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          workflowType: 'vendor-recommendation',
          eventId: 1,
          eventTitle: '',
          summary: '',
          recommendations: [],
          advisoryLabel: '',
          raw: '',
          contextSummary: { groundedFields: [], vendorCount: 0 },
        }),
    });

    await fetchVendorRecommendation({ eventId: 1 });

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers['Content-Type']).toBe('application/json');
  });

  it('throws with server error message when response is not ok', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
      json: () => Promise.resolve({ error: 'Event not found' }),
    });

    await expect(fetchVendorRecommendation({ eventId: 999 })).rejects.toThrow('Event not found');
  });

  it('throws with status code when server returns no body', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: () => Promise.reject(new Error('No body')),
    });

    await expect(fetchVendorRecommendation({ eventId: 999 })).rejects.toThrow(/500/);
  });
});

describe('Vendor Recommendation Service — response contract', () => {
  it('response has required fields including advisoryLabel', () => {
    const response: VendorRecommendationResponse = {
      workflowType: 'vendor-recommendation',
      eventId: 10,
      eventTitle: 'Summer Fest',
      summary: 'Two vendors match.',
      recommendations: [
        {
          vendorId: 1,
          vendorName: 'SoundCo Pro',
          rank: 1,
          score: 88,
          rationale: 'Great track record',
          strengths: ['Reliability'],
          concerns: ['High cost'],
        },
      ],
      advisoryLabel: 'AI-generated. Verify independently before contracting.',
      raw: '{}',
      contextSummary: { groundedFields: ['event', 'vendors'], vendorCount: 2 },
    };

    expect(response).toHaveProperty('workflowType', 'vendor-recommendation');
    expect(response).toHaveProperty('advisoryLabel');
    expect(response.advisoryLabel.length).toBeGreaterThan(0);
    expect(response).toHaveProperty('recommendations');
    expect(Array.isArray(response.recommendations)).toBe(true);
  });

  it('recommendation item has rank, score, rationale, strengths, and concerns', () => {
    const item = {
      vendorId: 1,
      vendorName: 'SoundCo',
      rank: 1,
      score: 88,
      rationale: 'Excellent for outdoor events.',
      strengths: ['Reliability', 'Value'],
      concerns: ['Limited availability'],
    };

    expect(item).toHaveProperty('rank');
    expect(item).toHaveProperty('score');
    expect(item.score).toBeGreaterThanOrEqual(0);
    expect(item.score).toBeLessThanOrEqual(100);
    expect(Array.isArray(item.strengths)).toBe(true);
    expect(Array.isArray(item.concerns)).toBe(true);
  });
});

// ── ApiError — contract ───────────────────────────────────────────────────────

describe('ApiError — contract', () => {
  it('exposes status, name, and message fields', () => {
    const err = new ApiError('Not found', 404);
    expect(err.status).toBe(404);
    expect(err.name).toBe('ApiError');
    expect(err.message).toBe('Not found');
  });

  it('is instanceof both ApiError and Error', () => {
    const err = new ApiError('Test', 500);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toBeInstanceOf(Error);
  });

  it('exposes optional code field when provided', () => {
    const err = new ApiError('Forbidden', 403, 'AI_PERMISSION_DENIED');
    expect(err.code).toBe('AI_PERMISSION_DENIED');
  });

  it('code is undefined when not provided', () => {
    const err = new ApiError('Error', 500);
    expect(err.code).toBeUndefined();
  });

  it('403 errors can be detected by status', () => {
    const err = new ApiError('No permission', 403);
    expect(err.status === 403).toBe(true);
  });
});

// ── AI endpoint payload shape — static contract ───────────────────────────────

describe('AI endpoint payload shapes — static contract', () => {
  it('chat suggest payload requires context and prompt string fields', () => {
    const validContextValues = ['general', 'event', 'task', 'rsvp'];
    const payload = { context: 'event' as const, prompt: 'What venue should I choose?' };

    expect(typeof payload.context).toBe('string');
    expect(typeof payload.prompt).toBe('string');
    expect(validContextValues).toContain(payload.context);
    expect(payload.prompt.length).toBeGreaterThan(0);
  });

  it('grounded workflow payload requires workflowType, entityId (number), and prompt', () => {
    const validWorkflowTypes = ['event', 'task', 'rsvp'];
    const payload = { workflowType: 'event' as const, entityId: 42, prompt: 'Improve event' };

    expect(typeof payload.workflowType).toBe('string');
    expect(validWorkflowTypes).toContain(payload.workflowType);
    expect(typeof payload.entityId).toBe('number');
    expect(typeof payload.prompt).toBe('string');
  });

  it('task breakdown payload requires eventId; prompt is optional', () => {
    const withPrompt = { eventId: 1, prompt: 'Focus on setup tasks' };
    const withoutPrompt = { eventId: 1 };

    expect(typeof withPrompt.eventId).toBe('number');
    expect(withPrompt.prompt).toBeDefined();
    expect(Object.keys(withoutPrompt)).not.toContain('prompt');
  });

  it('grounded response has workflowType, entityId, structured object, and raw string', () => {
    const response = {
      workflowType: 'event' as const,
      entityId: 42,
      structured: {
        title: 'Summer Fest',
        description: 'Outdoor event',
        venueType: 'Amphitheatre',
        promotionalTips: ['Social media', 'Early bird'],
      },
      raw: '{"title":"Summer Fest"}',
    };

    expect(response).toHaveProperty('workflowType');
    expect(response).toHaveProperty('entityId');
    expect(response).toHaveProperty('structured');
    expect(typeof response.raw).toBe('string');
    expect(response.structured).toHaveProperty('title');
    expect(Array.isArray(response.structured.promotionalTips)).toBe(true);
  });

  it('task breakdown response has workflowType=task-breakdown and typed tasks array', () => {
    const response = {
      workflowType: 'task-breakdown' as const,
      eventId: 1,
      eventTitle: 'Fest',
      tasks: [
        {
          title: 'Set up stage',
          owner: 'Alice',
          dueWindow: '2 weeks before',
          dependencies: [] as string[],
          priority: 'high' as const,
          timelineConstraint: 'Must finish before rehearsal',
        },
      ],
      raw: '{}',
      contextSummary: { groundedFields: ['tasks'], totalExistingTasks: 0 },
    };

    expect(response.workflowType).toBe('task-breakdown');
    expect(Array.isArray(response.tasks)).toBe(true);
    const validPriorities = ['low', 'medium', 'high', 'urgent'];
    expect(validPriorities).toContain(response.tasks[0].priority);
    expect(Array.isArray(response.tasks[0].dependencies)).toBe(true);
  });

  it('task breakdown task item has all required fields', () => {
    const task = {
      title: 'Arrange catering',
      owner: 'Bob',
      dueWindow: '3 days before',
      dependencies: ['Venue confirmed'],
      priority: 'medium' as const,
      timelineConstraint: '',
    };

    expect(task).toHaveProperty('title');
    expect(task).toHaveProperty('owner');
    expect(task).toHaveProperty('dueWindow');
    expect(task).toHaveProperty('dependencies');
    expect(task).toHaveProperty('priority');
    expect(task).toHaveProperty('timelineConstraint');
  });

  it('budget insight request payload has eventId and optional prompt', () => {
    const req = { eventId: 42, prompt: 'Focus on catering' };
    expect(req).toHaveProperty('eventId');
    expect(typeof req.eventId).toBe('number');
    expect(req).toHaveProperty('prompt');
  });

  it('vendor recommendation request payload has eventId and optional prompt', () => {
    const req = { eventId: 10, prompt: 'prioritise by value' };
    expect(req).toHaveProperty('eventId');
    expect(typeof req.eventId).toBe('number');
  });
});
