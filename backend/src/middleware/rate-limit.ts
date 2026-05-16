import rateLimit from 'express-rate-limit';

export const apiLimiter = rateLimit({
  windowMs: 60_000,
  max: process.env.NODE_ENV === 'production' ? 100 : 1000,
  skip: (req) => req.path.startsWith('/auth/'),
});

export const healthLimiter = rateLimit({
  windowMs: 60_000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many health check requests.' },
});

// Tight limit for unauthenticated public surfaces: tracking pixels, click
// redirects, public RSVP/gallery viewers, unsubscribe links, email webhooks.
// These endpoints have no auth gate, so a per-IP limiter is the primary
// defence against scraping/enumeration and webhook abuse.
export const publicLimiter = rateLimit({
  windowMs: 60_000,
  max: process.env.NODE_ENV === 'production' ? 30 : 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please slow down and try again shortly.' },
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
});

export const csrfLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many CSRF token requests. Please try again later.' },
});

export const createAuthLimiter = () => rateLimit({
  windowMs: 15 * 60 * 1000,
  max: process.env.NODE_ENV === 'production' ? 10 : 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many auth requests. Please try again later.' },
});