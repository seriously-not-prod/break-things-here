import { describe, it, expect, afterEach } from 'vitest';
import { app } from '../src/server.js';

function getSetCookieHeader(headers) {
  if (typeof headers.getSetCookie === 'function') {
    return headers.getSetCookie();
  }

  const single = headers.get('set-cookie');
  return single ? [single] : [];
}

function extractCookiePair(setCookieValue) {
  return setCookieValue.split(';', 1)[0];
}

describe('Remember Me — Persistent Sessions (#83)', () => {
  let server;
  let baseUrl;

  function startServer() {
    server = app.listen(0);
    const address = server.address();
    const port = typeof address === 'object' && address ? address.port : 0;
    baseUrl = `http://127.0.0.1:${port}`;
  }

  afterEach(async () => {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
      server = null;
    }
  });

  it('rememberMe=true returns persistent refresh token cookie and valid session', async () => {
    startServer();

    const loginResponse = await fetch(`${baseUrl}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'user@example.com',
        password: 'Password123!',
        rememberMe: true,
      }),
    });

    expect(loginResponse.status).toBe(200);

    const setCookies = getSetCookieHeader(loginResponse.headers);
    expect(setCookies.length).toBeGreaterThan(0);

    const refreshCookie = setCookies.find((value) => value.startsWith('refreshToken='));
    expect(refreshCookie).toBeDefined();
    expect(refreshCookie).toMatch(/Max-Age=/i);

    const validateResponse = await fetch(`${baseUrl}/api/session/validate`, {
      method: 'POST',
      headers: {
        Cookie: extractCookiePair(refreshCookie),
      },
    });

    expect(validateResponse.status).toBe(200);
    const validateBody = await validateResponse.json();
    expect(validateBody.session.rememberMe).toBe(true);
  });

  it('rememberMe=false returns session cookie without Max-Age', async () => {
    startServer();

    const loginResponse = await fetch(`${baseUrl}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'user@example.com',
        password: 'Password123!',
        rememberMe: false,
      }),
    });

    expect(loginResponse.status).toBe(200);

    const setCookies = getSetCookieHeader(loginResponse.headers);
    const refreshCookie = setCookies.find((value) => value.startsWith('refreshToken='));
    expect(refreshCookie).toBeDefined();
    expect(refreshCookie).not.toMatch(/Max-Age=/i);
  });

  it('session can be revoked and becomes invalid afterwards', async () => {
    startServer();

    const loginResponse = await fetch(`${baseUrl}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'user@example.com',
        password: 'Password123!',
        rememberMe: true,
      }),
    });

    const setCookies = getSetCookieHeader(loginResponse.headers);
    const refreshCookie = setCookies.find((value) => value.startsWith('refreshToken='));
    expect(refreshCookie).toBeDefined();
    const cookiePair = extractCookiePair(refreshCookie);

    const revokeResponse = await fetch(`${baseUrl}/api/session/revoke`, {
      method: 'POST',
      headers: {
        Cookie: cookiePair,
      },
    });

    expect(revokeResponse.status).toBe(200);

    const validateResponse = await fetch(`${baseUrl}/api/session/validate`, {
      method: 'POST',
      headers: {
        Cookie: cookiePair,
      },
    });

    expect(validateResponse.status).toBe(401);
  });
});
