/**
 * Admin Settings Controller
 *
 * Provides CRUD endpoints for system-wide settings stored in the
 * system_settings table. Only Admin users may access these endpoints.
 *
 * Addresses: #244 (Story)
 */

import { Request, Response } from 'express';
import { getDatabase } from '../db/database.js';
import logger from '../utils/logger.js';

interface SystemSetting {
  key: string;
  value: string;
  description: string | null;
  updated_at: string;
  updated_by: number | null;
}

/**
 * GET /api/admin/settings
 * Returns all system settings as a list.
 */
export async function getSettings(req: Request, res: Response): Promise<void> {
  const db = getDatabase();
  const settings = await db.all<SystemSetting[]>(
    'SELECT key, value, description, updated_at, updated_by FROM system_settings ORDER BY key',
  );
  res.json({ settings });
}

/**
 * PATCH /api/admin/settings
 * Updates one or more settings. Body: { settings: { key: value, ... } }
 */
export async function updateSettings(req: Request, res: Response): Promise<void> {
  const { settings } = req.body as { settings?: Record<string, string> };

  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) {
    res.status(400).json({ error: 'Body must contain a "settings" object with key-value pairs' });
    return;
  }

  const db = getDatabase();
  const user = (req as Request & { user?: { id: number } }).user;
  const userId = user?.id ?? null;
  const updated: string[] = [];

  for (const [key, value] of Object.entries(settings)) {
    if (typeof key !== 'string' || typeof value !== 'string') continue;

    // Sanitize: reject keys with invalid characters
    if (!/^[a-zA-Z0-9._-]+$/.test(key)) {
      res.status(400).json({ error: `Invalid setting key: "${key}"` });
      return;
    }

    await db.run(
      `INSERT INTO system_settings (key, value, updated_by, updated_at)
       VALUES (?, ?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT (key) DO UPDATE SET value = ?, updated_by = ?, updated_at = CURRENT_TIMESTAMP`,
      [key, value, userId, value, userId],
    );
    updated.push(key);
  }

  logger.info({ userId, keys: updated }, 'System settings updated');
  res.json({ updated });
}
