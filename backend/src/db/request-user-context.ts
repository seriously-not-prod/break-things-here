/**
 * Per-request user context for Postgres RLS.
 *
 * The pattern: a request-scoped middleware (see `middleware/auth.ts`) acquires
 * a dedicated pg client, sets `app.current_user_id` on it, and binds both the
 * userId and the client to AsyncLocalStorage. PgWrapper (see `database.ts`)
 * checks the ALS store on every query and routes through the bound client
 * when present, so RLS policies that gate on
 * `current_setting('app.current_user_id', true)` are enforced automatically
 * without controller changes. Fallback to the pool keeps non-request code
 * (jobs, migrations, tests) working unchanged.
 */
import { AsyncLocalStorage } from 'node:async_hooks';
import type { PoolClient } from 'pg';

export interface UserDbContext {
  userId: number;
  client: PoolClient;
}

const storage = new AsyncLocalStorage<UserDbContext>();

export function getCurrentUserContext(): UserDbContext | undefined {
  return storage.getStore();
}

export function getCurrentUserId(): number | undefined {
  return storage.getStore()?.userId;
}

export function runWithUserDbContext<T>(ctx: UserDbContext, fn: () => T): T {
  return storage.run(ctx, fn);
}
