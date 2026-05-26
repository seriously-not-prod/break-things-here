import Redis from 'ioredis';

let redisClient: Redis | null = null;

/**
 * Returns a shared Redis client if REDIS_URL is configured.
 * Returns null when Redis is not available (falls back to in-memory store).
 *
 * ioredis automatically reconnects on transient failures. The `lazyConnect`
 * option means the TCP socket opens on the first command, not at construction
 * time — so we can safely hand the client to RedisStore immediately.
 */
export function getRedisClient(): Redis | null {
  if (redisClient) return redisClient;

  const url = process.env.REDIS_URL;
  if (!url) return null;

  redisClient = new Redis(url, {
    maxRetriesPerRequest: 3,
    enableReadyCheck: true,
    lazyConnect: false, // connect immediately so errors surface early
    retryStrategy(times) {
      // Exponential backoff capped at 3 seconds
      return Math.min(times * 200, 3000);
    },
  });

  redisClient.on('error', (err) => {
    console.error('[Redis] Connection error:', err.message);
  });

  return redisClient;
}
