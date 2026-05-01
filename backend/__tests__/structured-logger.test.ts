/**
 * Tests for Structured Logger (#255)
 *
 * Validates that the logger produces the expected output format
 * with required fields.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('Structured Logger', () => {
  beforeEach(() => {
    // Enable logger for tests
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('LOG_LEVEL', 'info');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('should export a valid logger with standard methods', async () => {
    const { default: logger } = await import('../src/utils/logger.js');
    expect(logger).toBeDefined();
    expect(typeof logger.info).toBe('function');
    expect(typeof logger.warn).toBe('function');
    expect(typeof logger.error).toBe('function');
    expect(typeof logger.debug).toBe('function');
    expect(typeof logger.fatal).toBe('function');
  });

  it('should include service name in base fields', async () => {
    const { default: logger } = await import('../src/utils/logger.js');
    // Pino bindings include the base fields
    const bindings = logger.bindings();
    expect(bindings.service).toBe('festival-planner-api');
  });

  it('should produce child loggers with additional context', async () => {
    const { default: logger } = await import('../src/utils/logger.js');
    const child = logger.child({ requestId: 'test-123', userId: 42 });
    expect(child).toBeDefined();
    expect(typeof child.info).toBe('function');
    const childBindings = child.bindings();
    expect(childBindings.requestId).toBe('test-123');
    expect(childBindings.userId).toBe(42);
  });
});
