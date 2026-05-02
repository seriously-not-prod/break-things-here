import rateLimit from 'express-rate-limit';

export const apiLimiter = rateLimit({ windowMs: 60_000, max: 100 });

export const createAuthLimiter = () => rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many auth requests. Please try again later.' },
});