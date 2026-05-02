/**
 * Tests for Enriched Health Check Endpoint (#257)
 *
 * Validates structured response with DB connectivity verification.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { initializeDatabase, closeDatabase } from '../src/db/database.js';
import { healthCheck } from '../src/controllers/health-controller.js';
import { Request, Response } from 'express';

function createMockReq(): Request {
  return {} as Request;
}

function createMockRes() {
  const res = {
    statusCode: 200,
    body: undefined as unknown,
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    json(data: unknown) {
      res.body = data;
      return res;
    },
  };
  return res as unknown as Response & { statusCode: number; body: unknown };
}

describe('Health Check Endpoint', () => {
  beforeEach(async () => {
    process.env.DATABASE_URL = ':memory:';
    await initializeDatabase();
  });

  afterEach(async () => {
    await closeDatabase();
  });

  it('should return healthy status when DB is reachable', async () => {
    const req = createMockReq();
    const res = createMockRes();

    await healthCheck(req, res);

    expect(res.statusCode).toBe(200);
    const body = res.body as { status: string; uptime: number; db: string; timestamp: string };
    expect(body.status).toBe('healthy');
    expect(body.db).toBe('ok');
    expect(body.uptime).toBeGreaterThan(0);
    expect(body.timestamp).toBeDefined();
  });

  it('should return degraded status when DB fails', async () => {
    // Close DB to simulate failure
    await closeDatabase();

    const req = createMockReq();
    const res = createMockRes();

    await healthCheck(req, res);

    expect(res.statusCode).toBe(503);
    const body = res.body as { status: string; db: string };
    expect(body.status).toBe('degraded');
    expect(body.db).toBe('error');
  });

  it('should include ISO timestamp in response', async () => {
    const req = createMockReq();
    const res = createMockRes();

    await healthCheck(req, res);

    const body = res.body as { timestamp: string };
    // Validate ISO 8601 format
    const parsed = new Date(body.timestamp);
    expect(parsed.toISOString()).toBe(body.timestamp);
  });
});
