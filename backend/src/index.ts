import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import crypto from 'crypto';
import { initializeDatabase } from './db/database.js';
import apiRoutes from './routes/api-routes.js';
import * as publicShareController from './controllers/public-share-controller.js';

const app = express();
const port = parseInt(process.env.PORT || '4000', 10);

// CORS: use an explicit allowlist even in development to avoid permissive-origin issues.
const isDev = process.env.NODE_ENV !== 'production';
const DEV_ORIGINS = [
  'http://localhost:3000',
  'http://localhost:4173',
  'http://localhost:5173',
  'http://localhost:5174',
];
let corsOptions: { origin: string[]; credentials: boolean };
if (isDev) {
  corsOptions = { origin: DEV_ORIGINS, credentials: true };
} else {
  const allowedOrigins = (process.env.CORS_ALLOWED_ORIGINS || 'http://localhost:5173,http://localhost:4173')
    .split(',')
    .map((o) => o.trim());
  corsOptions = { origin: allowedOrigins, credentials: true };
}

// Middleware
app.use(cors(corsOptions));
app.use(cookieParser()); // Add cookie parser to read req.cookies
app.use(express.json());

// CSRF Protection — HMAC-signed stateless token.
// Works correctly through the Vite dev proxy where Double Submit Cookie
// is unreliable (Set-Cookie headers may not propagate back to the browser).
const CSRF_SECRET = process.env.CSRF_SECRET ?? crypto.randomBytes(32).toString('hex');

function generateCsrfToken(): string {
  const nonce = crypto.randomBytes(16).toString('hex');
  const hmac = crypto.createHmac('sha256', CSRF_SECRET).update(nonce).digest('hex');
  return `${nonce}.${hmac}`;
}

function verifyCsrfToken(token: string): boolean {
  const dot = token.lastIndexOf('.');
  if (dot === -1) return false;
  const nonce = token.slice(0, dot);
  const hmac = token.slice(dot + 1);
  if (!nonce || !hmac) return false;
  try {
    const expected = crypto.createHmac('sha256', CSRF_SECRET).update(nonce).digest('hex');
    const expectedBuf = Buffer.from(expected, 'hex');
    const actualBuf = Buffer.from(hmac, 'hex');
    if (expectedBuf.length !== actualBuf.length) return false;
    return crypto.timingSafeEqual(expectedBuf, actualBuf);
  } catch {
    return false;
  }
}

const csrfProtection = (req: express.Request, res: express.Response, next: express.NextFunction): void => {
  // GET / HEAD / OPTIONS are safe methods — skip check
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    next();
    return;
  }

  const headerToken = (req.headers['x-xsrf-token'] as string | undefined) ?? '';
  if (!verifyCsrfToken(headerToken)) {
    res.status(403).json({ error: 'Invalid CSRF token' });
    return;
  }

  next();
};

// Health check endpoint
app.get('/health', (_req, res) => {
  res.json({
    status: 'healthy',
    uptime: process.uptime(),
  });
});

// CSRF token endpoint — called by the frontend before any state-changing request.
// Returns an HMAC-signed token; no cookie required.
app.get('/api/csrf-token', (_req, res) => {
  res.json({ csrfToken: generateCsrfToken() });
});

// Public photo share (no auth)
app.get('/share/photo/:token', publicShareController.publicPhotoView);

// Mount API routes with CSRF protection for state-changing methods
app.use('/api', csrfProtection, apiRoutes);

// Start server after initializing the database
async function start(): Promise<void> {
  await initializeDatabase();
  app.listen(port, '0.0.0.0', () => {
    console.log(`Festival Planner API running on port ${port}`);
  });
}

start().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
