/**
 * Regression tests for the RLS auto-detect path added in #702.
 *
 * `resolveRlsEnabled` is the gate the schema migration uses to decide whether
 * to apply RLS policies (and FORCE ROW LEVEL SECURITY) on event-scoped tables.
 * Getting this wrong silently empties result sets on non-superuser
 * deployments, so the behaviour must stay covered by a unit test that does
 * not require a live PostgreSQL connection.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resolveRlsEnabled, type DatabaseAdapter } from '../src/db/database';

interface StubDbOptions {
  bypassrls?: boolean | null;
  throwOnGet?: Error;
}

function stubDb(opts: StubDbOptions = {}): DatabaseAdapter {
  return {
    async get<T = unknown>(_sql: string, _params?: unknown[]): Promise<T | undefined> {
      if (opts.throwOnGet) throw opts.throwOnGet;
      if (opts.bypassrls === null) return undefined as T | undefined;
      return { rolbypassrls: Boolean(opts.bypassrls) } as unknown as T;
    },
    async all<T = unknown>(_sql: string, _params?: unknown[]): Promise<T[]> { return []; },
    async run(_sql: string, _params?: unknown[]) { return { lastID: undefined, changes: 0 }; },
    async exec(_sql: string): Promise<void> { /* noop */ },
  };
}

describe('resolveRlsEnabled — #702 RLS auto-detect', () => {
  const originalEnv = process.env.RLS_PILOT_ENABLED;
  let warnSpy: ReturnType<typeof vi.spyOn>;
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    delete process.env.RLS_PILOT_ENABLED;
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => {
    if (originalEnv === undefined) delete process.env.RLS_PILOT_ENABLED;
    else process.env.RLS_PILOT_ENABLED = originalEnv;
    warnSpy.mockRestore();
    logSpy.mockRestore();
  });

  it('returns true when RLS_PILOT_ENABLED=true regardless of role attribute', async () => {
    process.env.RLS_PILOT_ENABLED = 'true';
    await expect(resolveRlsEnabled(stubDb({ bypassrls: false }))).resolves.toBe(true);
  });

  it('returns false when RLS_PILOT_ENABLED=false regardless of role attribute', async () => {
    process.env.RLS_PILOT_ENABLED = 'false';
    await expect(resolveRlsEnabled(stubDb({ bypassrls: true }))).resolves.toBe(false);
  });

  it('auto-enables when role bypasses RLS (policies are inert in dev)', async () => {
    await expect(resolveRlsEnabled(stubDb({ bypassrls: true }))).resolves.toBe(true);
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining('[RLS] Auto-enabling policies'),
    );
  });

  it('auto-disables when role does NOT bypass RLS (prevents silent empty result sets)', async () => {
    await expect(resolveRlsEnabled(stubDb({ bypassrls: false }))).resolves.toBe(false);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('[RLS] Auto-disabling policies'),
    );
  });

  it('auto-disables with a safety warning when the pg_roles probe throws', async () => {
    const err = new Error('permission denied for pg_roles');
    await expect(resolveRlsEnabled(stubDb({ throwOnGet: err }))).resolves.toBe(false);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('[RLS] Could not determine role BYPASSRLS attribute'),
      expect.stringContaining('permission denied'),
    );
  });

  it('treats a NULL/undefined probe result as non-bypass (safety)', async () => {
    await expect(resolveRlsEnabled(stubDb({ bypassrls: null }))).resolves.toBe(false);
  });

  it.each(['TRUE', 'True', 'tRuE'])(
    'parses %s as enabled (case-insensitive)',
    async (val) => {
      process.env.RLS_PILOT_ENABLED = val;
      await expect(resolveRlsEnabled(stubDb({ bypassrls: false }))).resolves.toBe(true);
    },
  );

  it.each(['FALSE', 'False', 'fAlSe'])(
    'parses %s as disabled (case-insensitive)',
    async (val) => {
      process.env.RLS_PILOT_ENABLED = val;
      await expect(resolveRlsEnabled(stubDb({ bypassrls: true }))).resolves.toBe(false);
    },
  );

  it('treats any non-true/false env value as unset (falls through to probe)', async () => {
    process.env.RLS_PILOT_ENABLED = 'maybe';
    // probe says bypassrls=true → auto-enable
    await expect(resolveRlsEnabled(stubDb({ bypassrls: true }))).resolves.toBe(true);
  });
});
