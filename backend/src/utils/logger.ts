/**
 * Structured JSON logger with request correlation ID support (#676).
 *
 * Writes JSON to stdout so container log aggregators (Loki, CloudWatch,
 * Datadog) can parse fields directly. Falls back to pretty-print in dev.
 */
import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';

const isDev = process.env.NODE_ENV !== 'production' && process.env.NODE_ENV !== 'staging';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogRecord {
  level: LogLevel;
  message: string;
  timestamp: string;
  correlationId?: string;
  [key: string]: unknown;
}

function write(record: LogRecord): void {
  const line = JSON.stringify(record);
  if (record.level === 'error' || record.level === 'warn') {
    process.stderr.write(line + '\n');
  } else {
    process.stdout.write(line + '\n');
  }
}

function log(level: LogLevel, message: string, meta?: Record<string, unknown>, correlationId?: string): void {
  const record: LogRecord = {
    level,
    message,
    timestamp: new Date().toISOString(),
    ...(correlationId ? { correlationId } : {}),
    ...meta,
  };

  if (isDev) {
    const prefix = { debug: '🔵', info: '🟢', warn: '🟡', error: '🔴' }[level] ?? level.toUpperCase();
    // Use structured write even in dev to avoid format-string injection risk (CodeQL)
    process.stdout.write(JSON.stringify({ ...record, _prefix: prefix }) + '\n');
    return;
  }

  write(record);
}

export const logger = {
  debug: (message: string, meta?: Record<string, unknown>, correlationId?: string) =>
    log('debug', message, meta, correlationId),
  info: (message: string, meta?: Record<string, unknown>, correlationId?: string) =>
    log('info', message, meta, correlationId),
  warn: (message: string, meta?: Record<string, unknown>, correlationId?: string) =>
    log('warn', message, meta, correlationId),
  error: (message: string, meta?: Record<string, unknown>, correlationId?: string) =>
    log('error', message, meta, correlationId),
};

/**
 * Express middleware — attaches a correlation ID to every request and logs
 * method + path + status + latency on response finish.
 */
export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const correlationId = (req.headers['x-correlation-id'] as string) ?? crypto.randomUUID();

  // Expose to downstream handlers and include in response
  (req as Request & { correlationId?: string }).correlationId = correlationId;
  res.setHeader('x-correlation-id', correlationId);

  const start = Date.now();

  res.on('finish', () => {
    const ms = Date.now() - start;
    const level: LogLevel = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info';
    log(level, `${req.method} ${req.path} ${res.statusCode} ${ms}ms`, {
      method: req.method,
      path: req.path,
      status: res.statusCode,
      latencyMs: ms,
      userAgent: req.headers['user-agent'],
    }, correlationId);
  });

  next();
}
