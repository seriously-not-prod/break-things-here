/**
 * Tests for Global Express Error Handler (#268, #291, #254)
 *
 * Acceptance criteria:
 * - Consistent { error: string, code?: string } JSON response shape
 * - Correct HTTP status codes for AppError, multer errors, and generic errors
 * - asyncHandler forwards async rejections to the error pipeline
 */

import { describe, expect, it, vi } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import { errorHandler, asyncHandler, AppError } from '../src/middleware/error-handler.js';

/** Build a minimal mock of Express Response that captures status/json calls. */
function mockRes() {
  const res = {
    _status: 200,
    _body: undefined as unknown,
    status(code: number) { this._status = code; return this; },
    json(body: unknown) { this._body = body; return this; },
  } as unknown as Response & { _status: number; _body: unknown };
  return res;
}

const mockReq = {} as Request;
const mockNext: NextFunction = vi.fn();

describe('errorHandler middleware (#268 / #291)', () => {
  it('returns 500 with safe { error } message for a plain Error', () => {
    const res = mockRes();
    errorHandler(new Error('Something broke'), mockReq, res, mockNext);
    expect(res._status).toBe(500);
    expect((res._body as { error: string }).error).toBe('Internal server error');
    // Must not expose internals
    expect((res._body as { error: string }).error).not.toContain('Something broke');
  });

  it('returns correct status and { error, code } for AppError with code', () => {
    const res = mockRes();
    errorHandler(new AppError('Not found', 404, 'NOT_FOUND'), mockReq, res, mockNext);
    expect(res._status).toBe(404);
    expect(res._body).toEqual({ error: 'Not found', code: 'NOT_FOUND' });
  });

  it('returns correct status and { error } (no code key) for AppError without code', () => {
    const res = mockRes();
    errorHandler(new AppError('Forbidden', 403), mockReq, res, mockNext);
    expect(res._status).toBe(403);
    expect((res._body as Record<string, unknown>)).toHaveProperty('error', 'Forbidden');
    expect((res._body as Record<string, unknown>)).not.toHaveProperty('code');
  });

  it('defaults to 500 when AppError has no explicit status', () => {
    const res = mockRes();
    errorHandler(new AppError('Oops'), mockReq, res, mockNext);
    expect(res._status).toBe(500);
  });

  it('returns 413 with LIMIT_FILE_SIZE code for multer file-size error', () => {
    const res = mockRes();
    const multerErr = Object.assign(new Error('File too large'), { code: 'LIMIT_FILE_SIZE' });
    errorHandler(multerErr, mockReq, res, mockNext);
    expect(res._status).toBe(413);
    expect((res._body as Record<string, unknown>)).toHaveProperty('code', 'LIMIT_FILE_SIZE');
  });

  it('returns 400 for other multer errors', () => {
    const res = mockRes();
    const multerErr = Object.assign(new Error('Bad file type'), { code: 'LIMIT_UNEXPECTED_FILE' });
    errorHandler(multerErr, mockReq, res, mockNext);
    expect(res._status).toBe(400);
  });

  it('returns 500 for unknown thrown values (non-Error)', () => {
    const res = mockRes();
    errorHandler('string error', mockReq, res, mockNext);
    expect(res._status).toBe(500);
    expect((res._body as { error: string }).error).toBe('Internal server error');
  });
});

describe('asyncHandler utility (#291)', () => {
  it('calls next(err) when the async handler rejects', async () => {
    const next = vi.fn();
    const err = new AppError('Async failure', 422, 'ASYNC_FAIL');

    const handler = asyncHandler(async () => {
      throw err;
    });

    await handler(mockReq, mockRes(), next);
    expect(next).toHaveBeenCalledWith(err);
  });

  it('does not call next when the async handler resolves', async () => {
    const next = vi.fn();
    const res = mockRes();

    const handler = asyncHandler(async (_req, r) => {
      (r as Response & { json: (b: unknown) => void }).json({ ok: true });
    });

    await handler(mockReq, res, next);
    expect(next).not.toHaveBeenCalled();
    expect((res._body as { ok: boolean }).ok).toBe(true);
  });
});
