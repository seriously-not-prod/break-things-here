import type { NextFunction, Request, Response } from 'express';
import xss from 'xss';

const DANGEROUS_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const MAX_DEPTH = 20;

function sanitizeString(value: string): string {
  return xss(value, {
    whiteList: {},
    stripIgnoreTag: true,
    stripIgnoreTagBody: ['script', 'style'],
  });
}

function sanitizeValue(value: unknown, depth = 0): unknown {
  if (depth > MAX_DEPTH) {
    return value;
  }

  if (typeof value === 'string') {
    return sanitizeString(value);
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeValue(item, depth + 1));
  }

  if (value && typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, nestedValue] of Object.entries(value as Record<string, unknown>)) {
      if (!DANGEROUS_KEYS.has(key)) {
        result[key] = sanitizeValue(nestedValue, depth + 1);
      }
    }
    return result;
  }

  return value;
}

export function sanitizeRequest(req: Request, _res: Response, next: NextFunction): void {
  req.params = sanitizeValue(req.params) as Request['params'];
  req.query = sanitizeValue(req.query) as Request['query'];

  if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && req.body !== undefined) {
    req.body = sanitizeValue(req.body);
  }

  next();
}

// Backward-compatible alias
export const sanitizeRequestBody = sanitizeRequest;
