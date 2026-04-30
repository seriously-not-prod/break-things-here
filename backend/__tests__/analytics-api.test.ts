/**
 * Analytics controller tests — issues #242 (overview) and #243 (per-event report)
 *
 * Tests GET /api/analytics/overview and GET /api/events/:id/report.
 * No real database — getDatabase is mocked via vi.mock.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Mock req/res helpers
// ---------------------------------------------------------------------------
function makeRes() {
  const res = {
    statusCode: 200,
    body: null as unknown,
    status(code: number) { this.statusCode = code; return this; },
    json(data: unknown) { this.body = data; return this; },
  };
  return res;
}

function makeReq(
  params: Record<string, string> = {},
  body: Record<string, unknown> = {},
) {
  return { params, body } as unknown as import('express').Request;
}

// ---------------------------------------------------------------------------
// Mock db
// ---------------------------------------------------------------------------
const mockDb = {
  all: vi.fn(),
  get: vi.fn(),
  run: vi.fn(),
  exec: vi.fn(),
};

vi.mock('../src/db/database.js', () => ({
  getDatabase: () => mockDb,
}));

import * as analyticsController from '../src/controllers/analytics-controller.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
const EVENTS_BY_STATUS = [
  { status: 'Draft', count: 2 },
  { status: 'Published', count: 5 },
];

const RSVPS_BY_STATUS = [
  { status: 'Going', count: 30 },
  { status: 'Pending', count: 10 },
];

// Helper to queue standard overview mock sequence
function queueOverviewMocks({
  totalEvents = 7,
  eventsByStatus = EVENTS_BY_STATUS,
  totalRsvps = 40,
  rsvpsByStatus = RSVPS_BY_STATUS,
  activeUsers = 5,
  overdueTasks = 3,
  totalBudget = 10000,
  totalSpent = 4500,
} = {}) {
  mockDb.all
    .mockResolvedValueOnce(eventsByStatus)   // events by status
    .mockResolvedValueOnce(rsvpsByStatus);   // rsvps by status
  mockDb.get
    .mockResolvedValueOnce({ count: totalEvents })   // total events
    .mockResolvedValueOnce({ count: totalRsvps })    // total rsvps
    .mockResolvedValueOnce({ count: activeUsers })   // active users 30d
    .mockResolvedValueOnce({ count: overdueTasks })  // overdue tasks
    .mockResolvedValueOnce({ total_budget: totalBudget, total_spent: totalSpent }); // budget
}

// ---------------------------------------------------------------------------
// getOverview tests (#242)
// ---------------------------------------------------------------------------
describe('getOverview', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('returns 200 with overview object', async () => {
    queueOverviewMocks();
    const req = makeReq();
    const res = makeRes();
    await analyticsController.getOverview(req, res as never);
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty('overview');
  });

  it('returns total_events count', async () => {
    queueOverviewMocks({ totalEvents: 12 });
    const req = makeReq();
    const res = makeRes();
    await analyticsController.getOverview(req, res as never);
    expect((res.body as { overview: { total_events: number } }).overview.total_events).toBe(12);
  });

  it('returns events_by_status array', async () => {
    queueOverviewMocks();
    const req = makeReq();
    const res = makeRes();
    await analyticsController.getOverview(req, res as never);
    const { overview } = res.body as { overview: { events_by_status: typeof EVENTS_BY_STATUS } };
    expect(overview.events_by_status).toEqual(EVENTS_BY_STATUS);
  });

  it('returns total_rsvps count', async () => {
    queueOverviewMocks({ totalRsvps: 99 });
    const req = makeReq();
    const res = makeRes();
    await analyticsController.getOverview(req, res as never);
    expect((res.body as { overview: { total_rsvps: number } }).overview.total_rsvps).toBe(99);
  });

  it('returns rsvps_by_status breakdown', async () => {
    queueOverviewMocks();
    const req = makeReq();
    const res = makeRes();
    await analyticsController.getOverview(req, res as never);
    const { overview } = res.body as { overview: { rsvps_by_status: typeof RSVPS_BY_STATUS } };
    expect(overview.rsvps_by_status).toEqual(RSVPS_BY_STATUS);
  });

  it('returns active_users_30d', async () => {
    queueOverviewMocks({ activeUsers: 42 });
    const req = makeReq();
    const res = makeRes();
    await analyticsController.getOverview(req, res as never);
    expect((res.body as { overview: { active_users_30d: number } }).overview.active_users_30d).toBe(42);
  });

  it('returns overdue_tasks count', async () => {
    queueOverviewMocks({ overdueTasks: 7 });
    const req = makeReq();
    const res = makeRes();
    await analyticsController.getOverview(req, res as never);
    expect((res.body as { overview: { overdue_tasks: number } }).overview.overdue_tasks).toBe(7);
  });

  it('returns budget total_budget and total_spent', async () => {
    queueOverviewMocks({ totalBudget: 50000, totalSpent: 20000 });
    const req = makeReq();
    const res = makeRes();
    await analyticsController.getOverview(req, res as never);
    const { budget } = (res.body as { overview: { budget: { total_budget: number; total_spent: number } } }).overview;
    expect(budget.total_budget).toBe(50000);
    expect(budget.total_spent).toBe(20000);
  });

  it('calculates utilisation_pct correctly', async () => {
    queueOverviewMocks({ totalBudget: 10000, totalSpent: 2500 });
    const req = makeReq();
    const res = makeRes();
    await analyticsController.getOverview(req, res as never);
    const { budget } = (res.body as { overview: { budget: { utilisation_pct: number } } }).overview;
    expect(budget.utilisation_pct).toBe(25);
  });

  it('returns utilisation_pct of 0 when no budget set', async () => {
    queueOverviewMocks({ totalBudget: 0, totalSpent: 0 });
    const req = makeReq();
    const res = makeRes();
    await analyticsController.getOverview(req, res as never);
    const { budget } = (res.body as { overview: { budget: { utilisation_pct: number } } }).overview;
    expect(budget.utilisation_pct).toBe(0);
  });

  it('active_users_30d uses INTERVAL 30 days SQL', async () => {
    queueOverviewMocks();
    const req = makeReq();
    const res = makeRes();
    await analyticsController.getOverview(req, res as never);
    const activeUsersSql = mockDb.get.mock.calls[2][0] as string;
    expect(activeUsersSql).toMatch(/30 days/i);
  });

  it('overdue_tasks excludes Complete and Completed status', async () => {
    queueOverviewMocks();
    const req = makeReq();
    const res = makeRes();
    await analyticsController.getOverview(req, res as never);
    const overdueTasksSql = mockDb.get.mock.calls[3][0] as string;
    expect(overdueTasksSql).toContain('Complete');
    expect(overdueTasksSql).toContain('Completed');
  });
});

// ---------------------------------------------------------------------------
// Fixtures for event report
// ---------------------------------------------------------------------------
const EVENT = {
  id: 10,
  title: 'Summer Fest',
  description: 'Annual festival',
  location: 'Hyde Park',
  event_date: '2026-07-01',
  status: 'Published',
  capacity: 500,
  creator_name: 'Alice',
};

const RSVP_BREAKDOWN = [
  { status: 'Going', count: 100, total_guests: 110 },
  { status: 'Pending', count: 50, total_guests: 50 },
];

const TASK_BREAKDOWN = [
  { status: 'Complete', count: 8 },
  { status: 'Pending', count: 2 },
];

const EXPENSE_BY_CAT = [
  { category: 'Catering', count: 3, amount: 2000 },
];

function queueReportMocks({
  event = EVENT as typeof EVENT | null,
  rsvpBreakdown = RSVP_BREAKDOWN,
  totalRsvpRow = { count: 150, total_guests: 160 },
  taskBreakdown = TASK_BREAKDOWN,
  totalTasksRow = { total: 10, completed: 8 },
  budget = { total_budget: 5000, currency: 'USD', notes: null } as { total_budget: number; currency: string; notes: null } | null,
  spendRow = { total_spent: 2000 },
  expensesByCat = EXPENSE_BY_CAT,
} = {}) {
  // get: event
  mockDb.get.mockResolvedValueOnce(event);
  // all: rsvp breakdown
  mockDb.all.mockResolvedValueOnce(rsvpBreakdown);
  // get: total rsvp
  mockDb.get.mockResolvedValueOnce(totalRsvpRow);
  // all: task breakdown
  mockDb.all.mockResolvedValueOnce(taskBreakdown);
  // get: total tasks + completed
  mockDb.get.mockResolvedValueOnce(totalTasksRow);
  // get: budget
  mockDb.get.mockResolvedValueOnce(budget);
  // get: spend
  mockDb.get.mockResolvedValueOnce(spendRow);
  // all: expenses by category
  mockDb.all.mockResolvedValueOnce(expensesByCat);
}

// ---------------------------------------------------------------------------
// getEventReport tests (#243)
// ---------------------------------------------------------------------------
describe('getEventReport', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('returns 404 when event not found', async () => {
    mockDb.get.mockResolvedValueOnce(null);
    const req = makeReq({ id: '999' });
    const res = makeRes();
    await analyticsController.getEventReport(req, res as never);
    expect(res.statusCode).toBe(404);
    expect((res.body as { error: string }).error).toMatch(/event not found/i);
  });

  it('returns 200 with report object', async () => {
    queueReportMocks();
    const req = makeReq({ id: '10' });
    const res = makeRes();
    await analyticsController.getEventReport(req, res as never);
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty('report');
  });

  it('includes event metadata in report', async () => {
    queueReportMocks();
    const req = makeReq({ id: '10' });
    const res = makeRes();
    await analyticsController.getEventReport(req, res as never);
    const { report } = res.body as { report: { event: typeof EVENT } };
    expect(report.event.title).toBe('Summer Fest');
  });

  it('includes generated_at timestamp', async () => {
    queueReportMocks();
    const req = makeReq({ id: '10' });
    const res = makeRes();
    await analyticsController.getEventReport(req, res as never);
    const { report } = res.body as { report: { generated_at: string } };
    expect(report.generated_at).toBeTruthy();
    expect(new Date(report.generated_at).getFullYear()).toBe(new Date().getFullYear());
  });

  it('returns RSVP breakdown with status counts', async () => {
    queueReportMocks();
    const req = makeReq({ id: '10' });
    const res = makeRes();
    await analyticsController.getEventReport(req, res as never);
    const { report } = res.body as { report: { rsvps: { breakdown: typeof RSVP_BREAKDOWN } } };
    expect(report.rsvps.breakdown).toEqual(RSVP_BREAKDOWN);
  });

  it('returns total rsvp count and total_guests', async () => {
    queueReportMocks();
    const req = makeReq({ id: '10' });
    const res = makeRes();
    await analyticsController.getEventReport(req, res as never);
    const { rsvps } = (res.body as { report: { rsvps: { total: number; total_guests: number } } }).report;
    expect(rsvps.total).toBe(150);
    expect(rsvps.total_guests).toBe(160);
  });

  it('returns task completion_pct correctly', async () => {
    queueReportMocks({ totalTasksRow: { total: 10, completed: 8 } });
    const req = makeReq({ id: '10' });
    const res = makeRes();
    await analyticsController.getEventReport(req, res as never);
    const { tasks } = (res.body as { report: { tasks: { completion_pct: number } } }).report;
    expect(tasks.completion_pct).toBe(80);
  });

  it('returns completion_pct of 0 when no tasks', async () => {
    queueReportMocks({ totalTasksRow: { total: 0, completed: 0 }, taskBreakdown: [] });
    const req = makeReq({ id: '10' });
    const res = makeRes();
    await analyticsController.getEventReport(req, res as never);
    const { tasks } = (res.body as { report: { tasks: { completion_pct: number } } }).report;
    expect(tasks.completion_pct).toBe(0);
  });

  it('returns task breakdown by status', async () => {
    queueReportMocks();
    const req = makeReq({ id: '10' });
    const res = makeRes();
    await analyticsController.getEventReport(req, res as never);
    const { tasks } = (res.body as { report: { tasks: { breakdown: typeof TASK_BREAKDOWN } } }).report;
    expect(tasks.breakdown).toEqual(TASK_BREAKDOWN);
  });

  it('returns budget total_budget, total_spent, remaining', async () => {
    queueReportMocks();
    const req = makeReq({ id: '10' });
    const res = makeRes();
    await analyticsController.getEventReport(req, res as never);
    const { budget } = (res.body as { report: { budget: { total_budget: number; total_spent: number; remaining: number } } }).report;
    expect(budget.total_budget).toBe(5000);
    expect(budget.total_spent).toBe(2000);
    expect(budget.remaining).toBe(3000);
  });

  it('returns budget utilisation_pct correctly', async () => {
    queueReportMocks({ budget: { total_budget: 5000, currency: 'USD', notes: null }, spendRow: { total_spent: 1000 } });
    const req = makeReq({ id: '10' });
    const res = makeRes();
    await analyticsController.getEventReport(req, res as never);
    const { budget } = (res.body as { report: { budget: { utilisation_pct: number } } }).report;
    expect(budget.utilisation_pct).toBe(20);
  });

  it('returns expenses_by_category grouped list', async () => {
    queueReportMocks();
    const req = makeReq({ id: '10' });
    const res = makeRes();
    await analyticsController.getEventReport(req, res as never);
    const { budget } = (res.body as { report: { budget: { expenses_by_category: typeof EXPENSE_BY_CAT } } }).report;
    expect(budget.expenses_by_category).toEqual(EXPENSE_BY_CAT);
  });

  it('returns set: false when no budget configured', async () => {
    queueReportMocks({ budget: null });
    const req = makeReq({ id: '10' });
    const res = makeRes();
    await analyticsController.getEventReport(req, res as never);
    const { budget } = (res.body as { report: { budget: { set: boolean } } }).report;
    expect(budget.set).toBe(false);
  });

  it('expenses grouped by category use LEFT JOIN expense_categories', async () => {
    queueReportMocks();
    const req = makeReq({ id: '10' });
    const res = makeRes();
    await analyticsController.getEventReport(req, res as never);
    // all calls: [0] rsvp breakdown, [1] task breakdown, [2] expenses_by_category
    const catSql = mockDb.all.mock.calls[2][0] as string;
    expect(catSql).toContain('LEFT JOIN expense_categories');
  });
});
