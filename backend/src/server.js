const express = require('express');
const cors = require('cors');

const app = express();
const PORT = Number(process.env.PORT || 3001);
const MAX_FAILED_ATTEMPTS = 3;
const LOCKOUT_MS = 10 * 60 * 1000;

const DEMO_EMAIL = process.env.DEMO_EMAIL || 'user@example.com';
const DEMO_PASSWORD = process.env.DEMO_PASSWORD || 'Password123!';

const attemptsByEmail = new Map();

app.use(
  cors({
    origin: ['http://localhost:5173']
  })
);
app.use(express.json());

function getRecord(emailKey) {
  const existing = attemptsByEmail.get(emailKey);
  if (existing) {
    return existing;
  }

  const next = { failedAttempts: 0, lockedUntil: 0 };
  attemptsByEmail.set(emailKey, next);
  return next;
}

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
  const record = getRecord(emailKey);

  if (record.lockedUntil > now) {
    return res.status(429).json({
      message: 'Account is temporarily locked due to failed login attempts.',
      lockedUntil: record.lockedUntil
    });
  }

  const emailMatches = emailKey === DEMO_EMAIL.toLowerCase();
  const passwordMatches = String(password) === DEMO_PASSWORD;

  if (emailMatches && passwordMatches) {
    record.failedAttempts = 0;
    record.lockedUntil = 0;

    return res.status(200).json({
      message: 'Login successful.'
    });
  }

  record.failedAttempts += 1;

  if (record.failedAttempts >= MAX_FAILED_ATTEMPTS) {
    record.lockedUntil = now + LOCKOUT_MS;
    record.failedAttempts = 0;

    return res.status(429).json({
      message: 'Too many failed attempts. Please wait 10 minutes before retrying.',
      lockedUntil: record.lockedUntil
    });
  }

  return res.status(401).json({
    message: 'Invalid email or password.',
    attemptsRemaining: MAX_FAILED_ATTEMPTS - record.failedAttempts
  });
});

app.listen(PORT, () => {
  console.log(`Auth API listening on http://localhost:${PORT}`);
});
