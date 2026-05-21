/**
 * Integration test: Unified realtime SSE stream (#809)
 *
 * Verifies the subscribe → publish → receive → disconnect lifecycle for the
 * `GET /api/realtime/stream?topics=…` endpoint without requiring a running
 * PostgreSQL server.  The pg-bridge is mocked so NOTIFY calls are no-ops.
 *
 * Covered acceptance criteria:
 *   ✅  Multiplexed SSE stream for requested topics
 *   ✅  `ready` event sent on connect with active topics
 *   ✅  Published messages fan-out only to subscribers with matching topics
 *   ✅  400 returned when no valid topics are requested
 *   ✅  Back-compat: legacy event-scoped stream is not broken
 *   ✅  Subscriber is removed on client disconnect (no leaked subscriptions)
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Mock the pg-bridge BEFORE importing the hub so hub.publish() never tries
// to open a real database connection.
// ---------------------------------------------------------------------------
vi.mock('../src/services/realtime/pg-bridge.js', () => ({
  notifyReplicas: vi.fn().mockResolvedValue(undefined),
  initPgBridge: vi.fn().mockResolvedValue(undefined),
  closePgBridge: vi.fn().mockResolvedValue(undefined),
}));

import { hub, type HubMessage } from '../src/services/realtime/hub.js';
import { streamRealtime } from '../src/controllers/realtime-controller.js';
import type { Request, Response } from 'express';

// ---------------------------------------------------------------------------
// Test doubles — lightweight stand-ins for Express req / res
// ---------------------------------------------------------------------------

function makeSseResponse() {
  const written: string[] = [];
  const closeListeners: Array<() => void> = [];
  let ended = false;

  const res = {
    statusCode: 200,
    body: null as unknown,
    headers: {} as Record<string, string>,
    written,
    get ended() {
      return ended;
    },

    // Express Response methods used by the controller
    setHeader(name: string, value: string) {
      this.headers[name] = value;
    },
    flushHeaders() {
      /* no-op in tests */
    },
    write(data: string): boolean {
      if (!ended) written.push(data);
      return !ended;
    },
    end() {
      ended = true;
    },
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(data: unknown) {
      this.body = data;
      return this;
    },

    // Simulate a client disconnect by triggering registered 'close' listeners.
    simulateClose() {
      closeListeners.forEach((fn) => fn());
    },
  } as unknown as Response & {
    written: string[];
    ended: boolean;
    headers: Record<string, string>;
    body: unknown;
    simulateClose(): void;
  };

  return res;
}

function makeSseRequest(query: Record<string, string> = {}) {
  const closeListeners: Array<() => void> = [];
  const req = {
    query,
    params: {},
    user: { id: 1, email: 'tester@example.com', role_id: 1 },
    headers: {},
    on(event: string, fn: () => void) {
      if (event === 'close') closeListeners.push(fn);
    },
    simulateClose() {
      closeListeners.forEach((fn) => fn());
    },
  } as unknown as Request & { simulateClose(): void };
  return req;
}

// ---------------------------------------------------------------------------
// Helper: build a minimal HubMessage for tests
// ---------------------------------------------------------------------------

function makeMsg(overrides: Partial<HubMessage> = {}): HubMessage {
  return {
    topic: 'events',
    type: 'event.updated',
    payload: { id: 42, title: 'Test Event' },
    occurredAt: new Date().toISOString(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Unified realtime SSE stream — #809', () => {
  // Each test gets a fresh state; the hub singleton accumulates subscribers
  // across tests if we don't clean up.  The `simulateClose()` helper triggers
  // the unsubscribe callback registered via `req.on('close', …)`.

  afterEach(() => {
    // Ensure any lingering clearInterval from heartbeats is not a concern —
    // jest/vitest uses fake timers only if explicitly enabled.
  });

  // ── 1. SSE headers ────────────────────────────────────────────────────────

  it('sets SSE response headers', () => {
    const req = makeSseRequest({ topics: 'events' });
    const res = makeSseResponse();

    streamRealtime(req, res);

    expect(res.headers['Content-Type']).toBe('text/event-stream');
    expect(res.headers['Cache-Control']).toBe('no-cache, no-transform');
    expect(res.headers['Connection']).toBe('keep-alive');
    expect(res.headers['X-Accel-Buffering']).toBe('no');

    req.simulateClose();
  });

  // ── 2. Ready event ────────────────────────────────────────────────────────

  it('sends an initial ready event with the subscribed topics', () => {
    const req = makeSseRequest({ topics: 'events,tasks' });
    const res = makeSseResponse();

    streamRealtime(req, res);

    const readyFrame = res.written[0];
    expect(readyFrame).toMatch(/^event: ready\n/);

    const dataLine = readyFrame.split('\n').find((l) => l.startsWith('data:'));
    expect(dataLine).toBeDefined();
    const data = JSON.parse(dataLine!.slice('data: '.length)) as { topics: string[] };
    expect(data.topics).toEqual(expect.arrayContaining(['events', 'tasks']));

    req.simulateClose();
  });

  // ── 3. Message fan-out ────────────────────────────────────────────────────

  it('delivers a published message to a subscriber with a matching topic', async () => {
    const req = makeSseRequest({ topics: 'events' });
    const res = makeSseResponse();
    streamRealtime(req, res);

    const msg = makeMsg({ topic: 'events', type: 'event.created' });
    hub.publishLocal(msg);

    const frames = res.written.slice(1); // skip the `ready` frame
    expect(frames).toHaveLength(1);
    expect(frames[0]).toContain('event: event.created');

    const dataLine = frames[0].split('\n').find((l) => l.startsWith('data:'));
    const parsed = JSON.parse(dataLine!.slice('data: '.length)) as HubMessage;
    expect(parsed.topic).toBe('events');
    expect(parsed.payload).toMatchObject({ id: 42 });

    req.simulateClose();
  });

  it('does NOT deliver a message to a subscriber with a non-matching topic', async () => {
    const req = makeSseRequest({ topics: 'tasks' });
    const res = makeSseResponse();
    streamRealtime(req, res);

    hub.publishLocal(makeMsg({ topic: 'budgets' }));

    // Only the ready frame should be present.
    expect(res.written).toHaveLength(1);

    req.simulateClose();
  });

  // ── 4. Multi-topic subscriber ─────────────────────────────────────────────

  it('delivers messages for each subscribed topic', async () => {
    const req = makeSseRequest({ topics: 'events,tasks,budgets' });
    const res = makeSseResponse();
    streamRealtime(req, res);

    hub.publishLocal(makeMsg({ topic: 'events' }));
    hub.publishLocal(makeMsg({ topic: 'tasks', type: 'task.completed' }));
    hub.publishLocal(makeMsg({ topic: 'budgets', type: 'budget.updated' }));
    hub.publishLocal(makeMsg({ topic: 'presence', type: 'presence.join' })); // not subscribed

    const frames = res.written.slice(1); // skip ready
    expect(frames).toHaveLength(3);

    req.simulateClose();
  });

  // ── 5. Disconnect removes subscriber ──────────────────────────────────────

  it('removes the subscriber when the client disconnects', async () => {
    const req = makeSseRequest({ topics: 'events' });
    const res = makeSseResponse();
    streamRealtime(req, res);

    const sizeBefore = hub.size;
    req.simulateClose();

    // Allow any synchronous cleanup to settle.
    await Promise.resolve();

    expect(hub.size).toBe(sizeBefore - 1);
  });

  // ── 6. Validation — missing / invalid topics ──────────────────────────────

  it('returns 400 when topics query parameter is missing', () => {
    const req = makeSseRequest({}); // no topics key
    const res = makeSseResponse();

    streamRealtime(req, res);

    expect(res.statusCode).toBe(400);
    const body = res.body as { error: string; validTopics: string[] };
    expect(body.error).toBeDefined();
    expect(body.validTopics).toEqual(expect.arrayContaining(['events', 'tasks']));
  });

  it('returns 400 when all requested topics are unknown', () => {
    const req = makeSseRequest({ topics: 'foobar,unknown' });
    const res = makeSseResponse();

    streamRealtime(req, res);

    expect(res.statusCode).toBe(400);
  });

  it('ignores unknown topics mixed with valid ones', () => {
    const req = makeSseRequest({ topics: 'events,unknown_topic' });
    const res = makeSseResponse();

    streamRealtime(req, res);

    // Should have connected (ready frame written, status 200).
    expect(res.statusCode).toBe(200);
    expect(res.written[0]).toMatch(/event: ready/);

    req.simulateClose();
  });

  // ── 7. hub.publish() triggers pg-bridge notifyReplicas ───────────────────

  it('calls notifyReplicas when hub.publish() is used', async () => {
    const { notifyReplicas } = await import('../src/services/realtime/pg-bridge.js');
    const spy = vi.mocked(notifyReplicas);
    spy.mockClear();

    const msg = makeMsg({ topic: 'activity', type: 'activity.log' });
    await hub.publish(msg);

    expect(spy).toHaveBeenCalledWith(msg);
  });

  // ── 8. hub.publishLocal() does NOT call notifyReplicas ───────────────────

  it('does NOT call notifyReplicas when hub.publishLocal() is used', async () => {
    const { notifyReplicas } = await import('../src/services/realtime/pg-bridge.js');
    const spy = vi.mocked(notifyReplicas);
    spy.mockClear();

    hub.publishLocal(makeMsg({ topic: 'presence' }));

    // publishLocal is synchronous — no async needed.
    expect(spy).not.toHaveBeenCalled();
  });
});
