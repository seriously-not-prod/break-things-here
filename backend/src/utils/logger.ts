/**
 * Structured Logger
 *
 * Provides a centralized pino-based logger with JSON output for production
 * monitoring tools. Logs include request ID, user ID, action, and duration
 * when available.
 *
 * Addresses: #255 (Story)
 */

import pino from 'pino';

const isTest = process.env.NODE_ENV === 'test' || process.env.VITEST === 'true';
const isDev = process.env.NODE_ENV === 'development';

/** Application-wide structured logger instance. */
const logger = pino({
  level: process.env.LOG_LEVEL || (isTest ? 'silent' : isDev ? 'debug' : 'info'),
  // Use pretty-printing in development if pino-pretty is installed
  transport: isDev && !isTest
    ? { target: 'pino/file', options: { destination: 1 } }
    : undefined,
  formatters: {
    level(label) {
      return { level: label };
    },
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  base: { service: 'festival-planner-api' },
});

export default logger;
