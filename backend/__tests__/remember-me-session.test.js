const test = require('node:test');
const assert = require('node:assert/strict');

const { app } = require('../src/server.js');

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

test('rememberMe=true returns persistent refresh token cookie and valid session', async () => {
  const server = app.listen(0);
  try {
    const address = server.address();
    const port = typeof address === 'object' && address ? address.port : 0;
    const baseUrl = `http://127.0.0.1:${port}`;

    const loginResponse = await fetch(`${baseUrl}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'user@example.com',
        password: 'Password123!',
        rememberMe: true
      })
    });

    assert.equal(loginResponse.status, 200);

    const setCookies = getSetCookieHeader(loginResponse.headers);
    assert.ok(setCookies.length > 0, 'expected refresh token set-cookie header');

    const refreshCookie = setCookies.find((value) => value.startsWith('refreshToken='));
    assert.ok(refreshCookie, 'expected refreshToken cookie');
    assert.match(refreshCookie, /Max-Age=/i);

    const validateResponse = await fetch(`${baseUrl}/api/session/validate`, {
      method: 'POST',
      headers: {
        Cookie: extractCookiePair(refreshCookie)
      }
    });

    assert.equal(validateResponse.status, 200);
    const validateBody = await validateResponse.json();
    assert.equal(validateBody.session.rememberMe, true);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('rememberMe=false returns session cookie without Max-Age', async () => {
  const server = app.listen(0);
  try {
    const address = server.address();
    const port = typeof address === 'object' && address ? address.port : 0;
    const baseUrl = `http://127.0.0.1:${port}`;

    const loginResponse = await fetch(`${baseUrl}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'user@example.com',
        password: 'Password123!',
        rememberMe: false
      })
    });

    assert.equal(loginResponse.status, 200);

    const setCookies = getSetCookieHeader(loginResponse.headers);
    const refreshCookie = setCookies.find((value) => value.startsWith('refreshToken='));
    assert.ok(refreshCookie, 'expected refreshToken cookie');
    assert.doesNotMatch(refreshCookie, /Max-Age=/i);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('session can be revoked and becomes invalid afterwards', async () => {
  const server = app.listen(0);
  try {
    const address = server.address();
    const port = typeof address === 'object' && address ? address.port : 0;
    const baseUrl = `http://127.0.0.1:${port}`;

    const loginResponse = await fetch(`${baseUrl}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'user@example.com',
        password: 'Password123!',
        rememberMe: true
      })
    });

    const setCookies = getSetCookieHeader(loginResponse.headers);
    const refreshCookie = setCookies.find((value) => value.startsWith('refreshToken='));
    assert.ok(refreshCookie, 'expected refreshToken cookie');
    const cookiePair = extractCookiePair(refreshCookie);

    const revokeResponse = await fetch(`${baseUrl}/api/session/revoke`, {
      method: 'POST',
      headers: {
        Cookie: cookiePair
      }
    });

    assert.equal(revokeResponse.status, 200);

    const validateResponse = await fetch(`${baseUrl}/api/session/validate`, {
      method: 'POST',
      headers: {
        Cookie: cookiePair
      }
    });

    assert.equal(validateResponse.status, 401);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
