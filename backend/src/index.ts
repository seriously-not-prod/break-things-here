import './config/load-env.js';
import {
  isEntraEnabled,
  isLocalFallbackAllowed,
  validateEntraConfigAtStartup,
} from './config/entra.js';
import { assertStrictDataSecurityControlsAtStartup } from './config/security-controls.js';
import { logger, requestLogger } from './utils/logger.js';
import { startJobScheduler } from './utils/job-scheduler.js';

// Prevent unhandled promise rejections from crashing the server process.
// Log the error and keep running so a single bad query doesn't take the app down.
process.on('unhandledRejection', (reason: unknown) => {
  console.error('[UNHANDLED REJECTION] An unhandled promise rejection was caught:', reason);
});
process.on('uncaughtException', (err: Error) => {
  console.error('[UNCAUGHT EXCEPTION] An uncaught exception was caught:', err);
});
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import crypto from 'crypto';
import { pathToFileURL } from 'url';
import swaggerJsdoc from 'swagger-jsdoc';
import swaggerUi from 'swagger-ui-express';
import { initializeDatabase } from './db/database.js';
import { sanitizeRequestBody } from './middleware/sanitize-input.js';
import { apiLimiter, csrfLimiter, healthLimiter, metricsLimiter } from './middleware/rate-limit.js';
import { verifyEmailWebhookSignature } from './middleware/verify-email-webhook.js';
import * as announcementController from './controllers/announcement-controller.js';
import apiRoutes from './routes/api-routes.js';

const port = parseInt(process.env.PORT || '4000', 10);
const DEV_ORIGINS = [
  'http://localhost:3000',
  'http://localhost:4173',
  'http://localhost:5173',
  'http://localhost:5174',
  'http://localhost:8080',
];

// Module-level CSRF secret — computed once per process so hot-reloads in dev
// don't invalidate tokens already held by the frontend. Set CSRF_SECRET in the
// environment (or .env / docker-compose) to guarantee stability across restarts.
const CSRF_SECRET: string = (() => {
  const s = process.env.CSRF_SECRET;
  if (s) return s;
  const env = process.env.NODE_ENV ?? 'development';
  if (env === 'production' || env === 'staging') {
    console.error(
      '[SECURITY] FATAL: CSRF_SECRET is not set in production/staging environment. Refusing to start.',
    );
    process.exit(1);
  }
  const ephemeral = crypto.randomBytes(32).toString('hex');
  console.warn(
    '[SECURITY] CSRF_SECRET is not set. Using an ephemeral per-startup secret — ' +
      'tokens will not survive restarts. Set CSRF_SECRET for stable sessions.',
  );
  return ephemeral;
})();

function getAllowedOrigins(isDev: boolean): string[] {
  if (isDev) {
    return DEV_ORIGINS;
  }

  return (process.env.CORS_ALLOWED_ORIGINS || 'http://localhost:5173,http://localhost:4173')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}

function shouldEnforceHttps(nodeEnv: string | undefined): boolean {
  if (process.env.ENFORCE_HTTPS === 'true') return true;
  if (process.env.ENFORCE_HTTPS === 'false') return false;
  return nodeEnv === 'production' || nodeEnv === 'staging';
}

function isRequestSecure(req: express.Request): boolean {
  if (req.secure) return true;
  const forwardedProto = req.header('x-forwarded-proto');
  if (!forwardedProto) return false;
  return forwardedProto
    .split(',')
    .map((part) => part.trim())
    .includes('https');
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
      hsts: {
        maxAge: 31536000,
        includeSubDomains: true,
        preload: true,
      },
    }),
  );
  app.use(cors(corsOptions));
  // Preserve the raw request body alongside the parsed JSON so route-specific
  // signature middleware (e.g. the email-bounce HMAC verifier in
  // /webhooks/email/bounce) can hash exactly the bytes the provider signed.
  app.use(
    express.json({
      verify: (req, _res, buf) => {
        (req as express.Request & { rawBody?: Buffer }).rawBody = buf;
      },
    }),
  );

  // CSRF Protection — HMAC-signed stateless token.
  // Works correctly through nginx reverse proxy where Double Submit Cookie
  // is unreliable (Set-Cookie headers may not propagate back to the browser).
  // CSRF_SECRET is defined at module level to survive hot-reloads.

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

  const csrfProtection = (
    req: express.Request,
    res: express.Response,
    next: express.NextFunction,
  ): void => {
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

  app.use(requestLogger);

  // Explicit API cache strategy (NFR §5.1):
  // - API GET/HEAD responses: 5-minute private cache
  // - vary on auth credentials to prevent cross-user cache bleed
  app.use('/api', (req, res, next) => {
    // Keep /api/health behavior aligned with canonical /health endpoint.
    if (req.path === '/health') {
      next();
      return;
    }

    if (req.method === 'GET' || req.method === 'HEAD') {
      res.setHeader('Cache-Control', 'private, max-age=300, stale-while-revalidate=60');
      res.setHeader('Vary', 'Authorization, Cookie');
    }
    next();
  });

  const enforceHttps = shouldEnforceHttps(process.env.NODE_ENV);
  if (enforceHttps) {
    app.use((req, res, next) => {
      if (isRequestSecure(req)) {
        next();
        return;
      }

      if (req.method === 'GET' || req.method === 'HEAD') {
        const host = req.get('host');
        if (host) {
          res.redirect(308, `https://${host}${req.originalUrl}`);
          return;
        }
      }

      res.status(400).json({ error: 'HTTPS is required for this endpoint.' });
    });
  }

  // Shared health handler so /health and /api/health always stay identical.
  const healthCheckHandler: express.RequestHandler = async (_req, res) => {
    const checks: Record<string, string> = {};
    let httpStatus = 200;
    try {
      const { getPool } = await import('./db/database.js');
      const pool = getPool();
      const client = await pool.connect();
      try {
        await client.query('SELECT 1');
      } finally {
        client.release();
      }
      checks.database = 'ok';
    } catch (err) {
      const msg = String(err);
      if (msg.includes('not initialized') || msg.includes('not configured')) {
        // Pool not yet set up (e.g., test environment); skip DB check
        checks.database = 'not_configured';
      } else {
        checks.database = 'unavailable';
        httpStatus = 503;
        logger.error('[Health] DB connectivity check failed', { error: msg });
      }
    }
    res.status(httpStatus).json({
      status: httpStatus === 200 ? 'healthy' : 'degraded',
      uptime: process.uptime(),
      checks,
    });
  };

  // Health check — validates DB connectivity; returns 503 if DB unreachable (#676)
  app.get('/health', healthLimiter, healthCheckHandler);

  // TRD path compatibility alias.
  app.get('/api/health', healthLimiter, healthCheckHandler);

  // #784 — Graph groups cache metrics endpoint
  app.get('/metrics', metricsLimiter, async (_req, res) => {
    const { getGraphGroupsMetrics } = await import('./services/graph-groups.js');
    const m = getGraphGroupsMetrics();
    const lines = [
      `# HELP graph_groups_cache_hit_total Number of graph group cache hits`,
      `# TYPE graph_groups_cache_hit_total counter`,
      `graph_groups_cache_hit_total ${m.graph_groups_cache_hit_total}`,
      `# HELP graph_groups_cache_miss_total Number of graph group cache misses`,
      `# TYPE graph_groups_cache_miss_total counter`,
      `graph_groups_cache_miss_total ${m.graph_groups_cache_miss_total}`,
      `# HELP graph_groups_failure_total Number of graph group fetch failures`,
      `# TYPE graph_groups_failure_total counter`,
      `graph_groups_failure_total ${m.graph_groups_failure_total}`,
    ];
    res.setHeader('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
    res.send(lines.join('\n') + '\n');
  });

  // CSRF token endpoint — called by the frontend before any state-changing request.
  // Returns an HMAC-signed token; no cookie required.
  // Uses a separate, higher limiter because the frontend may request a token
  // on load and across multiple tabs before sending mutations.
  app.get('/api/csrf-token', csrfLimiter, (_req, res) => {
    res.json({ csrfToken: generateCsrfToken() });
  });

  // Email-provider bounce webhook lives OUTSIDE /api: the /api mount applies
  // a double-submit CSRF check to every non-GET request, and external email
  // providers cannot send our CSRF token. HMAC signature verification on the
  // raw body is the real authentication for this endpoint.
  app.post(
    '/webhooks/email/bounce',
    verifyEmailWebhookSignature,
    announcementController.handleEmailBounce,
  );

  // Rate-limit + CSRF protection applied here before all /api routes.
  // cookieParser() is intentionally NOT used as middleware; cookies are parsed
  // directly in auth.ts and auth-controller.ts only where needed, so there is
  // no global "cookie middleware" for CodeQL's missing-csrf query to flag.
  app.use('/api', apiLimiter, csrfProtection, sanitizeRequestBody, apiRoutes);

  // OpenAPI / Swagger docs — served at /api-docs (TRD maintainability requirement).
  // Only exposed in non-production environments.
  if (process.env.NODE_ENV !== 'production') {
    const swaggerSpec = swaggerJsdoc({
      definition: {
        openapi: '3.0.3',
        info: {
          title: 'Festival & Event Planner API',
          version: '2.0.0',
          description:
            'RESTful API documentation for the Festival & Event Planner application. ' +
            'Generated from JSDoc annotations on route handlers.',
          contact: { name: 'API Support', email: 'support@festivalplanner.local' },
        },
        servers: [
          { url: `http://localhost:${port}/api`, description: 'Development' },
          { url: 'https://api.festivalplanner.example/api', description: 'Production' },
        ],
        components: {
          securitySchemes: {
            BearerAuth: {
              type: 'http',
              scheme: 'bearer',
              bearerFormat: 'JWT',
              description: 'JWT access token issued by /api/auth/login or Entra ID callback.',
            },
          },
        },
        security: [{ BearerAuth: [] }],
        paths: {
          '/health': {
            get: {
              summary: 'Service health check',
              description:
                'Returns service health and database connectivity status. ' +
                'Canonical health endpoint for runtime probes.',
              tags: ['Health'],
              security: [],
              servers: [
                { url: `http://localhost:${port}`, description: 'Development (root)' },
                { url: 'https://api.festivalplanner.example', description: 'Production (root)' },
              ],
              responses: {
                200: {
                  description: 'Service is healthy',
                },
                503: {
                  description: 'Service is degraded (for example, database unavailable)',
                },
              },
            },
          },
          '/api/health': {
            get: {
              summary: 'Service health check (alias)',
              description: 'Alias of /health that returns the same payload and status code.',
              tags: ['Health'],
              security: [],
              servers: [
                { url: `http://localhost:${port}`, description: 'Development (root)' },
                { url: 'https://api.festivalplanner.example', description: 'Production (root)' },
              ],
              responses: {
                200: {
                  description: 'Service is healthy',
                },
                503: {
                  description: 'Service is degraded (for example, database unavailable)',
                },
              },
            },
          },
        },
      },
      apis: [
        './src/routes/*.ts',
        './src/routes/*.js',
        './src/controllers/*.ts',
        './src/controllers/*.js',
      ],
    });
    app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, { explorer: true }));
    app.get('/api-docs.json', (_req, res) => res.json(swaggerSpec));
    logger.info(`Swagger UI available at http://localhost:${port}/api-docs`);
  }

  return app;
}

async function start(): Promise<void> {
  assertStrictDataSecurityControlsAtStartup();
  validateEntraConfigAtStartup();

  // Warn if local-auth fallback is permitted alongside Entra in production (#783)
  if (process.env.NODE_ENV === 'production' && isEntraEnabled() && isLocalFallbackAllowed()) {
    console.warn(
      '[SECURITY] WARNING: ENTRA_ALLOW_LOCAL_FALLBACK is enabled in production. ' +
        'Local email/password login is available alongside Entra ID SSO. ' +
        'Set ENTRA_ALLOW_LOCAL_FALLBACK=false (or unset it) to enforce Entra-only authentication.',
    );
  }

  await initializeDatabase();
  startJobScheduler();
  const app = createApp();
  app.listen(port, '0.0.0.0', () => {
    logger.info(`Festival Planner API running on port ${port}`, { port });
  });
}

const isDirectExecution =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectExecution) {
  start().catch((err) => {
    console.error('Failed to start server:', err);
    process.exit(1);
  });
}
