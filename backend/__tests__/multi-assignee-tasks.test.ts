import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Request, Response } from 'express';
import { createPostgresTestDatabase, type TestDatabase } from './helpers/postgres-test-db.js';

// Test surface for B1.2 — the multi-assignee API on top of task_assignees.
// We exercise list/create/update + the dedicated add/remove endpoints and
// assert both the response shape (assignees array) and the underlying rows
// in task_assignees (incl. the legacy assigned_user_id mirror).

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL DEFAULT 'x',
  display_name TEXT NOT NULL DEFAULT '',
  role_id INTEGER DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP
);
CREATE TABLE IF NOT EXISTS events (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  date TEXT NOT NULL DEFAULT '',
  location TEXT NOT NULL DEFAULT '',
  created_by INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  deleted_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS event_members (
  event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT DEFAULT 'Member',
  PRIMARY KEY (event_id, user_id)
);
CREATE TABLE IF NOT EXISTS tasks (
  id SERIAL PRIMARY KEY,
  event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  notes TEXT,
  assignee_name TEXT,
  assigned_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  due_date TEXT,
  status TEXT DEFAULT 'Pending',
  priority TEXT DEFAULT 'Medium',
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS task_assignees (
  task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  is_primary BOOLEAN NOT NULL DEFAULT FALSE,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (task_id, user_id)
);
CREATE TABLE IF NOT EXISTS audit_log (
  id SERIAL PRIMARY KEY,
  user_id INTEGER, email TEXT, action TEXT NOT NULL, description TEXT,
  ip_address TEXT, actor_id INTEGER, target_type TEXT, target_id TEXT,
  context JSONB, severity TEXT DEFAULT 'INFO',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
`;

let testDb: TestDatabase | undefined;
let alice: number;
let bob: number;
let carol: number;
let eventId: number;

beforeEach(async () => {
  testDb = await createPostgresTestDatabase(SCHEMA_SQL);

  // Wire the test DB into the controller via the database module's adapter.
  vi.doMock('../src/db/database.js', () => ({
    getDatabase: () => testDb,
    // event-access asserts membership against this — adapter satisfies its shape.
  }));
  // event-access.requireEventAccess does its own DB lookups; for these unit
  // tests we mock it to always grant access.
  vi.doMock('../src/utils/event-access.js', () => ({
    requireEventAccess: vi.fn().mockResolvedValue({ id: 1 }),
  }));
  vi.doMock('./activity-feed-controller.js', () => ({
    logActivity: vi.fn(),
  }));

  const usersRows = await Promise.all([
    testDb!.run(`INSERT INTO users (email, display_name) VALUES ('alice@example.com', 'Alice') RETURNING id`),
    testDb!.run(`INSERT INTO users (email, display_name) VALUES ('bob@example.com', 'Bob') RETURNING id`),
    testDb!.run(`INSERT INTO users (email, display_name) VALUES ('carol@example.com', 'Carol') RETURNING id`),
  ]);
  alice = usersRows[0].lastID!;
  bob = usersRows[1].lastID!;
  carol = usersRows[2].lastID!;
  const ev = await testDb!.run(`INSERT INTO events (title, created_by) VALUES ('Ev', $1) RETURNING id`, [alice]);
  eventId = ev.lastID!;
  for (const u of [alice, bob, carol]) {
    await testDb!.run('INSERT INTO event_members (event_id, user_id, role) VALUES ($1,$2,$3)', [eventId, u, 'Member']);
  }
});

afterEach(async () => {
  await testDb?.close();
  vi.resetModules();
});

function makeRes(): Response & { statusCode: number; body: unknown } {
  const r: Partial<Response> & { statusCode: number; body: unknown } = {
    statusCode: 200,
    body: undefined,
  };
  r.status = ((code: number) => {
    r.statusCode = code;
    return r as Response;
  }) as Response['status'];
  r.json = ((payload: unknown) => {
    r.body = payload;
    return r as Response;
  }) as Response['json'];
  return r as Response & { statusCode: number; body: unknown };
}

function makeReq(params: Record<string, string>, body: unknown, userId = alice): Request {
  return {
    params,
    body,
    user: { id: userId, email: 'alice@example.com', role_id: 1 },
  } as unknown as Request;
}

describe('multi-assignee tasks API (B1.2)', () => {
  it('createTask with assignee_user_ids writes rows in task_assignees and mirrors primary', async () => {
    const { createTask } = await import('../src/controllers/tasks-controller.js');
    const res = makeRes();
    const req = makeReq(
      { eventId: String(eventId) },
      { title: 'plan venue', assignee_user_ids: [bob, carol] },
    );
    await createTask(req as unknown as Parameters<typeof createTask>[0], res);
    expect(res.statusCode).toBe(201);
    const created = (res.body as { task: { id: number; assigned_user_id: number; assignees: unknown[] } }).task;
    expect(created.assigned_user_id).toBe(bob); // primary mirrored
    expect(created.assignees).toHaveLength(2);

    const rows = await testDb!.all<{ user_id: number; is_primary: boolean }>(
      'SELECT user_id, is_primary FROM task_assignees WHERE task_id = $1 ORDER BY is_primary DESC, assigned_at ASC',
      [created.id],
    );
    expect(rows.map((r) => r.user_id)).toEqual([bob, carol]);
    expect(rows[0].is_primary).toBe(true);
    expect(rows[1].is_primary).toBe(false);
  });

  it('createTask with legacy assigned_user_id still works and backfills task_assignees', async () => {
    const { createTask } = await import('../src/controllers/tasks-controller.js');
    const res = makeRes();
    await createTask(
      makeReq({ eventId: String(eventId) }, { title: 't', assigned_user_id: carol }) as unknown as Parameters<typeof createTask>[0],
      res,
    );
    expect(res.statusCode).toBe(201);
    const created = (res.body as { task: { id: number; assignees: unknown[] } }).task;
    expect(created.assignees).toHaveLength(1);
    const rows = await testDb!.all<{ user_id: number; is_primary: boolean }>(
      'SELECT user_id, is_primary FROM task_assignees WHERE task_id = $1',
      [created.id],
    );
    expect(rows).toEqual([{ user_id: carol, is_primary: true }]);
  });

  it('updateTask with assignee_user_ids replaces the entire assignee set', async () => {
    const { createTask, updateTask } = await import('../src/controllers/tasks-controller.js');
    const createRes = makeRes();
    await createTask(
      makeReq({ eventId: String(eventId) }, { title: 't', assignee_user_ids: [bob] }) as unknown as Parameters<typeof createTask>[0],
      createRes,
    );
    const taskId = ((createRes.body as { task: { id: number } }).task).id;

    const updateRes = makeRes();
    await updateTask(
      makeReq({ id: String(taskId), eventId: String(eventId) }, { assignee_user_ids: [carol, alice] }),
      updateRes,
    );
    expect(updateRes.statusCode).toBe(200);
    const rows = await testDb!.all<{ user_id: number; is_primary: boolean }>(
      'SELECT user_id, is_primary FROM task_assignees WHERE task_id = $1 ORDER BY is_primary DESC, assigned_at ASC',
      [taskId],
    );
    expect(rows.map((r) => r.user_id)).toEqual([carol, alice]); // bob removed
    expect(rows[0].is_primary).toBe(true);
    const mirror = await testDb!.get<{ assigned_user_id: number }>(
      'SELECT assigned_user_id FROM tasks WHERE id = $1',
      [taskId],
    );
    expect(mirror?.assigned_user_id).toBe(carol);
  });

  it('rejects assignee_user_ids containing a non-event-member', async () => {
    const { createTask } = await import('../src/controllers/tasks-controller.js');
    // Create a 4th user who is NOT a member of the event.
    const stranger = (await testDb!.run(
      `INSERT INTO users (email, display_name) VALUES ('mallory@example.com', 'Mallory') RETURNING id`,
    )).lastID!;
    const res = makeRes();
    await createTask(
      makeReq({ eventId: String(eventId) }, { title: 't', assignee_user_ids: [bob, stranger] }) as unknown as Parameters<typeof createTask>[0],
      res,
    );
    expect(res.statusCode).toBe(400);
    expect((res.body as { error: string }).error).toMatch(/not a member/i);
    // No rows written.
    const rows = await testDb!.all('SELECT * FROM task_assignees', []);
    expect(rows).toHaveLength(0);
  });

  it('addAssignee + removeAssignee endpoints adjust the M:N set and promote next primary on primary removal', async () => {
    const { createTask, addAssignee, removeAssignee } = await import('../src/controllers/tasks-controller.js');
    const createRes = makeRes();
    await createTask(
      makeReq({ eventId: String(eventId) }, { title: 't', assignee_user_ids: [alice] }) as unknown as Parameters<typeof createTask>[0],
      createRes,
    );
    const taskId = ((createRes.body as { task: { id: number } }).task).id;

    // Add bob (secondary).
    const addRes = makeRes();
    await addAssignee(
      makeReq({ eventId: String(eventId), taskId: String(taskId) }, { user_id: bob }),
      addRes,
    );
    expect(addRes.statusCode).toBe(201);

    // Remove alice (the primary) — bob should become the new primary.
    const delRes = makeRes();
    await removeAssignee(
      makeReq({ eventId: String(eventId), taskId: String(taskId), userId: String(alice) }, {}),
      delRes,
    );
    expect(delRes.statusCode).toBe(200);
    const rows = await testDb!.all<{ user_id: number; is_primary: boolean }>(
      'SELECT user_id, is_primary FROM task_assignees WHERE task_id = $1',
      [taskId],
    );
    expect(rows).toEqual([{ user_id: bob, is_primary: true }]);
    const mirror = await testDb!.get<{ assigned_user_id: number }>(
      'SELECT assigned_user_id FROM tasks WHERE id = $1',
      [taskId],
    );
    expect(mirror?.assigned_user_id).toBe(bob);
  });
});
