/**
 * RLS request middleware (#702).
 *
 * After `authenticateToken` has populated `req.user`, this middleware:
 *   1. Acquires a dedicated pg client from the pool
 *   2. Sets `app.current_user_id` on the connection (session-scoped GUC)
 *   3. Binds {userId, client} to AsyncLocalStorage so PgWrapper routes
 *      every subsequent query in the request through this client
 *   4. Releases the client (resetting the GUC) when the response finishes
 *
 * Without this wiring, the RLS policies installed by #696 / v2 / v10 are
 * inert — every query goes through the pool with no `app.current_user_id`,
 * so policies that gate on `current_setting(...)` fall through to the
 * "no context → allow" branch.
 *
 * Fail-open semantics: if acquiring the client or setting the GUC fails we
 * log and continue without ALS binding. RLS still falls back to the
 * "no-context branch" of each policy, which is intentionally permissive
 * so background jobs and migrations keep working — meaning under pool
 * exhaustion or a transient pg error, an authenticated request can
 * temporarily bypass RLS. This is a deliberate trade-off: the deployed
 * authorization model is enforced primarily by `authorizePermission` and
 * `requireEventAccess` (which run independently of pg health), with RLS
 * acting as defence-in-depth. A future change can wrap the fail-open
 * branch in `if (isSecureDeploymentEnv(NODE_ENV))` to fail closed in
 * prod/staging once we have confidence the pool sizing is sufficient
 * (tracked as a follow-up to this PR).
 */
import { NextFunction, Request, Response } from 'express';
import type { PoolClient } from 'pg';
import { getPool } from '../db/database.js';
import { runWithUserDbContext } from '../db/request-user-context.js';

interface AuthedRequest extends Request {
  user?: { id: number; email: string; role_id: number };
}

export async function attachUserContext(
  req: AuthedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  if (!req.user) {
    next();
    return;
  }

  let pool;
  try {
    pool = getPool();
  } catch {
    // Pool not initialised (e.g. test bootstrap before init) — skip binding.
    next();
    return;
  }

  let client: PoolClient;
  try {
    client = await pool.connect();
  } catch (err) {
    console.warn(
      '[RLS] Could not acquire pg client for user context; proceeding without RLS binding:',
      err instanceof Error ? err.message : err,
    );
    next();
    return;
  }

  let released = false;
  const cleanup = (): void => {
    if (released) return;
    released = true;
    client
      .query('RESET app.current_user_id')
      .catch(() => undefined)
      .finally(() => {
        try {
          client.release();
        } catch {
          // already released — ignore
        }
      });
  };

  try {
    await client.query('SELECT set_config($1, $2, false)', [
      'app.current_user_id',
      String(req.user.id),
    ]);
  } catch (err) {
    console.warn(
      '[RLS] Could not set app.current_user_id; proceeding without RLS binding:',
      err instanceof Error ? err.message : err,
    );
    cleanup();
    next();
    return;
  }

  res.once('finish', cleanup);
  res.once('close', cleanup);

  runWithUserDbContext({ userId: req.user.id, client }, () => next());
}
