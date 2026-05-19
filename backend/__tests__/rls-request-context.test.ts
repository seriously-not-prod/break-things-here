/**
 * Verifies the request-scoped RLS wiring (#702):
 *   - attachUserContext binds a pg client with app.current_user_id set
 *   - getDatabase() queries from within the ALS scope see that GUC
 *   - queries from outside the scope (pool fallback) do NOT see it
 *
 * Hits a real Postgres so the GUC behaviour is real, not mocked.
 */

import express from 'express';
import rateLimit from 'express-rate-limit';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  closeDatabase,
  getDatabase,
  initializeDatabase,
} from '../src/db/database.js';
import { attachUserContext } from '../src/middleware/attach-user-context.js';

describe('attachUserContext + getDatabase — request-scoped RLS context (#702)', () => {
  beforeAll(async () => {
    await initializeDatabase();
  });

  afterAll(async () => {
    await closeDatabase();
  });

  function buildApp(userId: number) {
    const app = express();
    // Mount a rate limiter on the test app so the route below isn't flagged
    // by the CodeQL `js/missing-rate-limiting` rule. The limit is huge
    // because we want the production-shaped middleware chain, not real
    // throttling — supertest fires only a few requests per test.
    app.use(
      rateLimit({
        windowMs: 60_000,
        max: 10_000,
        standardHeaders: false,
        legacyHeaders: false,
      }),
    );
    // Stand in for authenticateToken: populate req.user, then attachUserContext.
    app.use((req, _res, next) => {
      (req as express.Request & { user?: { id: number; email: string; role_id: number } }).user = {
        id: userId,
        email: `u${userId}@test.local`,
        role_id: 1,
      };
      next();
    });
    app.use(attachUserContext);
    app.get('/whoami', async (_req, res) => {
      // Read the GUC visible to the same request — proves the ALS-bound
      // client is being used by PgWrapper.
      const row = await getDatabase().get<{ uid: string | null }>(
        `SELECT NULLIF(current_setting('app.current_user_id', true), '') AS uid`,
      );
      res.json({ uid: row?.uid ?? null });
    });
    return app;
  }

  it('sets app.current_user_id on the bound client for the duration of the request', async () => {
    const app = buildApp(4242);
    const res = await request(app).get('/whoami').expect(200);
    expect(res.body.uid).toBe('4242');
  });

  it('isolates the GUC per request — concurrent requests do not see each other', async () => {
    const appA = buildApp(11);
    const appB = buildApp(22);
    const [a, b] = await Promise.all([
      request(appA).get('/whoami'),
      request(appB).get('/whoami'),
    ]);
    expect(a.body.uid).toBe('11');
    expect(b.body.uid).toBe('22');
  });

  it('falls back to the pool (no GUC) when called outside any request context', async () => {
    const row = await getDatabase().get<{ uid: string | null }>(
      `SELECT NULLIF(current_setting('app.current_user_id', true), '') AS uid`,
    );
    expect(row?.uid ?? null).toBeNull();
  });

  it('releases the bound client and resets the GUC after the response finishes', async () => {
    const app = buildApp(99);
    await request(app).get('/whoami').expect(200);
    // After response: subsequent pool-borrowed queries must not leak the GUC.
    // We check several times because the released client may be reused.
    for (let i = 0; i < 5; i++) {
      const row = await getDatabase().get<{ uid: string | null }>(
        `SELECT NULLIF(current_setting('app.current_user_id', true), '') AS uid`,
      );
      expect(row?.uid ?? null).toBeNull();
    }
  });
});
