/**
 * Tests for Email Provider Configuration Validation (#245)
 *
 * Validates startup configuration check and log-only fallback mode.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { validateEmailConfig, isEmailConfigured, sendEmail } from '../src/utils/email-service.js';

describe('Email Service', () => {
  beforeEach(() => {
    vi.stubEnv('SMTP_HOST', '');
    vi.stubEnv('SMTP_USER', '');
    vi.stubEnv('SMTP_PASS', '');
    vi.stubEnv('SMTP_FROM', '');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('should return false when SMTP is not configured', () => {
    const result = validateEmailConfig();
    expect(result).toBe(false);
    expect(isEmailConfigured()).toBe(false);
  });

  it('should return true when all SMTP vars are set', () => {
    vi.stubEnv('SMTP_HOST', 'smtp.test.com');
    vi.stubEnv('SMTP_USER', 'user@test.com');
    vi.stubEnv('SMTP_PASS', 'secret');
    vi.stubEnv('SMTP_FROM', 'test@test.com');

    const result = validateEmailConfig();
    expect(result).toBe(true);
    expect(isEmailConfigured()).toBe(true);
  });

  it('should use log-only fallback when not configured', async () => {
    validateEmailConfig(); // not configured
    const result = await sendEmail({
      to: 'user@example.com',
      subject: 'Test',
      text: 'Hello',
    });
    // Fallback mode always returns true (logged successfully)
    expect(result).toBe(true);
  });

  it('should detect missing individual vars', () => {
    vi.stubEnv('SMTP_HOST', 'smtp.test.com');
    // SMTP_USER and SMTP_PASS still empty
    const result = validateEmailConfig();
    expect(result).toBe(false);
  });
});
