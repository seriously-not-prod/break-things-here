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

  const csrfProtection = (req: express.Request, res: express.Response, next: express.NextFunction): void => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      next();
      return;
    }

    const cookieToken = req.cookies['XSRF-TOKEN'];
    const headerToken = req.headers['x-xsrf-token'] as string;

    if (!cookieToken || !headerToken || cookieToken !== headerToken) {
      console.warn('CSRF validation failed', {
        method: req.method,
        path: req.path,
        origin: req.headers.origin || req.headers.referer || null,
        cookieToken: !!cookieToken,
        headerToken: !!headerToken,
        cookieTokenValue: cookieToken ? cookieToken.slice(0, 8) + '...' : null,
        headerTokenValue: headerToken ? headerToken.slice(0, 8) + '...' : null,
      });
      res.status(403).json({ error: 'Invalid CSRF token' });
      return;
    }

    next();
  };

  app.use((req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (!req.cookies['XSRF-TOKEN']) {
      const token = crypto.randomBytes(32).toString('hex');
      res.cookie('XSRF-TOKEN', token, {
        httpOnly: false,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
      });
    }
    next();
  });

  app.get('/health', (_req, res) => {
    res.json({
      status: 'healthy',
      uptime: process.uptime(),
    });
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
