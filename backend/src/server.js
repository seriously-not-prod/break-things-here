const express = require('express');
const cors = require('cors');
const crypto = require('crypto');

const app = express();
const PORT = Number(process.env.PORT || 3001);
const MAX_FAILED_ATTEMPTS = 3;
const LOCKOUT_MS = 10 * 60 * 1000;
const SESSION_COOKIE_NAME = 'refreshToken';
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const REMEMBER_ME_SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const SESSION_INACTIVITY_TIMEOUT_MS = 30 * 60 * 1000;

function getPositiveIntegerEnv(name, fallbackValue) {
  const rawValue = process.env[name];
  if (rawValue === undefined) {
    return fallbackValue;
  }

  const parsedValue = Number.parseInt(rawValue, 10);
  if (!Number.isFinite(parsedValue) || parsedValue <= 0) {
    return fallbackValue;
  }

  return parsedValue;
}

const ATTEMPT_RECORD_TTL_MS = getPositiveIntegerEnv('LOGIN_RECORD_TTL_MS', LOCKOUT_MS);
const MAX_TRACKED_LOGIN_RECORDS = getPositiveIntegerEnv('MAX_TRACKED_LOGIN_RECORDS', 5000);

const DEMO_EMAIL = process.env.DEMO_EMAIL || 'user@example.com';
const DEMO_PASSWORD = process.env.DEMO_PASSWORD || 'Password123!';
const DEFAULT_CORS_ORIGINS = ['http://localhost:5173'];
const corsOriginsEnv = process.env.CORS_ALLOWED_ORIGINS;
const allowedCorsOrigins = corsOriginsEnv
  ? corsOriginsEnv.split(',').map((origin) => origin.trim()).filter(Boolean)
  : DEFAULT_CORS_ORIGINS;

const attemptsByEmail = new Map();
const sessionsByToken = new Map();

app.use(
  cors({
    origin: allowedCorsOrigins,
    credentials: true
  })
);
app.use(express.json({ limit: '16kb' }));

function pruneAttemptRecords(now = Date.now()) {
  for (const [emailKey, record] of attemptsByEmail.entries()) {
    const isExpired = record.lockedUntil <= now && now - record.lastUpdatedAt > ATTEMPT_RECORD_TTL_MS;
    if (isExpired) {
      attemptsByEmail.delete(emailKey);
    }
  }

  while (attemptsByEmail.size > MAX_TRACKED_LOGIN_RECORDS) {
    const oldestEmailKey = attemptsByEmail.keys().next().value;
    if (!oldestEmailKey) {
      break;
    }
    attemptsByEmail.delete(oldestEmailKey);
  }
}

function upsertRecord(emailKey, record, now) {
  record.lastUpdatedAt = now;
  attemptsByEmail.delete(emailKey);
  attemptsByEmail.set(emailKey, record);
}

function parseCookies(cookieHeader) {
  if (!cookieHeader) {
    return {};
  }

  return cookieHeader.split(';').reduce((acc, part) => {
    const [rawKey, ...rawValueParts] = part.split('=');
    const key = rawKey && rawKey.trim();
    if (!key) {
      return acc;
    }

    const rawValue = rawValueParts.join('=').trim();
    try {
      acc[key] = decodeURIComponent(rawValue);
    } catch {
      acc[key] = rawValue;
    }
    return acc;
  }, {});
}

function getRefreshTokenFromRequest(req) {
  const cookies = parseCookies(req.headers.cookie);
  return cookies[SESSION_COOKIE_NAME] || null;
}

function pruneSessions(now = Date.now()) {
  for (const [token, session] of sessionsByToken.entries()) {
    const isExpired = session.expiresAt <= now;
    const isInactive = now - session.lastSeenAt > SESSION_INACTIVITY_TIMEOUT_MS;

    if (isExpired || isInactive) {
      sessionsByToken.delete(token);
    }
  }
}

function createSession(emailKey, rememberMe, now = Date.now()) {
  pruneSessions(now);

  const token = crypto.randomBytes(48).toString('base64url');
  const ttl = rememberMe ? REMEMBER_ME_SESSION_TTL_MS : SESSION_TTL_MS;
  const session = {
    emailKey,
    rememberMe,
    createdAt: now,
    lastSeenAt: now,
    expiresAt: now + ttl
  };

  sessionsByToken.set(token, session);
  return { token, session };
}

function getValidSession(token, now = Date.now()) {
  if (!token) {
    return null;
  }

  pruneSessions(now);
  const session = sessionsByToken.get(token);
  if (!session) {
    return null;
  }

  session.lastSeenAt = now;
  sessionsByToken.set(token, session);
  return session;
}

function buildCookieOptions(rememberMe) {
  const cookieOptions = {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/'
  };

  // Session cookie when remember-me is disabled.
  if (rememberMe) {
    cookieOptions.maxAge = REMEMBER_ME_SESSION_TTL_MS;
  }

  return cookieOptions;
}

function getRecord(emailKey, now) {
  pruneAttemptRecords(now);

  const existing = attemptsByEmail.get(emailKey);
  if (existing) {
    upsertRecord(emailKey, existing, now);
    return existing;
  }

  const next = { failedAttempts: 0, lockedUntil: 0, lastUpdatedAt: now };
  attemptsByEmail.set(emailKey, next);
  return next;
}

const cleanupTimer = setInterval(() => {
  pruneAttemptRecords();
}, ATTEMPT_RECORD_TTL_MS);

cleanupTimer.unref();

app.get('/api/health', (_, res) => {
  res.json({ status: 'ok' });
});

app.post('/api/login', (req, res) => {
  const { email, password, rememberMe } = req.body || {};

  if (!email || !password) {
    return res.status(400).json({
      message: 'Email and password are required.'
    });
  }

  const emailKey = String(email).trim().toLowerCase();
  const now = Date.now();
  const record = getRecord(emailKey, now);

  if (record.lockedUntil > now) {
    return res.status(429).json({
      message: 'Account is temporarily locked due to failed login attempts.',
      lockedUntil: record.lockedUntil
    });
  }

  const emailMatches = emailKey === DEMO_EMAIL.toLowerCase();
  const passwordBuffer = Buffer.from(String(password));
  const expectedBuffer = Buffer.from(DEMO_PASSWORD);
  const passwordMatches =
    passwordBuffer.length === expectedBuffer.length &&
    crypto.timingSafeEqual(passwordBuffer, expectedBuffer);

  if (emailMatches && passwordMatches) {
    attemptsByEmail.delete(emailKey);

    const rememberMeEnabled = Boolean(rememberMe);
    const { token, session } = createSession(emailKey, rememberMeEnabled, now);
    res.cookie(SESSION_COOKIE_NAME, token, buildCookieOptions(rememberMeEnabled));

    return res.status(200).json({
      message: 'Login successful.',
      session: {
        rememberMe: rememberMeEnabled,
        expiresAt: session.expiresAt,
        inactivityTimeoutMs: SESSION_INACTIVITY_TIMEOUT_MS
      }
    });
  }

  record.failedAttempts += 1;
  record.lastUpdatedAt = now;

  if (record.failedAttempts >= MAX_FAILED_ATTEMPTS) {
    record.lockedUntil = now + LOCKOUT_MS;
    record.failedAttempts = 0;
    upsertRecord(emailKey, record, now);

    return res.status(429).json({
      message: 'Too many failed attempts. Please wait 10 minutes before retrying.',
      lockedUntil: record.lockedUntil
    });
  }

  upsertRecord(emailKey, record, now);

  return res.status(401).json({
    message: 'Invalid email or password.',
    attemptsRemaining: MAX_FAILED_ATTEMPTS - record.failedAttempts
  });
});

app.post('/api/session/validate', (req, res) => {
  const token = getRefreshTokenFromRequest(req);
  const session = getValidSession(token);

  if (!session) {
    return res.status(401).json({
      message: 'Session invalid or expired.'
    });
  }

  return res.status(200).json({
    message: 'Session is valid.',
    session: {
      rememberMe: session.rememberMe,
      expiresAt: session.expiresAt,
      inactivityTimeoutMs: SESSION_INACTIVITY_TIMEOUT_MS
    }
  });
});

app.post('/api/session/revoke', (req, res) => {
  const token = getRefreshTokenFromRequest(req);
  if (token) {
    sessionsByToken.delete(token);
  }

  res.clearCookie(SESSION_COOKIE_NAME, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/'
  });

  return res.status(200).json({
    message: 'Session revoked.'
  });
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Auth API listening on http://localhost:${PORT}`);
  });
}

module.exports = {
  app,
  parseCookies,
  getRefreshTokenFromRequest,
  createSession,
  getValidSession,
  buildCookieOptions,
  pruneSessions
};
