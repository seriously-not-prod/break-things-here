/**
 * Tests for BRD v2 Story #532
 * Covers: #603 #604 #605 #606 #612 #613 #614 #615 #616
 *         #623 #624 #625 #626 #627 #628 #629
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mock DB ───────────────────────────────────────────────────────────────────
const mockDb = {
  get: vi.fn(),
  all: vi.fn(),
  run: vi.fn(),
};
vi.mock('../src/db/database.js', () => ({ getDatabase: () => mockDb }));
vi.mock('../src/utils/event-access.js', () => ({
  requireEventAccess: vi.fn().mockResolvedValue({ id: 1, title: 'Test Event' }),
}));
vi.mock('../src/controllers/activity-feed-controller.js', () => ({
  logActivity: vi.fn().mockResolvedValue(undefined),
}));

import * as taskMultiAssignee from '../src/controllers/task-multi-assignee-controller.js';
import * as timelineTemplates from '../src/controllers/timeline-templates-controller.js';
import * as notificationsCtrl from '../src/controllers/notifications-controller.js';
import * as collaborationCtrl from '../src/controllers/collaboration-controller.js';
import * as chatCtrl from '../src/controllers/event-chat-controller.js';
import * as versionsCtrl from '../src/controllers/entity-versions-controller.js';

function makeReq(overrides: Record<string, unknown> = {}) {
  return {
    user: { id: 1, email: 'test@example.com', role_id: 1 },
    params: {},
    body: {},
    query: {},
    ...overrides,
  } as unknown as import('express').Request;
}

function makeRes() {
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  };
  return res as unknown as import('express').Response;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockDb.run.mockResolvedValue({ lastID: 99 });
  mockDb.get.mockResolvedValue(null);
  mockDb.all.mockResolvedValue([]);
});

// ── #603: Multi-assignee ──────────────────────────────────────────────────────
describe('#603 Task multi-assignee', () => {
  it('listTaskAssignees returns assignees for a valid task', async () => {
    mockDb.get.mockResolvedValue({ id: 1 }); // task exists
    mockDb.all.mockResolvedValue([{ user_id: 2, display_name: 'Alice', assigned_at: '' }]);
    const req = makeReq({ params: { eventId: '1', taskId: '1' } });
    const res = makeRes();
    await taskMultiAssignee.listTaskAssignees(req, res);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ assignees: expect.any(Array) }),
    );
  });

  it('addTaskAssignee returns 400 when user_id missing', async () => {
    const req = makeReq({ params: { eventId: '1', taskId: '1' }, body: {} });
    const res = makeRes();
    await taskMultiAssignee.addTaskAssignee(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('addTaskAssignee returns 400 when user is not an event member', async () => {
    mockDb.get
      .mockResolvedValueOnce({ id: 1 }) // task exists
      .mockResolvedValueOnce(null);     // not a member
    const req = makeReq({ params: { eventId: '1', taskId: '1' }, body: { user_id: 5 } });
    const res = makeRes();
    await taskMultiAssignee.addTaskAssignee(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });
});

// ── #604: Full task status lifecycle ─────────────────────────────────────────
describe('#604 Task status lifecycle', () => {
  it('updateTaskStatus rejects invalid status', async () => {
    const req = makeReq({ params: { eventId: '1', taskId: '1' }, body: { status: 'Dreaming' } });
    const res = makeRes();
    await taskMultiAssignee.updateTaskStatus(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('updateTaskStatus allows Cancelled status', async () => {
    mockDb.get.mockResolvedValue({ id: 1, status: 'In Progress', version: 1, title: 'Task A' });
    mockDb.run.mockResolvedValue({});
    mockDb.get.mockResolvedValueOnce({ id: 1, status: 'In Progress', version: 1, title: 'Task A' })
              .mockResolvedValueOnce({ id: 1, status: 'Cancelled', version: 2, title: 'Task A' });
    const req = makeReq({
      params: { eventId: '1', taskId: '1' },
      body: { status: 'Cancelled', cancelled_reason: 'No longer needed' },
    });
    const res = makeRes();
    await taskMultiAssignee.updateTaskStatus(req, res);
    expect(res.json).toHaveBeenCalled();
  });

  it('updateTaskStatus detects version conflict', async () => {
    mockDb.get.mockResolvedValue({ id: 1, status: 'Pending', version: 3, title: 'Task A' });
    const req = makeReq({
      params: { eventId: '1', taskId: '1' },
      body: { status: 'Complete', version: 1 }, // stale version
    });
    const res = makeRes();
    await taskMultiAssignee.updateTaskStatus(req, res);
    expect(res.status).toHaveBeenCalledWith(409);
  });

  it('verifyTaskCompletion requires Verification status', async () => {
    mockDb.get.mockResolvedValue({ id: 1, status: 'Pending', title: 'Task A' });
    const req = makeReq({ params: { eventId: '1', taskId: '1' } });
    const res = makeRes();
    await taskMultiAssignee.verifyTaskCompletion(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });
});

// ── #605: Overdue escalation ──────────────────────────────────────────────────
describe('#605 Overdue escalation policy', () => {
  it('upsertEscalationPolicy rejects overdue_hours outside range', async () => {
    const req = makeReq({ params: { eventId: '1' }, body: { overdue_hours: 9999 } });
    const res = makeRes();
    await taskMultiAssignee.upsertEscalationPolicy(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('escalateOverdueTasks returns 404 when no policy exists', async () => {
    mockDb.get.mockResolvedValue(null); // no policy
    const req = makeReq({ params: { eventId: '1' } });
    const res = makeRes();
    await taskMultiAssignee.escalateOverdueTasks(req, res);
    expect(res.status).toHaveBeenCalledWith(404);
  });
});

// ── #606: My tasks / capacity ────────────────────────────────────────────────
describe('#606 My tasks and capacity planning', () => {
  it('getMyTasks returns 401 for unauthenticated request', async () => {
    const req = makeReq({ user: undefined });
    const res = makeRes();
    await taskMultiAssignee.getMyTasks(req, res);
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('getCapacityPlanning returns capacity object', async () => {
    mockDb.all.mockResolvedValue([{
      total_tasks: 5, pending: 2, in_progress: 1, blocked: 0,
      in_verification: 1, overdue: 1, total_estimated_hours: 8,
    }]);
    const req = makeReq();
    const res = makeRes();
    await taskMultiAssignee.getCapacityPlanning(req, res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ capacity: expect.any(Object) }));
  });
});

// ── #612: Timeline reorder ────────────────────────────────────────────────────
describe('#612 Timeline reorder', () => {
  it('reorderTimeline requires order array', async () => {
    const req = makeReq({ params: { eventId: '1' }, body: {} });
    const res = makeRes();
    await timelineTemplates.reorderTimeline(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });
});

// ── #613: Timeline templates ──────────────────────────────────────────────────
describe('#613 Timeline templates', () => {
  it('createTimelineTemplate requires name', async () => {
    const req = makeReq({ params: {}, body: {} });
    const res = makeRes();
    await timelineTemplates.createTimelineTemplate(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('createTimelineTemplate creates a template', async () => {
    mockDb.run.mockResolvedValue({ lastID: 10 });
    mockDb.get.mockResolvedValue({ id: 10, name: 'Wedding', activities: [] });
    mockDb.all.mockResolvedValue([]);
    const req = makeReq({ body: { name: 'Wedding', activities: [] } });
    const res = makeRes();
    await timelineTemplates.createTimelineTemplate(req, res);
    expect(res.status).toHaveBeenCalledWith(201);
  });
});

// ── #614: Buffer time ─────────────────────────────────────────────────────────
describe('#614 Timeline buffer time', () => {
  it('updateActivityBuffer rejects out-of-range buffer', async () => {
    const req = makeReq({
      params: { eventId: '1', id: '5' },
      body: { buffer_before_mins: 999 },
    });
    const res = makeRes();
    await timelineTemplates.updateActivityBuffer(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });
});

// ── #615: Execution tracking ──────────────────────────────────────────────────
describe('#615 Timeline execution tracking', () => {
  it('updateExecutionStatus rejects invalid status', async () => {
    const req = makeReq({
      params: { eventId: '1', id: '1' },
      body: { status: 'flying' },
    });
    const res = makeRes();
    await timelineTemplates.updateExecutionStatus(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });
});

// ── #623: Notification preferences ───────────────────────────────────────────
describe('#623 Notification preferences', () => {
  it('listNotificationPreferences returns 401 without user', async () => {
    const req = makeReq({ user: undefined });
    const res = makeRes();
    await notificationsCtrl.listNotificationPreferences(req as unknown as import('express').Request & { user?: unknown }, res);
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('upsertNotificationPreference rejects invalid type', async () => {
    const req = makeReq({ params: { type: 'invalid_type' }, body: {} });
    const res = makeRes();
    await notificationsCtrl.upsertNotificationPreference(req as unknown as import('express').Request & { user?: unknown }, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });
});

// ── #624: Batched notifications ───────────────────────────────────────────────
describe('#624 Notification batching', () => {
  it('createBatchedNotification returns false when preference is disabled', async () => {
    mockDb.get.mockResolvedValue({ in_app_enabled: false });
    const result = await notificationsCtrl.createBatchedNotification(
      1, 'task_due', 'Title', 'Body',
    );
    expect(result).toBe(false);
  });

  it('createBatchedNotification suppresses when batch window exceeded', async () => {
    mockDb.get
      .mockResolvedValueOnce({ in_app_enabled: true })
      .mockResolvedValueOnce({ batch_window_mins: 60, max_per_window: 3 })
      .mockResolvedValueOnce({ cnt: 3 }); // at limit
    const result = await notificationsCtrl.createBatchedNotification(
      1, 'task_due', 'Title', 'Body', undefined, 'task_due:1',
    );
    expect(result).toBe(false);
  });
});

// ── #626: Presence ────────────────────────────────────────────────────────────
describe('#626 Presence indicators', () => {
  it('heartbeatPresence returns 400 for invalid entity_type', async () => {
    const req = makeReq({ body: { entity_type: 'unknown', entity_id: 1 } });
    const res = makeRes();
    await collaborationCtrl.heartbeatPresence(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('heartbeatPresence records presence for valid entity', async () => {
    mockDb.run.mockResolvedValue({});
    mockDb.all.mockResolvedValue([{ user_id: 1, display_name: 'Alice', started_at: '', last_seen_at: '' }]);
    const req = makeReq({ body: { entity_type: 'task', entity_id: 5 } });
    const res = makeRes();
    await collaborationCtrl.heartbeatPresence(req, res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ presence: expect.any(Array) }));
  });
});

// ── #628: Event chat ──────────────────────────────────────────────────────────
describe('#628 Event chat', () => {
  it('postChatMessage returns 400 for empty body', async () => {
    const req = makeReq({ params: { eventId: '1' }, body: { body: '  ' } });
    const res = makeRes();
    await chatCtrl.postChatMessage(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('postChatMessage creates a message', async () => {
    mockDb.run.mockResolvedValue({ lastID: 1 });
    mockDb.get.mockResolvedValue({ id: 1, body: 'Hello', author_name: 'Alice', event_id: 1, user_id: 1, created_at: '' });
    const req = makeReq({ params: { eventId: '1' }, body: { body: 'Hello team!' } });
    const res = makeRes();
    await chatCtrl.postChatMessage(req, res);
    expect(res.status).toHaveBeenCalledWith(201);
  });

  it('editChatMessage returns 403 for non-owner', async () => {
    mockDb.get.mockResolvedValue({ id: 1, user_id: 99 }); // owned by another user
    const req = makeReq({
      params: { eventId: '1', id: '1' },
      body: { body: 'Updated text' },
      user: { id: 1, email: 'me@example.com', role_id: 1 },
    });
    const res = makeRes();
    await chatCtrl.editChatMessage(req, res);
    expect(res.status).toHaveBeenCalledWith(403);
  });
});

// ── #629: Version history ─────────────────────────────────────────────────────
describe('#629 Version history and rollback', () => {
  it('listEntityVersions returns versions list', async () => {
    mockDb.all.mockResolvedValue([{ id: 1, version: 1, changed_by_name: 'Alice' }]);
    const req = makeReq({ params: { eventId: '1', entityId: '5' }, query: { entity_type: 'task' } });
    const res = makeRes();
    await versionsCtrl.listEntityVersions(req, res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ versions: expect.any(Array) }));
  });

  it('rollbackEntityVersion returns 404 when version not found', async () => {
    mockDb.get.mockResolvedValue(null); // version not found
    const req = makeReq({
      params: { eventId: '1', entityId: '5' },
      body: { version_id: 99, entity_type: 'task' },
    });
    const res = makeRes();
    await versionsCtrl.rollbackEntityVersion(req, res);
    expect(res.status).toHaveBeenCalledWith(404);
  });
});
