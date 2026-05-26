import Redis from 'ioredis';

let redisClient: Redis | null = null;

/**
 * Returns a shared Redis client if REDIS_URL is configured.
 * Returns null when Redis is not available (falls back to in-memory store).
 */
export function getRedisClient(): Redis | null {
  if (redisClient) return redisClient;

  const url = process.env.REDIS_URL;
  if (!url) return null;

  redisClient = new Redis(url, {
    maxRetriesPerRequest: 3,
    enableReadyCheck: true,
    lazyConnect: true,
  });

  redisClient.on('error', (err) => {
    console.error('[Redis] Connection error:', err.message);
  });

  void redisClient.connect().catch(() => {
    // Silently degrade — rate limiting falls back to in-memory store
    console.warn('[Redis] Failed to connect; rate limiting will use in-memory store.');
    redisClient = null;
  });

  return redisClient;
}
