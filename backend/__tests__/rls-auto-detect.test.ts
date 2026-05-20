/**
 * Regression tests for the default-on RLS startup gate.
 *
 * `resolveRlsEnabled` now always enables RLS and performs a fail-closed check
 * in secure environments (production/staging): if the connecting role has
 * BYPASSRLS, startup must fail.
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
    async all<T = unknown>(_sql: string, _params?: unknown[]): Promise<T[]> {
      return [];
    },
    async run(_sql: string, _params?: unknown[]) {
      return { lastID: undefined, changes: 0 };
    },
    async exec(_sql: string): Promise<void> {
      /* noop */
    },
  };
}

describe('resolveRlsEnabled — #767 RLS default-on + secure fail-closed', () => {
  const originalNodeEnv = process.env.NODE_ENV;
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    process.env.NODE_ENV = 'development';
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = originalNodeEnv;
    warnSpy.mockRestore();
  });

  it('returns true in non-secure environments when role does not bypass RLS', async () => {
    await expect(resolveRlsEnabled(stubDb({ bypassrls: false }))).resolves.toBe(true);
  });

  it('returns true in non-secure environments when role bypasses RLS (with warning)', async () => {
    await expect(resolveRlsEnabled(stubDb({ bypassrls: true }))).resolves.toBe(true);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('has BYPASSRLS'));
  });

  it('throws in secure environments when role bypasses RLS', async () => {
    process.env.NODE_ENV = 'production';
    await expect(resolveRlsEnabled(stubDb({ bypassrls: true }))).rejects.toThrow(/BYPASSRLS/);
  });

  it('throws in secure environments when BYPASSRLS probe fails', async () => {
    process.env.NODE_ENV = 'staging';
    const err = new Error('permission denied for pg_roles');
    await expect(resolveRlsEnabled(stubDb({ throwOnGet: err }))).rejects.toThrow(
      /could not verify BYPASSRLS state/,
    );
  });

  it('continues in non-secure environments when BYPASSRLS probe fails', async () => {
    const err = new Error('permission denied for pg_roles');
    await expect(resolveRlsEnabled(stubDb({ throwOnGet: err }))).resolves.toBe(true);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Could not determine role BYPASSRLS attribute'),
      expect.stringContaining('permission denied'),
    );
  });

  it('treats a NULL/undefined probe result as non-bypass and keeps RLS enabled', async () => {
    await expect(resolveRlsEnabled(stubDb({ bypassrls: null }))).resolves.toBe(true);
  });

  it('keeps RLS enabled in secure environments when role does not bypass RLS', async () => {
    process.env.NODE_ENV = 'production';
    await expect(resolveRlsEnabled(stubDb({ bypassrls: false }))).resolves.toBe(true);
  });

  it('treats unknown NODE_ENV as non-secure and keeps RLS enabled', async () => {
    process.env.NODE_ENV = 'qa';
    await expect(resolveRlsEnabled(stubDb({ bypassrls: true }))).resolves.toBe(true);
  });
});
