/**
 * Enriched Health Check Controller
 *
 * Returns structured health status including DB connectivity verification.
 * Monitoring systems can use the status field to fire alerts on failures.
 *
 * Response shape: { status, uptime, db, timestamp }
 *   - status: "healthy" | "degraded"
 *   - db: "ok" | "error"
 *
 * Addresses: #257 (Story)
 */

import { Request, Response } from 'express';
import { getDatabase } from '../db/database.js';

interface HealthResponse {
  status: 'healthy' | 'degraded';
  uptime: number;
  db: 'ok' | 'error';
  timestamp: string;
}

/**
 * GET /health
 * Runs a lightweight DB probe (SELECT 1) and returns structured status.
 */
export async function healthCheck(_req: Request, res: Response): Promise<void> {
  let dbStatus: 'ok' | 'error' = 'error';

  try {
    const db = getDatabase();
    await db.get('SELECT 1 AS ping');
    dbStatus = 'ok';
  } catch {
    dbStatus = 'error';
  }

  const overallStatus: HealthResponse['status'] = dbStatus === 'ok' ? 'healthy' : 'degraded';

  const response: HealthResponse = {
    status: overallStatus,
    uptime: process.uptime(),
    db: dbStatus,
    timestamp: new Date().toISOString(),
  };

  // Return 503 when degraded so load balancers can route away
  const httpStatus = overallStatus === 'healthy' ? 200 : 503;
  res.status(httpStatus).json(response);
}
