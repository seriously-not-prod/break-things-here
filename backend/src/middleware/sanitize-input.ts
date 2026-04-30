import type { NextFunction, Request, Response } from 'express';
import xss from 'xss';

function sanitizeValue(value: unknown): unknown {
  if (typeof value === 'string') {
    return xss(value, {
      whiteList: {},
      stripIgnoreTag: true,
      stripIgnoreTagBody: ['script', 'style'],
    });
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeValue(item));
  }

  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).map(([key, nestedValue]) => [
      key,
      sanitizeValue(nestedValue),
    ]);
    return Object.fromEntries(entries);
  }

  return value;
}

export function sanitizeRequestBody(req: Request, _res: Response, next: NextFunction): void {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    next();
    return;
  }

  req.body = sanitizeValue(req.body);
  next();
}