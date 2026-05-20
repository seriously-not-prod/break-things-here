/**
 * Microsoft Graph group-membership cache with failure-mode hardening.
 *
 * - In-memory cache keyed by user OID with configurable TTL (default 10 min).
 * - On Graph failure, authorises with the last-known role up to a hard ceiling
 *   of 24 hours stale; beyond that the login is refused with 503.
 * - Exposes counter metrics via getGraphGroupsMetrics().
 *
 * @see https://github.com/seriously-not-prod/break-things-here/issues/784
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface GraphGroupsCacheConfig {
  /** Cache TTL in milliseconds (default 600 000 = 10 min). */
  ttlMs: number;
  /** Maximum stale age in milliseconds before refusing auth (default 86 400 000 = 24 h). */
  maxStaleMs: number;
}

interface CacheEntry {
  groupIds: string[];
  fetchedAt: number;
}

export interface GraphGroupsMetrics {
  graph_groups_cache_hit_total: number;
  graph_groups_cache_miss_total: number;
  graph_groups_failure_total: number;
}

/** Thrown when the cache entry has exceeded the hard stale ceiling. */
export class GraphGroupsStaleError extends Error {
  public readonly statusCode = 503;
  constructor(oid: string, ageMs: number) {
    super(
      `Graph groups for ${oid} are ${Math.round(ageMs / 60_000)} min stale ` +
        `(exceeds 24 h ceiling). Refusing auth.`,
    );
    this.name = 'GraphGroupsStaleError';
  }
}

// ---------------------------------------------------------------------------
// Module state
// ---------------------------------------------------------------------------

const _cache = new Map<string, CacheEntry>();

let _hitCount = 0;
let _missCount = 0;
let _failureCount = 0;

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export function getGraphGroupsCacheConfig(): GraphGroupsCacheConfig {
  const ttlMs = parseInt(process.env.GRAPH_GROUPS_CACHE_TTL_MS ?? '600000', 10);
  const maxStaleMs = parseInt(process.env.GRAPH_GROUPS_MAX_STALE_MS ?? '86400000', 10);
  return { ttlMs, maxStaleMs };
}

// ---------------------------------------------------------------------------
// Core API
// ---------------------------------------------------------------------------

/**
 * Fetches a user's Entra group IDs with caching and failure-mode hardening.
 *
 * @param userOid  - The Entra object ID of the authenticated user.
 * @param fetcher  - Async function that hits Microsoft Graph and returns group IDs.
 *                   Receives the user OID (not the access token) — the caller
 *                   supplies a closure that already captures the access token.
 * @returns The list of group IDs from cache or fresh fetch.
 * @throws {GraphGroupsStaleError} when Graph is down AND the cached data has
 *         exceeded the 24 h hard ceiling.
 */
export async function fetchGroupsWithCache(
  userOid: string,
  fetcher: () => Promise<string[]>,
): Promise<string[]> {
  const { ttlMs, maxStaleMs } = getGraphGroupsCacheConfig();
  const now = Date.now();
  const entry = _cache.get(userOid);

  // Cache HIT — entry exists and is within TTL
  if (entry && now - entry.fetchedAt < ttlMs) {
    _hitCount++;
    return entry.groupIds;
  }

  // Cache MISS — attempt a fresh fetch
  _missCount++;

  try {
    const groupIds = await fetcher();
    _cache.set(userOid, { groupIds, fetchedAt: now });
    return groupIds;
  } catch (error) {
    _failureCount++;

    // Stale fallback: serve the last-known value if within hard ceiling
    if (entry) {
      const age = now - entry.fetchedAt;
      if (age <= maxStaleMs) {
        console.warn(
          `[GraphGroups] Graph fetch failed for ${userOid}; serving stale cache ` +
            `(${Math.round(age / 60_000)} min old).`,
          error,
        );
        return entry.groupIds;
      }
      // Past the hard ceiling — refuse auth
      throw new GraphGroupsStaleError(userOid, age);
    }

    // No cached data at all — cannot fall back
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Metrics
// ---------------------------------------------------------------------------

export function getGraphGroupsMetrics(): GraphGroupsMetrics {
  return {
    graph_groups_cache_hit_total: _hitCount,
    graph_groups_cache_miss_total: _missCount,
    graph_groups_failure_total: _failureCount,
  };
}

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

/** Reset all module-level state. Call in afterEach() in tests. */
export function _resetGraphGroupsCacheForTest(): void {
  _cache.clear();
  _hitCount = 0;
  _missCount = 0;
  _failureCount = 0;
}
