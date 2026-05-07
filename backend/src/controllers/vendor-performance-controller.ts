/**
 * Vendor Performance Metrics Controller (#463)
 * Derives and returns post-event performance metrics per vendor.
 */

import { Request, Response } from 'express';
import { getDatabase } from '../db/database.js';
import { requireEventAccess } from '../utils/event-access.js';

interface AuthRequest extends Request {
  user?: { id: number; email: string; role_id: number };
}

/**
 * GET /api/events/:eventId/vendors/:vendorId/performance
 * Returns aggregated performance data for a single vendor.
 */
export async function getVendorPerformance(req: Request, res: Response): Promise<Response> {
  const authReq = req as AuthRequest;
  if (!authReq.user) return res.status(401).json({ error: 'Authentication required.' });

  const { eventId, vendorId } = req.params;
  const event = await requireEventAccess(authReq, res, eventId, { allowMembers: true });
  if (!event) return res as Response;

  const db = getDatabase();

  const vendor = await db.get<{
    id: number;
    name: string;
    category: string;
    status: string;
    quoted_amount: number | null;
    rating: number | null;
    contract_file: string | null;
    created_at: string;
  }>(
    `SELECT id, name, category, status, quoted_amount, rating, contract_file, created_at
     FROM vendors WHERE id = ? AND event_id = ?`,
    [vendorId, eventId],
  );
  if (!vendor) return res.status(404).json({ error: 'Vendor not found in this event.' });

  // Communication responsiveness: count and days since last contact
  const commStats = await db.get<{
    total_communications: number;
    last_contact_at: string | null;
  }>(
    `SELECT COUNT(*)::int AS total_communications, MAX(created_at) AS last_contact_at
     FROM vendor_communication_log
     WHERE vendor_id = ? AND event_id = ?`,
    [vendorId, eventId],
  );

  // Expenses associated with this vendor
  const expenseStats = await db.get<{
    total_expenses: number;
    total_paid: number;
    total_pending: number;
  }>(
    `SELECT
       COUNT(*)::int                                                       AS total_expenses,
       COALESCE(SUM(amount) FILTER (WHERE payment_status = 'Paid'), 0)::float  AS total_paid,
       COALESCE(SUM(amount) FILTER (WHERE payment_status = 'Pending'), 0)::float AS total_pending
     FROM expenses
     WHERE vendor_name = ? AND event_id = ?`,
    [vendor.name, eventId],
  );

  // Timeline activities assigned to this vendor
  const timelineCount = await db.get<{ timeline_items: number }>(
    `SELECT COUNT(*)::int AS timeline_items
     FROM timeline_activities
     WHERE vendor_id = ? AND event_id = ?`,
    [vendorId, eventId],
  );

  // Days between first vendor record creation and now (responsiveness proxy)
  const daysActive = Math.floor(
    (Date.now() - new Date(vendor.created_at).getTime()) / (1000 * 60 * 60 * 24),
  );

  const performance = {
    vendor_id: vendor.id,
    vendor_name: vendor.name,
    category: vendor.category,
    status: vendor.status,
    rating: vendor.rating,
    contract_on_file: Boolean(vendor.contract_file),
    quoted_amount: vendor.quoted_amount,
    days_active: daysActive,
    total_communications: commStats?.total_communications ?? 0,
    last_contact_at: commStats?.last_contact_at ?? null,
    total_expenses: expenseStats?.total_expenses ?? 0,
    total_paid: expenseStats?.total_paid ?? 0,
    total_pending: expenseStats?.total_pending ?? 0,
    timeline_items: timelineCount?.timeline_items ?? 0,
    /** Simple score: rating * 20 + (comms > 0 ? 10 : 0) + (contract ? 20 : 0) */
    performance_score: Math.min(
      100,
      (vendor.rating ?? 0) * 20 +
        ((commStats?.total_communications ?? 0) > 0 ? 10 : 0) +
        (vendor.contract_file ? 20 : 0),
    ),
  };

  return res.json({ performance });
}

/**
 * GET /api/events/:eventId/vendors/performance
 * Returns performance summary for all vendors in an event.
 */
export async function listVendorPerformance(req: Request, res: Response): Promise<Response> {
  const authReq = req as AuthRequest;
  if (!authReq.user) return res.status(401).json({ error: 'Authentication required.' });

  const { eventId } = req.params;
  const event = await requireEventAccess(authReq, res, eventId, { allowMembers: true });
  if (!event) return res as Response;

  const db = getDatabase();

  const vendors = await db.all<{
    id: number;
    name: string;
    category: string;
    status: string;
    quoted_amount: number | null;
    rating: number | null;
    contract_file: string | null;
    total_communications: number;
    last_contact_at: string | null;
    timeline_items: number;
  }>(
    `SELECT
       v.id, v.name, v.category, v.status, v.quoted_amount, v.rating, v.contract_file,
       COUNT(DISTINCT vcl.id)::int       AS total_communications,
       MAX(vcl.created_at)               AS last_contact_at,
       COUNT(DISTINCT ta.id)::int        AS timeline_items
     FROM vendors v
     LEFT JOIN vendor_communication_log vcl ON vcl.vendor_id = v.id
     LEFT JOIN timeline_activities ta       ON ta.vendor_id = v.id
     WHERE v.event_id = ?
     GROUP BY v.id
     ORDER BY v.name ASC`,
    [eventId],
  );

  const performance = vendors.map((v) => ({
    ...v,
    contract_on_file: Boolean(v.contract_file),
    performance_score: Math.min(
      100,
      (v.rating ?? 0) * 20 +
        (v.total_communications > 0 ? 10 : 0) +
        (v.contract_file ? 20 : 0),
    ),
  }));

  return res.json({ performance });
}
