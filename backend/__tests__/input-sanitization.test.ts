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

  app.get('/view', sanitizeRequestBody, (_req, res) => {
    res.status(200).json({ ok: true });
  });

  return app;
}

describe('Input sanitization middleware (#247)', () => {
  it('strips HTML and script content from string body fields', async () => {
    const app = buildApp();
    const response = await request(app).post('/submit').send({
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
});