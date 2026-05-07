/**
 * Tracking controller unit tests — covers open pixel and click redirect (#465, #466).
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Request, Response } from 'express';

const mockDb = {
  run: vi.fn(),
};
vi.mock('../src/db/database', () => ({ getDatabase: () => mockDb }));

import { recordClick, recordOpen } from '../src/controllers/tracking-controller';
import { buildClickToken, buildOpenToken } from '../src/utils/tracking-token';

beforeEach(() => {
  process.env.TRACKING_TOKEN_SECRET = 'test-secret-do-not-use-in-prod';
  mockDb.run.mockReset();
  mockDb.run.mockResolvedValue({ changes: 1 });
});

function makeRes(): Response & {
  _status?: number;
  _body?: unknown;
  _headers: Record<string, string>;
  _redirected?: { code: number; url: string };
} {
  const res: any = {
    _headers: {},
    set: function (h: Record<string, string>) {
      Object.assign(res._headers, h);
      return res;
    },
    setHeader: function (k: string, v: string) {
      res._headers[k] = v;
      return res;
    },
    status: function (code: number) {
      res._status = code;
      return res;
    },
    send: function (body: unknown) {
      res._body = body;
      return res;
    },
    redirect: function (code: number, url: string) {
      res._redirected = { code, url };
      return res;
    },
  };
  return res;
}

function makeReq(token: string, ip = '203.0.113.7', ua = 'TestAgent/1.0'): Request {
  return {
    params: { token },
    headers: { 'user-agent': ua, 'x-forwarded-for': ip },
    ip,
    socket: { remoteAddress: ip },
  } as unknown as Request;
}

describe('recordOpen', () => {
  it('records an open and returns a transparent gif for a valid token', async () => {
    const token = buildOpenToken(123);
    const res = makeRes();
    await recordOpen(makeReq(token), res);

    expect(mockDb.run).toHaveBeenCalledTimes(1);
    const [sql, params] = mockDb.run.mock.calls[0];
    expect(sql).toMatch(/INSERT INTO communication_tracking_events/);
    expect(params).toEqual([123, 'open', null, '203.0.113.7', 'TestAgent/1.0']);

    expect(res._status).toBe(200);
    expect(res._headers['Content-Type']).toBe('image/gif');
    expect(Buffer.isBuffer(res._body)).toBe(true);
  });

  it('still returns the pixel when the token is invalid (no row inserted)', async () => {
    const res = makeRes();
    await recordOpen(makeReq('garbage'), res);

    expect(mockDb.run).not.toHaveBeenCalled();
    expect(res._status).toBe(200);
    expect(res._headers['Content-Type']).toBe('image/gif');
  });

  it('does not throw when the database insert fails', async () => {
    mockDb.run.mockRejectedValueOnce(new Error('FK violation'));
    const token = buildOpenToken(99);
    const res = makeRes();
    await expect(recordOpen(makeReq(token), res)).resolves.toBeUndefined();
    expect(res._status).toBe(200);
  });
});

describe('recordClick', () => {
  it('redirects to the embedded URL after recording the click', async () => {
    const token = buildClickToken(55, 'https://example.com/landing');
    const res = makeRes();
    await recordClick(makeReq(token), res);

    expect(mockDb.run).toHaveBeenCalledTimes(1);
    const [sql, params] = mockDb.run.mock.calls[0];
    expect(sql).toMatch(/INSERT INTO communication_tracking_events/);
    expect(params).toEqual([
      55,
      'click',
      'https://example.com/landing',
      '203.0.113.7',
      'TestAgent/1.0',
    ]);

    expect(res._redirected).toEqual({ code: 302, url: 'https://example.com/landing' });
  });

  it('returns 404 for a malformed token', async () => {
    const res = makeRes();
    await recordClick(makeReq('not-a-token'), res);
    expect(mockDb.run).not.toHaveBeenCalled();
    expect(res._status).toBe(404);
  });

  it('refuses to redirect to a non-http(s) target', async () => {
    // Hand-craft a click token that signs a javascript: URL. The verifier will
    // accept it (signature is valid), but the controller must still 404.
    const unsafe = buildClickToken(7, 'javascript:alert(1)');
    const res = makeRes();
    await recordClick(makeReq(unsafe), res);
    expect(mockDb.run).not.toHaveBeenCalled();
    expect(res._status).toBe(404);
  });
});
