import { EventEmitter } from 'node:events';
import https from 'https';
import type { Request, Response } from 'express';
import { afterEach, describe, expect, it, vi } from 'vitest';

interface MockResponse {
  statusCode: number;
  body: unknown;
}

function makeReq(body: Record<string, unknown>): Request {
  return { body } as unknown as Request;
}

function makeRes(): Response & MockResponse {
  const res = {
    statusCode: 200,
    body: null as unknown,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      return this;
    },
  };

  return res as unknown as Response & MockResponse;
}

interface CapturedRequest {
  hostname?: string;
  path?: string;
  headers?: Record<string, string | number>;
  body: string;
}

function mockHttpsJsonReply(payload: unknown): {
  captured: CapturedRequest;
  restore: () => void;
} {
  const captured: CapturedRequest = { body: '' };
  const spy = vi.spyOn(https, 'request').mockImplementation((options, callback) => {
    captured.hostname = options.hostname;
    captured.path = options.path;
    captured.headers = options.headers as Record<string, string | number>;

    const req = new EventEmitter() as EventEmitter & {
      write: (chunk: string) => void;
      end: () => void;
    };

    req.write = (chunk: string) => {
      captured.body += chunk;
    };

    req.end = () => {
      const res = new EventEmitter() as EventEmitter;
      callback(res as never);
      res.emit('data', Buffer.from(JSON.stringify(payload), 'utf8'));
      res.emit('end');
    };

    return req as never;
  });

  return {
    captured,
    restore: () => spy.mockRestore(),
  };
}

function clearAiEnv(): void {
  delete process.env.AZURE_OPENAI_ENDPOINT;
  delete process.env.ENDPOINT;
  delete process.env.AZURE_OPENAI_API_KEY;
  delete process.env.API_KEY;
  delete process.env.AZURE_OPENAI_DEPLOYMENT;
  delete process.env.AZURE_OPENAI_API_VERSION;
  delete process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_MODEL;
}

async function loadController() {
  vi.resetModules();
  return import('../src/controllers/ai-controller.js');
}

afterEach(() => {
  vi.restoreAllMocks();
  clearAiEnv();
});

describe('ai-controller provider selection', () => {
  it('uses Azure OpenAI when Azure config is present', async () => {
    process.env.AZURE_OPENAI_ENDPOINT = 'https://example-resource.cognitiveservices.azure.com/';
    process.env.AZURE_OPENAI_API_KEY = 'azure-key';
    process.env.AZURE_OPENAI_DEPLOYMENT = 'gpt-4-1';
    process.env.AZURE_OPENAI_API_VERSION = '2024-02-15-preview';
    process.env.OPENAI_API_KEY = 'openai-key-should-not-be-used';

    const { getSuggestion } = await loadController();
    const { captured, restore } = mockHttpsJsonReply({
      choices: [{ message: { content: 'Azure answer' } }],
    });

    try {
      const req = makeReq({ context: 'general', prompt: 'Help me plan.' });
      const res = makeRes();
      await getSuggestion(req, res);

      expect(res.statusCode).toBe(200);
      expect(res.body).toEqual({ suggestion: 'Azure answer' });
      expect(captured.hostname).toBe('example-resource.cognitiveservices.azure.com');
      expect(captured.path).toBe(
        '/openai/deployments/gpt-4-1/chat/completions?api-version=2024-02-15-preview',
      );
      expect(captured.headers?.['api-key']).toBe('azure-key');
      expect(captured.headers?.Authorization).toBeUndefined();
    } finally {
      restore();
    }
  });

  it('falls back to OpenAI when Azure config is absent', async () => {
    process.env.OPENAI_API_KEY = 'openai-key';
    process.env.OPENAI_MODEL = 'gpt-4o-mini';

    const { getSuggestion } = await loadController();
    const { captured, restore } = mockHttpsJsonReply({
      choices: [{ message: { content: 'OpenAI answer' } }],
    });

    try {
      const req = makeReq({ context: 'task', prompt: 'Create task list.' });
      const res = makeRes();
      await getSuggestion(req, res);

      expect(res.statusCode).toBe(200);
      expect(res.body).toEqual({ suggestion: 'OpenAI answer' });
      expect(captured.hostname).toBe('api.openai.com');
      expect(captured.path).toBe('/v1/chat/completions');
      expect(captured.headers?.Authorization).toBe('Bearer openai-key');
    } finally {
      restore();
    }
  });

  it('uses ENDPOINT/API_KEY aliases when AZURE_OPENAI_* vars are empty', async () => {
    process.env.AZURE_OPENAI_ENDPOINT = '';
    process.env.AZURE_OPENAI_API_KEY = '';
    process.env.ENDPOINT = 'https://example-resource.cognitiveservices.azure.com';
    process.env.API_KEY = 'alias-key';
    process.env.AZURE_OPENAI_DEPLOYMENT = 'gpt-4-1';
    process.env.AZURE_OPENAI_API_VERSION = '2024-02-15-preview';

    const { getSuggestion } = await loadController();
    const { captured, restore } = mockHttpsJsonReply({
      choices: [{ message: { content: 'Alias answer' } }],
    });

    try {
      const req = makeReq({ context: 'general', prompt: 'Alias config test.' });
      const res = makeRes();
      await getSuggestion(req, res);

      expect(res.statusCode).toBe(200);
      expect(res.body).toEqual({ suggestion: 'Alias answer' });
      expect(captured.hostname).toBe('example-resource.cognitiveservices.azure.com');
      expect(captured.headers?.['api-key']).toBe('alias-key');
    } finally {
      restore();
    }
  });

  it('returns 503 when Azure is partially configured', async () => {
    process.env.AZURE_OPENAI_ENDPOINT = 'https://example-resource.cognitiveservices.azure.com';

    const { getSuggestion } = await loadController();
    const requestSpy = vi.spyOn(https, 'request');

    const req = makeReq({ context: 'event', prompt: 'Generate event ideas.' });
    const res = makeRes();
    await getSuggestion(req, res);

    expect(res.statusCode).toBe(503);
    expect(res.body).toEqual({
      error: 'Azure OpenAI is partially configured. Missing: AZURE_OPENAI_API_KEY (or API_KEY).',
    });
    expect(requestSpy).not.toHaveBeenCalled();
  });

  it('returns 503 when no AI provider is configured', async () => {
    const { getSuggestion } = await loadController();
    const req = makeReq({ context: 'rsvp', prompt: 'Draft reminder copy.' });
    const res = makeRes();

    await getSuggestion(req, res);

    expect(res.statusCode).toBe(503);
    expect(res.body).toEqual({
      error:
        'AI suggestions are not configured. Set Azure OpenAI (AZURE_OPENAI_ENDPOINT + AZURE_OPENAI_API_KEY + AZURE_OPENAI_DEPLOYMENT) or OPENAI_API_KEY.',
    });
  });
});
