import express from 'express';
import cors from 'cors';
import { initializeDatabase } from './db/database.js';
import apiRoutes from './routes/api-routes.js';

const app = express();
const port = parseInt(process.env.PORT || '3001', 10);

// CORS: in development reflect the request origin to simplify local preview ports.
const isDev = process.env.NODE_ENV !== 'production';
let corsOptions: any;
if (isDev) {
  corsOptions = { origin: true, credentials: true };
} else {
  const allowedOrigins = (process.env.CORS_ALLOWED_ORIGINS || 'http://localhost:5173,http://localhost:4173')
    .split(',')
    .map((o) => o.trim());
  corsOptions = { origin: allowedOrigins, credentials: true };
}

// Middleware
app.use(cors(corsOptions));
app.use(express.json());

// Health check endpoint
app.get('/health', (_req, res) => {
  res.json({
    status: 'healthy',
    uptime: process.uptime(),
  });
});

// Mount API routes
app.use('/api', apiRoutes);

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
