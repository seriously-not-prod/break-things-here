import './config/load-env.js';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import crypto from 'crypto';
import { pathToFileURL } from 'url';
import { initializeDatabase } from './db/database.js';
import { sanitizeRequestBody } from './middleware/sanitize-input.js';
import apiRoutes from './routes/api-routes.js';

const port = parseInt(process.env.PORT || '4000', 10);
const DEV_ORIGINS = [
  'http://localhost:3000',
  'http://localhost:4173',
  'http://localhost:5173',
  'http://localhost:5174',
];

function getAllowedOrigins(isDev: boolean): string[] {
  if (isDev) {
    return DEV_ORIGINS;
  }

  return (process.env.CORS_ALLOWED_ORIGINS || 'http://localhost:5173,http://localhost:4173')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}

export function createApp(): express.Express {
  const app = express();

  // Trust the first proxy (nginx) so express-rate-limit and req.ip work correctly
  app.set('trust proxy', 1);

  const isDev = process.env.NODE_ENV !== 'production';
  const allowedOrigins = getAllowedOrigins(isDev);
  const corsOptions = { origin: allowedOrigins, credentials: true };

  // helmet must be first — sets X-Content-Type-Options, X-Frame-Options, etc. (#266)
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:', 'blob:'],
          connectSrc: ["'self'", ...allowedOrigins],
          fontSrc: ["'self'"],
          objectSrc: ["'none'"],
          frameAncestors: ["'none'"],
        },
      },
      crossOriginResourcePolicy: { policy: isDev ? 'cross-origin' : 'same-origin' },
    }),
  );
  app.use(cors(corsOptions));
  app.use(cookieParser());
  app.use(express.json());

  // CSRF Protection — HMAC-signed stateless token.
  // Works correctly through nginx reverse proxy where Double Submit Cookie
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

  app.use('/api', csrfProtection, sanitizeRequestBody, apiRoutes);

  return app;
}

async function start(): Promise<void> {
  await initializeDatabase();
  const app = createApp();
  app.listen(port, '0.0.0.0', () => {
    console.log(`Festival Planner API running on port ${port}`);
  });
}

const isDirectExecution = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectExecution) {
  start().catch((err) => {
    console.error('Failed to start server:', err);
    process.exit(1);
  });
}
