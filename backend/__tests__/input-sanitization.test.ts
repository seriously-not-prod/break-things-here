import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { sanitizeRequestBody } from '../src/middleware/sanitize-input.js';

function buildApp() {
  const app = express();
  app.use(express.json());

  app.post('/submit', sanitizeRequestBody, (req, res) => {
    res.status(200).json(req.body);
  });

  app.all('/echo/:name', sanitizeRequestBody, (req, res) => {
    res.status(200).json({
      params: req.params,
      query: req.query,
      body: req.body ?? null,
    });
  });

  app.get('/view', sanitizeRequestBody, (_req, res) => {
    res.status(200).json({ ok: true });
  });

  return app;
}

describe('Input sanitization middleware (#247)', () => {
  it('strips HTML and script content from string body fields', async () => {
    const app = buildApp();
    const response = await request(app)
      .post('/submit')
      .send({
        displayName: '<script>alert("xss")</script>Alice <b>Admin</b>',
        profile: {
          bio: '<img src=x onerror=alert(1)>Hello',
        },
        tags: ['<i>vip</i>', '<style>body{display:none}</style>member'],
      });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      displayName: 'Alice Admin',
      profile: {
        bio: 'Hello',
      },
      tags: ['vip', 'member'],
    });
  });

  it('does not interfere with safe GET requests', async () => {
    const app = buildApp();
    const response = await request(app).get('/view');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ ok: true });
  });

  it('sanitizes req.params and req.query even on safe requests', async () => {
    const app = buildApp();
    const response = await request(app)
      .get('/echo/%3Cscript%3Ealert(1)%3C%2Fscript%3EAlice%20%3Cb%3EAdmin%3C%2Fb%3E')
      .query({
        search: '<img src=x onerror=alert(1)>team',
      });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      params: { name: 'Alice Admin' },
      query: { search: 'team' },
      body: {},
    });
  });

  it('passes non-string primitives through unchanged', async () => {
    const app = buildApp();
    const response = await request(app).post('/submit').send({
      count: 42,
      active: true,
      value: null,
    });

    expect(response.status).toBe(200);
    expect(response.body.count).toBe(42);
    expect(response.body.active).toBe(true);
    expect(response.body.value).toBeNull();
  });

  it('does not throw on empty or undefined body', async () => {
    const app = buildApp();
    const response = await request(app)
      .post('/submit')
      .set('Content-Type', 'application/json')
      .send('{}');

    expect(response.status).toBe(200);
  });

  it('does not overflow the call stack for deeply nested objects', async () => {
    const app = buildApp();
    // build an object nested 30 levels deep (exceeds MAX_DEPTH=20)
    let nested: Record<string, unknown> = { value: '<b>leaf</b>' };
    for (let i = 0; i < 30; i++) {
      nested = { child: nested };
    }

    const response = await request(app).post('/submit').send(nested);
    expect(response.status).toBe(200);
  });

  it('does not allow prototype-pollution style payloads to affect sanitized bodies', async () => {
    const app = buildApp();
    // JSON.parse bypasses object literal key restrictions, simulating a real attack
    const payload = JSON.parse('{"displayName":"Alice","__proto__":{"isAdmin":true}}') as Record<
      string,
      unknown
    >;

    expect(({} as { isAdmin?: boolean }).isAdmin).toBeUndefined();

    const response = await request(app).post('/submit').send(payload);

    expect(response.status).toBe(200);
    expect(response.body.displayName).toBe('Alice');
    // The __proto__ key must not appear as an own property of the sanitized body
    expect(Object.prototype.hasOwnProperty.call(response.body, '__proto__')).toBe(false);
    // Prototype pollution must not have mutated Object.prototype
    expect(({} as { isAdmin?: boolean }).isAdmin).toBeUndefined();
  });
});
