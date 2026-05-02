/**
 * Tests for Admin Settings Controller (#244)
 *
 * Validates CRUD operations for system settings.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { initializeDatabase, getDatabase, closeDatabase } from '../src/db/database.js';
import { getSettings, updateSettings } from '../src/controllers/settings-controller.js';
import { Request, Response } from 'express';

function createMockReq(body?: Record<string, unknown>): Request {
  return {
    body: body ?? {},
    user: { id: 1 },
  } as unknown as Request;
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

const originalDatabaseUrl = process.env.DATABASE_URL;

describe('Admin Settings Controller', () => {
  beforeEach(async () => {
    if (!originalDatabaseUrl) process.env.DATABASE_URL = ':memory:';
    await initializeDatabase();
    // Create a test user for FK references
    const db = getDatabase();
    await db.run(
      `INSERT INTO users (email, password_hash, display_name) VALUES (?, ?, ?)`,
      ['admin@test.com', 'hash123', 'Admin User'],
    );
  });

  afterEach(async () => {
    await closeDatabase();
  });

  it('should return empty settings list initially', async () => {
    const req = createMockReq();
    const res = createMockRes();

    await getSettings(req, res);

    expect(res.statusCode).toBe(200);
    expect((res.body as { settings: unknown[] }).settings).toEqual([]);
  });

  it('should create and retrieve settings', async () => {
    const updateReq = createMockReq({
      settings: { 'app.name': 'Festival Pro', 'app.timezone': 'UTC' },
    });
    const updateRes = createMockRes();

    await updateSettings(updateReq, updateRes);
    expect(updateRes.statusCode).toBe(200);
    expect((updateRes.body as { updated: string[] }).updated).toContain('app.name');
    expect((updateRes.body as { updated: string[] }).updated).toContain('app.timezone');

    // Now retrieve
    const getReq = createMockReq();
    const getRes = createMockRes();
    await getSettings(getReq, getRes);

    const settings = (getRes.body as { settings: Array<{ key: string; value: string }> }).settings;
    expect(settings).toHaveLength(2);
    expect(settings.find((s) => s.key === 'app.name')?.value).toBe('Festival Pro');
  });

  it('should update existing settings (upsert)', async () => {
    const req1 = createMockReq({ settings: { 'app.name': 'Original' } });
    await updateSettings(req1, createMockRes());

    const req2 = createMockReq({ settings: { 'app.name': 'Updated' } });
    const res2 = createMockRes();
    await updateSettings(req2, res2);

    expect(res2.statusCode).toBe(200);

    const getRes = createMockRes();
    await getSettings(createMockReq(), getRes);
    const settings = (getRes.body as { settings: Array<{ key: string; value: string }> }).settings;
    expect(settings[0].value).toBe('Updated');
  });

  it('should reject invalid setting keys', async () => {
    const req = createMockReq({ settings: { 'invalid key!': 'value' } });
    const res = createMockRes();

    await updateSettings(req, res);

    expect(res.statusCode).toBe(400);
    expect((res.body as { error: string }).error).toContain('Invalid setting key');
  });

  it('should reject missing settings object', async () => {
    const req = createMockReq({});
    const res = createMockRes();

    await updateSettings(req, res);

    expect(res.statusCode).toBe(400);
  });
});
