/**
 * Request Logging Middleware
 *
 * Attaches a unique request ID to each request and logs structured
 * information (method, path, status, duration, userId) on response finish.
 *
 * Addresses: #255 (Story)
 */

import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import logger from '../utils/logger.js';

declare global {
  namespace Express {
    interface Request {
      /** Unique identifier assigned to each incoming request. */
      requestId?: string;
    }
  }
}

/**
 * Middleware that assigns a request ID and logs request lifecycle events.
 */
export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const requestId = (req.headers['x-request-id'] as string) || crypto.randomUUID();
  req.requestId = requestId;
  res.setHeader('X-Request-Id', requestId);

  const start = Date.now();

  res.on('finish', () => {
    const duration = Date.now() - start;
    const user = (req as Request & { user?: { id: number } }).user;

    logger.info({
      requestId,
      method: req.method,
      path: req.originalUrl,
      statusCode: res.statusCode,
      duration,
      userId: user?.id ?? null,
    }, `${req.method} ${req.originalUrl} ${res.statusCode} ${duration}ms`);
  });

  next();
}
