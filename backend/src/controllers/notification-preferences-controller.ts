/**
 * Notification Preferences Controller — #786
 *
 * Endpoints for the per-channel, per-category preference matrix:
 *   GET   /api/users/me/notification-preferences
 *   PATCH /api/users/me/notification-preferences
 */

import { Request, Response } from 'express';
import {
  getPreferenceMatrix,
  updatePreferences,
  SUPPORTED_CHANNELS,
  SUPPORTED_CATEGORIES,
  type NotificationChannel,
  type NotificationCategory,
} from '../services/notifications/dispatch-guard.js';

interface AuthRequest extends Request {
  user?: { id: number; email: string; role_id: number };
}

/**
 * GET /api/users/me/notification-preferences
 *
 * Returns the full channel × category preference matrix for the
 * authenticated user.
 */
export async function listPreferences(
  req: AuthRequest,
  res: Response,
): Promise<void> {
  if (!req.user) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  try {
    const matrix = await getPreferenceMatrix(req.user.id);
    res.json({ preferences: matrix });
  } catch (err) {
    console.error('listPreferences failed:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
}

/**
 * PATCH /api/users/me/notification-preferences
 *
 * Accepts an array of preference updates:
 * ```json
 * {
 *   "updates": [
 *     { "channel": "email", "category": "budget_alert", "enabled": false },
 *     { "channel": "in_app", "category": "chat_message", "enabled": true }
 *   ]
 * }
 * ```
 */
export async function patchPreferences(
  req: AuthRequest,
  res: Response,
): Promise<void> {
  if (!req.user) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  const { updates } = req.body as {
    updates?: unknown[];
  };

  if (!Array.isArray(updates) || updates.length === 0) {
    res.status(400).json({
      error: 'Request body must contain a non-empty "updates" array',
    });
    return;
  }

  // Validate every entry
  const channelSet = new Set<string>(SUPPORTED_CHANNELS);
  const categorySet = new Set<string>(SUPPORTED_CATEGORIES);

  const validated: Array<{
    channel: NotificationChannel;
    category: NotificationCategory;
    enabled: boolean;
  }> = [];

  for (const entry of updates) {
    if (typeof entry !== 'object' || entry === null) {
      res.status(400).json({ error: 'Each update must be an object' });
      return;
    }

    const { channel, category, enabled } = entry as Record<string, unknown>;

    if (typeof channel !== 'string' || !channelSet.has(channel)) {
      res.status(400).json({
        error: `Invalid channel "${String(channel)}". Allowed: ${SUPPORTED_CHANNELS.join(', ')}`,
      });
      return;
    }

    if (typeof category !== 'string' || !categorySet.has(category)) {
      res.status(400).json({
        error: `Invalid category "${String(category)}". Allowed: ${SUPPORTED_CATEGORIES.join(', ')}`,
      });
      return;
    }

    if (typeof enabled !== 'boolean') {
      res.status(400).json({
        error: '"enabled" must be a boolean',
      });
      return;
    }

    validated.push({
      channel: channel as NotificationChannel,
      category: category as NotificationCategory,
      enabled,
    });
  }

  try {
    await updatePreferences(req.user.id, validated);
    const matrix = await getPreferenceMatrix(req.user.id);
    res.json({ preferences: matrix });
  } catch (err) {
    console.error('patchPreferences failed:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
}
