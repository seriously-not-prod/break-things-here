import { describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/index.js';

describe('health endpoint aliases (#776)', () => {
  it('returns 200 for both /health and /api/health', async () => {
    const app = createApp();

    const canonical = await request(app).get('/health');
    const alias = await request(app).get('/api/health');

    expect(canonical.status).toBe(200);
    expect(alias.status).toBe(200);
  });

  it('returns an identical payload shape from both endpoints', async () => {
    const app = createApp();
    const uptimeSpy = vi.spyOn(process, 'uptime').mockReturnValue(123.456);

    try {
      const canonical = await request(app).get('/health');
      const alias = await request(app).get('/api/health');

      expect(alias.body).toEqual(canonical.body);
      expect(alias.body).toMatchObject({
        status: expect.any(String),
        uptime: expect.any(Number),
        checks: expect.any(Object),
      });
    } finally {
      uptimeSpy.mockRestore();
    }
  });
});
