const express = require('express');
const cors = require('cors');

const app = express();
const PORT = Number(process.env.PORT || 3001);
const MAX_FAILED_ATTEMPTS = 3;
const LOCKOUT_MS = 10 * 60 * 1000;

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

app.use(
  cors({
    origin: allowedCorsOrigins
  })
);
app.use(express.json());

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
  const { email, password } = req.body || {};

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
  const passwordMatches = String(password) === DEMO_PASSWORD;

  if (emailMatches && passwordMatches) {
    attemptsByEmail.delete(emailKey);

    return res.status(200).json({
      message: 'Login successful.'
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

app.listen(PORT, () => {
  console.log(`Auth API listening on http://localhost:${PORT}`);
});
