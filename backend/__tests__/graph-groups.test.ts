import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import {
  fetchGroupsWithCache,
  getGraphGroupsMetrics,
  getGraphGroupsCacheConfig,
  GraphGroupsStaleError,
  _resetGraphGroupsCacheForTest,
} from '../src/services/graph-groups.js';

describe('graph-groups cache service', () => {
  beforeEach(() => {
    _resetGraphGroupsCacheForTest();
    vi.unstubAllEnvs();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    _resetGraphGroupsCacheForTest();
    vi.unstubAllEnvs();
  });

  // --------------------------------------------------------------------------
  // Happy path
  // --------------------------------------------------------------------------

  it('fetches groups on first call and returns them', async () => {
    const groups = ['group-a', 'group-b'];
    const fetcher = vi.fn().mockResolvedValue(groups);

    const result = await fetchGroupsWithCache('oid-1', fetcher);

    expect(result).toEqual(groups);
    expect(fetcher).toHaveBeenCalledOnce();

    const metrics = getGraphGroupsMetrics();
    expect(metrics.graph_groups_cache_miss_total).toBe(1);
    expect(metrics.graph_groups_cache_hit_total).toBe(0);
    expect(metrics.graph_groups_failure_total).toBe(0);
  });

  // --------------------------------------------------------------------------
  // Cache hit
  // --------------------------------------------------------------------------

  it('returns cached groups on second call within TTL', async () => {
    const groups = ['group-a'];
    const fetcher = vi.fn().mockResolvedValue(groups);

    await fetchGroupsWithCache('oid-1', fetcher);
    const result = await fetchGroupsWithCache('oid-1', fetcher);

    expect(result).toEqual(groups);
    expect(fetcher).toHaveBeenCalledOnce(); // only first call

    const metrics = getGraphGroupsMetrics();
    expect(metrics.graph_groups_cache_hit_total).toBe(1);
    expect(metrics.graph_groups_cache_miss_total).toBe(1);
  });

  it('caches independently per user OID', async () => {
    const fetcherA = vi.fn().mockResolvedValue(['group-a']);
    const fetcherB = vi.fn().mockResolvedValue(['group-b']);

    const a = await fetchGroupsWithCache('oid-a', fetcherA);
    const b = await fetchGroupsWithCache('oid-b', fetcherB);
    const aCached = await fetchGroupsWithCache('oid-a', fetcherA);

    expect(a).toEqual(['group-a']);
    expect(b).toEqual(['group-b']);
    expect(aCached).toEqual(['group-a']);
    expect(fetcherA).toHaveBeenCalledOnce();
    expect(fetcherB).toHaveBeenCalledOnce();
  });

  // --------------------------------------------------------------------------
  // Graph error inside ceiling (stale fallback)
  // --------------------------------------------------------------------------

  it('serves stale cache when Graph fails within 24 h ceiling', async () => {
    vi.stubEnv('GRAPH_GROUPS_CACHE_TTL_MS', '60000'); // 1 min TTL

    const groups = ['group-a'];
    const fetcher = vi.fn()
      .mockResolvedValueOnce(groups)
      .mockRejectedValueOnce(new Error('Graph 503'));

    // First call succeeds — populates cache
    await fetchGroupsWithCache('oid-1', fetcher);

    // Advance past TTL
    vi.advanceTimersByTime(60_001);

    // Second call fails — should serve stale data
    const result = await fetchGroupsWithCache('oid-1', fetcher);

    expect(result).toEqual(groups);
    expect(fetcher).toHaveBeenCalledTimes(2);

    const metrics = getGraphGroupsMetrics();
    expect(metrics.graph_groups_failure_total).toBe(1);
  });

  // --------------------------------------------------------------------------
  // Graph error past ceiling (503 refused)
  // --------------------------------------------------------------------------

  it('throws GraphGroupsStaleError when stale data exceeds 24 h ceiling', async () => {
    vi.stubEnv('GRAPH_GROUPS_CACHE_TTL_MS', '60000');    // 1 min
    vi.stubEnv('GRAPH_GROUPS_MAX_STALE_MS', '120000');   // 2 min ceiling

    const fetcher = vi.fn()
      .mockResolvedValueOnce(['group-a'])
      .mockRejectedValueOnce(new Error('Graph 503'));

    await fetchGroupsWithCache('oid-1', fetcher);

    // Advance past both TTL and stale ceiling
    vi.advanceTimersByTime(120_001);

    await expect(fetchGroupsWithCache('oid-1', fetcher)).rejects.toThrow(GraphGroupsStaleError);

    const metrics = getGraphGroupsMetrics();
    expect(metrics.graph_groups_failure_total).toBe(1);
  });

  it('GraphGroupsStaleError has statusCode 503', () => {
    const err = new GraphGroupsStaleError('oid-1', 100_000_000, 86_400_000);
    expect(err.statusCode).toBe(503);
    expect(err.name).toBe('GraphGroupsStaleError');
  });

  // --------------------------------------------------------------------------
  // Graph error with no prior cache entry
  // --------------------------------------------------------------------------

  it('re-throws when Graph fails and no cache entry exists', async () => {
    const graphError = new Error('Graph timeout');
    const fetcher = vi.fn().mockRejectedValue(graphError);

    await expect(fetchGroupsWithCache('oid-new', fetcher)).rejects.toThrow('Graph timeout');

    const metrics = getGraphGroupsMetrics();
    expect(metrics.graph_groups_failure_total).toBe(1);
  });

  // --------------------------------------------------------------------------
  // TTL refresh
  // --------------------------------------------------------------------------

  it('re-fetches after TTL expires and updates cache', async () => {
    vi.stubEnv('GRAPH_GROUPS_CACHE_TTL_MS', '60000'); // 1 min

    const fetcher = vi.fn()
      .mockResolvedValueOnce(['group-old'])
      .mockResolvedValueOnce(['group-new']);

    await fetchGroupsWithCache('oid-1', fetcher);
    vi.advanceTimersByTime(60_001);
    const result = await fetchGroupsWithCache('oid-1', fetcher);

    expect(result).toEqual(['group-new']);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  // --------------------------------------------------------------------------
  // Metrics reset
  // --------------------------------------------------------------------------

  it('_resetGraphGroupsCacheForTest resets cache and counters', async () => {
    const fetcher = vi.fn().mockResolvedValue(['g']);
    await fetchGroupsWithCache('oid-1', fetcher);
    await fetchGroupsWithCache('oid-1', fetcher);

    _resetGraphGroupsCacheForTest();

    const metrics = getGraphGroupsMetrics();
    expect(metrics.graph_groups_cache_hit_total).toBe(0);
    expect(metrics.graph_groups_cache_miss_total).toBe(0);
    expect(metrics.graph_groups_failure_total).toBe(0);

    // Cache cleared — next call is a miss
    const result = await fetchGroupsWithCache('oid-1', fetcher);
    expect(result).toEqual(['g']);
    expect(getGraphGroupsMetrics().graph_groups_cache_miss_total).toBe(1);
  });

  // --------------------------------------------------------------------------
  // Default config values
  // --------------------------------------------------------------------------

  it('uses default TTL of 10 min and max stale of 24 h', () => {
    // Clear any env overrides
    delete process.env.GRAPH_GROUPS_CACHE_TTL_MS;
    delete process.env.GRAPH_GROUPS_MAX_STALE_MS;

    const config = getGraphGroupsCacheConfig();
    expect(config.ttlMs).toBe(600_000);
    expect(config.maxStaleMs).toBe(86_400_000);
  });
});
