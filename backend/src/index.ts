import express from 'express';
import cors from 'cors';
import { initializeDatabase } from './db/database.js';
import apiRoutes from './routes/api-routes.js';

const app = express();
const port = parseInt(process.env.PORT || '3001', 10);

const allowedOrigins = (process.env.CORS_ALLOWED_ORIGINS || 'http://localhost:5173')
  .split(',')
  .map((o) => o.trim());

// Middleware
app.use(cors({ origin: allowedOrigins, credentials: true }));
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
