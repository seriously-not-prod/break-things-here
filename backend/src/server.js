import express from 'express';
import cors from 'cors';
import crypto from 'crypto';

const app = express();
const PORT = Number(process.env.PORT || 3001);
const MAX_FAILED_ATTEMPTS = 3;
const LOCKOUT_MS = 10 * 60 * 1000;
const PERSISTENT_SESSION_MAX_AGE = 30 * 24 * 60 * 60 * 1000; // 30 days

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
  ? corsOriginsEnv
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean)
  : DEFAULT_CORS_ORIGINS;

const attemptsByEmail = new Map();

app.use(
  cors({
    origin: allowedCorsOrigins,
  }),
);
app.use(express.json());

function pruneAttemptRecords(now = Date.now()) {
  for (const [emailKey, record] of attemptsByEmail.entries()) {
    const isExpired =
      record.lockedUntil <= now && now - record.lastUpdatedAt > ATTEMPT_RECORD_TTL_MS;
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

// Health endpoint — canonical path is /health (matches docker-compose healthcheck and index.ts).
// Legacy /api/health alias retained for backward compat.
app.get('/health', (_, res) => {
  res.json({ status: 'ok' });
});

app.get('/api/health', (_, res) => {
  res.json({ status: 'ok' });
});

// In-memory session store for demo
const sessions = new Map();

function parseCookies(cookieHeader) {
  const cookies = {};
  if (!cookieHeader) return cookies;
  cookieHeader.split(';').forEach((pair) => {
    const [key, ...rest] = pair.trim().split('=');
    if (key) cookies[key.trim()] = rest.join('=').trim();
  });
  return cookies;
}

app.post('/api/login', (req, res) => {
  const { email, password, rememberMe } = req.body || {};

  if (!email || !password) {
    return res.status(400).json({
      message: 'Email and password are required.',
    });
  }

  const emailKey = String(email).trim().toLowerCase();
  const now = Date.now();
  const record = getRecord(emailKey, now);

  if (record.lockedUntil > now) {
    return res.status(429).json({
      message: 'Account is temporarily locked due to failed login attempts.',
      lockedUntil: record.lockedUntil,
    });
  }

  const emailMatches = emailKey === DEMO_EMAIL.toLowerCase();
  const passwordMatches = String(password) === DEMO_PASSWORD;

  if (emailMatches && passwordMatches) {
    attemptsByEmail.delete(emailKey);

    const sessionToken = crypto.randomBytes(32).toString('hex');
    sessions.set(sessionToken, {
      email: emailKey,
      rememberMe: !!rememberMe,
      createdAt: Date.now(),
    });

    const cookieOptions = [`refreshToken=${sessionToken}`, 'Path=/', 'HttpOnly', 'SameSite=Strict'];

    if (rememberMe) {
      cookieOptions.push(`Max-Age=${Math.floor(PERSISTENT_SESSION_MAX_AGE / 1000)}`);
    }

    res.setHeader('Set-Cookie', cookieOptions.join('; '));

    return res.status(200).json({
      message: 'Login successful.',
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
      lockedUntil: record.lockedUntil,
    });
  }

  upsertRecord(emailKey, record, now);

  return res.status(401).json({
    message: 'Invalid email or password.',
    attemptsRemaining: MAX_FAILED_ATTEMPTS - record.failedAttempts,
  });
});

app.post('/api/session/validate', (req, res) => {
  const cookies = parseCookies(req.headers.cookie);
  const token = cookies.refreshToken;

  if (!token || !sessions.has(token)) {
    return res.status(401).json({ message: 'Invalid or expired session.' });
  }

  const session = sessions.get(token);
  return res.status(200).json({ session });
});

app.post('/api/session/revoke', (req, res) => {
  const cookies = parseCookies(req.headers.cookie);
  const token = cookies.refreshToken;

  if (token) {
    sessions.delete(token);
  }

  return res.status(200).json({ message: 'Session revoked.' });
});

app.listen(PORT, () => {
  console.log(`Auth API listening on http://localhost:${PORT}`);
});

export { app };
