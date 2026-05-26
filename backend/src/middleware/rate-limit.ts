import rateLimit from 'express-rate-limit';
import { RedisStore } from 'rate-limit-redis';
import { getRedisClient } from '../lib/redis.js';

function createStore(prefix: string): RedisStore | undefined {
  const client = getRedisClient();
  if (!client) return undefined; // Falls back to express-rate-limit's built-in MemoryStore
  return new RedisStore({
    sendCommand: (...args: string[]) => client.call(args[0], ...args.slice(1)) as never,
    prefix: `rl:${prefix}:`,
  });
}

export const apiLimiter = rateLimit({
  windowMs: 60_000,
  max: process.env.NODE_ENV === 'production' ? 100 : 1000,
  skip: (req) => req.path.startsWith('/auth/'),
  store: createStore('api'),
});

export const healthLimiter = rateLimit({
  windowMs: 60_000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many health check requests.' },
  store: createStore('health'),
});

// #784 — dedicated limiter for the /metrics endpoint; Prometheus scrapers may
// poll more aggressively than health checkers.
export const metricsLimiter = rateLimit({
  windowMs: 60_000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many metrics requests.' },
  store: createStore('metrics'),
});

// Per-IP limit for unauthenticated, user-facing public surfaces:
// /public/events, /public/gallery, /public/rsvp, /public/unsubscribe.
// These represent per-human actions (one guest opening one RSVP page), so
// 60/min/IP is generous for real use but caps token enumeration scans.
// NOT applied to email-tracking endpoints (see trackingLimiter — opens come
// in bursts from shared corporate egress IPs) or to webhook receivers
// (those need HMAC signature checks, not IP throttling).
export const publicLimiter = rateLimit({
  windowMs: 60_000,
  max: process.env.NODE_ENV === 'production' ? 60 : 600,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please slow down and try again shortly.' },
  store: createStore('public'),
});

// Tracking pixel + click redirect throughput is dominated by recipients
// opening an email blast together — schools, offices, mobile carriers all
// share egress IPs, so hundreds of opens from one IP within seconds is
// normal. A high per-IP cap stops headless scraping without breaking real
// recipients. Defence-in-depth on top of the HMAC-signed tokens that the
// endpoints already require.
export const trackingLimiter = rateLimit({
  windowMs: 60_000,
  max: process.env.NODE_ENV === 'production' ? 600 : 6000,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many tracking requests.' },
  store: createStore('tracking'),
});

// GDPR export and right-to-erasure endpoints generate full user data dumps
// and cascading deletes — expensive and rarely-exercised by legitimate users.
// 5/hour per IP is generous for real use, restrictive for abuse.
export const gdprLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'GDPR export/erasure rate limit reached. Try again later.' },
  store: createStore('gdpr'),
});

export const csrfLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many CSRF token requests. Please try again later.' },
  store: createStore('csrf'),
});

export const createAuthLimiter = () =>
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: process.env.NODE_ENV === 'production' ? 10 : 100,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many auth requests. Please try again later.' },
    store: createStore('auth'),
  });
