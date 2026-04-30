import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import crypto from 'crypto';
import { initializeDatabase } from './db/database.js';
import apiRoutes from './routes/api-routes.js';

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
// Security headers — must be first
app.use(helmet({
  // REST API consumed by a separate frontend origin; CSP is not applicable
  contentSecurityPolicy: false,
  // Allow cross-origin fetch from the configured frontend origins
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}));
app.use(cors(corsOptions));
app.use(cookieParser()); // Add cookie parser to read req.cookies
app.use(express.json());

// CSRF Protection Middleware (Double Submit Cookie pattern)
// This is applied via middleware in routes to prevent CSRF attacks
const csrfProtection = (req: express.Request, res: express.Response, next: express.NextFunction): void => {
  // Skip CSRF check for GET, HEAD, OPTIONS requests (safe methods)
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    next();
    return;
  }
  
  const cookieToken = req.cookies['XSRF-TOKEN'];
  const headerToken = req.headers['x-xsrf-token'] as string;
  
  if (!cookieToken || !headerToken || cookieToken !== headerToken) {
    // Log details to help debug CSRF failures during development
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

// Generate and set CSRF token for all requests
app.use((req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (!req.cookies['XSRF-TOKEN']) {
    const token = crypto.randomBytes(32).toString('hex');
    res.cookie('XSRF-TOKEN', token, {
      httpOnly: false, // Must be readable by JavaScript for header inclusion
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict'
    });
  }
  next();
});

// Health check endpoint
app.get('/health', (_req, res) => {
  res.json({
    status: 'healthy',
    uptime: process.uptime(),
  });
});

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
