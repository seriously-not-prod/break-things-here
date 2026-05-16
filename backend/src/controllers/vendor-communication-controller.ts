/**
 * Vendor Communication Log Controller (#452)
 * Stores and retrieves communication history per vendor.
 */

import { Request, Response } from 'express';
import { getDatabase } from '../db/database.js';
import { requireEventAccess } from '../utils/event-access.js';

interface AuthRequest extends Request {
  user?: { id: number; email: string; role_id: number };
}

const VALID_TYPES = ['email', 'call', 'meeting', 'quote', 'follow_up', 'other'] as const;
type CommType = (typeof VALID_TYPES)[number];

interface VendorCommLog {
  id: number;
  event_id: number;
  vendor_id: number;
  type: CommType;
  subject: string;
  body: string | null;
  sent_by: number | null;
  created_at: string;
}

// ─── List Communication Log ───────────────────────────────────────────────────

/** GET /api/events/:eventId/vendors/:vendorId/communication */
export async function listVendorCommunication(req: Request, res: Response): Promise<Response> {
  const authReq = req as AuthRequest;
  if (!authReq.user) return res.status(401).json({ error: 'Authentication required.' });

  const { eventId, vendorId } = req.params;
  const event = await requireEventAccess(authReq, res, eventId, { allowMembers: true });
  if (!event) return res as Response;

  const db = getDatabase();

  const vendor = await db.get<{ id: number }>(
    `SELECT id FROM vendors WHERE id = $1 AND event_id = $2`,
    [vendorId, eventId],
  );
  if (!vendor) return res.status(404).json({ error: 'Vendor not found in this event.' });

  const logs = await db.all<VendorCommLog & { author_name: string | null }>(
    `SELECT vcl.*, u.display_name AS author_name
     FROM vendor_communication_log vcl
     LEFT JOIN users u ON u.id = vcl.sent_by
     WHERE vcl.vendor_id = $1 AND vcl.event_id = $2
     ORDER BY vcl.created_at DESC`,
    [vendorId, eventId],
  );

  return res.json({ logs });
}

// ─── Add Log Entry ────────────────────────────────────────────────────────────

/** POST /api/events/:eventId/vendors/:vendorId/communication */
export async function addVendorCommunication(req: Request, res: Response): Promise<Response> {
  const authReq = req as AuthRequest;
  if (!authReq.user) return res.status(401).json({ error: 'Authentication required.' });

  const { eventId, vendorId } = req.params;
  const { type, subject, body } = req.body as {
    type?: string;
    subject?: string;
    body?: string;
  };

  if (!type || !VALID_TYPES.includes(type as CommType)) {
    return res.status(400).json({
      error: `type must be one of: ${VALID_TYPES.join(', ')}.`,
    });
  }
  if (!subject?.trim()) return res.status(400).json({ error: 'subject is required.' });

  const event = await requireEventAccess(authReq, res, eventId, { allowMembers: true });
  if (!event) return res as Response;

  const db = getDatabase();

  const vendor = await db.get<{ id: number }>(
    `SELECT id FROM vendors WHERE id = $1 AND event_id = $2`,
    [vendorId, eventId],
  );
  if (!vendor) return res.status(404).json({ error: 'Vendor not found in this event.' });

  const result = await db.run(
    `INSERT INTO vendor_communication_log (event_id, vendor_id, type, subject, body, sent_by)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    [eventId, vendorId, type, subject.trim(), body?.trim() ?? null, authReq.user.id],
  );

  const log = await db.get<VendorCommLog & { author_name: string | null }>(
    `SELECT vcl.*, u.display_name AS author_name
     FROM vendor_communication_log vcl
     LEFT JOIN users u ON u.id = vcl.sent_by
     WHERE vcl.id = $1`,
    [result.lastID],
  );

  return res.status(201).json({ log });
}

// ─── Delete Log Entry ─────────────────────────────────────────────────────────

/** DELETE /api/events/:eventId/vendors/:vendorId/communication/:logId */
export async function deleteVendorCommunication(req: Request, res: Response): Promise<Response> {
  const authReq = req as AuthRequest;
  if (!authReq.user) return res.status(401).json({ error: 'Authentication required.' });

  const { eventId, vendorId, logId } = req.params;
  const event = await requireEventAccess(authReq, res, eventId, { allowMembers: true });
  if (!event) return res as Response;

  const db = getDatabase();
  const log = await db.get<VendorCommLog>(
    `SELECT * FROM vendor_communication_log WHERE id = $1 AND vendor_id = $2 AND event_id = $3`,
    [logId, vendorId, eventId],
  );
  if (!log) return res.status(404).json({ error: 'Communication log entry not found.' });

  // Restrict to: entry author OR event owner/admin
  const isAuthor = log.sent_by === authReq.user.id;
  const isOwner = event.created_by === authReq.user.id;
  if (!isAuthor && !isOwner) {
    return res.status(403).json({ error: 'Not authorised to delete this communication log entry.' });
  }

  await db.run(`DELETE FROM vendor_communication_log WHERE id = $1`, [logId]);
  return res.json({ message: 'Communication log entry deleted.' });
}

// ─── Compare Vendors ──────────────────────────────────────────────────────────

/**
 * GET /api/events/:eventId/vendors/compare?ids=1,2,3
 * Returns side-by-side comparison data for the specified vendor IDs.
 */
export async function compareVendors(req: Request, res: Response): Promise<Response> {
  const authReq = req as AuthRequest;
  if (!authReq.user) return res.status(401).json({ error: 'Authentication required.' });

  const { eventId } = req.params;
  const { ids } = req.query as { ids?: string };

  if (!ids) return res.status(400).json({ error: 'ids query param is required (comma-separated vendor IDs).' });

  const vendorIds = ids
    .split(',')
    .map((s) => parseInt(s.trim(), 10))
    .filter((n) => !Number.isNaN(n));

  if (vendorIds.length < 2) {
    return res.status(400).json({ error: 'At least two vendor IDs are required for comparison.' });
  }
  if (vendorIds.length > 5) {
    return res.status(400).json({ error: 'Cannot compare more than 5 vendors at once.' });
  }

  const event = await requireEventAccess(authReq, res, eventId, { allowMembers: true });
  if (!event) return res as Response;

  const db = getDatabase();

  const placeholders = vendorIds.map((_, i) => `$${i + 1}`).join(',');
  const eventIdParam = vendorIds.length + 1;
  const vendors = await db.all(
    `SELECT
       v.*,
       COUNT(vcl.id)::int AS communication_count,
       MAX(vcl.created_at) AS last_contact_at
     FROM vendors v
     LEFT JOIN vendor_communication_log vcl ON vcl.vendor_id = v.id
     WHERE v.id IN (${placeholders}) AND v.event_id = $${eventIdParam}
     GROUP BY v.id
     ORDER BY v.name ASC`,
    [...vendorIds, eventId],
  );

  return res.json({ vendors });
}
