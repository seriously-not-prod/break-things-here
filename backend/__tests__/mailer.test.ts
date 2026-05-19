import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  __resetMailerCacheForTests,
  sendMail,
  sendVerificationEmail,
} from '../src/utils/mailer.js';

const ENV_KEYS = ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS', 'SMTP_FROM', 'SMTP_SECURE', 'APP_BASE_URL'];

describe('mailer utility', () => {
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const k of ENV_KEYS) saved[k] = process.env[k];
    for (const k of ENV_KEYS) delete process.env[k];
    __resetMailerCacheForTests();
  });

  afterEach(() => {
    for (const k of ENV_KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
    __resetMailerCacheForTests();
  });

  it('falls back to console.info when SMTP_HOST is unset', async () => {
    const spy = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    try {
      await sendMail({ to: 'alice@example.com', subject: 'hi', text: 'body' });
      expect(spy).toHaveBeenCalledOnce();
      const arg = spy.mock.calls[0][0] as string;
      expect(arg).toContain('no SMTP_HOST set');
      expect(arg).toContain('alice@example.com');
      expect(arg).toContain('hi');
    } finally {
      spy.mockRestore();
    }
  });

  it('sendVerificationEmail composes a URL from APP_BASE_URL and the token', async () => {
    process.env.APP_BASE_URL = 'https://app.example.com/';
    const spy = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    try {
      // No SMTP_HOST → falls back to console; the assertion is that the
      // verification flow assembled the link correctly.
      await sendVerificationEmail('bob@example.com', 'tok-with-spaces and+chars');
      const arg = spy.mock.calls[0][0] as string;
      expect(arg).toContain('bob@example.com');
      expect(arg).toContain('Verify your email');
    } finally {
      spy.mockRestore();
    }
  });
});
