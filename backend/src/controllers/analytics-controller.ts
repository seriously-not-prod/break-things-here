/**
 * Analytics Controller
 * BRD 3.10, 3.11
 *
 * Routes (to be wired by integration owner):
 *   GET /api/events/:eventId/analytics         → getEventSummary
 *   GET /api/analytics                         → getGlobalAnalytics
 *   GET /api/events/:eventId/analytics/export  → exportEventReport
 */

import { Request, Response } from 'express';
import { getDatabase } from '../db/database.js';
import { requireEventAccess } from '../utils/event-access.js';

interface AuthRequest extends Request {
  user?: { id: number; email: string; role_id: number };
}

// ── Per-event analytics ───────────────────────────────────────────────────────

/**
 * GET /api/events/:eventId/analytics
 * Returns a single analytics object for the given event.
 */
export async function getEventSummary(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { eventId } = req.params;

    const event = await requireEventAccess(req, res, eventId, { allowMembers: true });
    if (!event) return;

    const db = getDatabase();

    // ── RSVPs ──────────────────────────────────────────────────────────────────
    // Source of truth is `canonical_status` (post-#770 / migration v21). The
    // groupings mirror the legacy `status` mapping so totals match previous
    // dashboard behaviour:
    //   confirmed  ← 'confirmed' + 'checked_in' (arrival doesn't reduce count)
    //   declined   ← 'declined'  + 'cancelled'  (legacy 'Not Going' → both)
    //   pending    ← 'pending'   + 'maybe'      (matches computeAttendanceStats)
    const rsvpStats = await db.get<{
      total_rsvps: string;
      confirmed_rsvps: string;
      declined_rsvps: string;
      pending_rsvps: string;
      checked_in_count: string;
    }>(
      `SELECT
         COUNT(*)                                                                  AS total_rsvps,
         COUNT(*) FILTER (WHERE canonical_status IN ('confirmed', 'checked_in'))  AS confirmed_rsvps,
         COUNT(*) FILTER (WHERE canonical_status IN ('declined', 'cancelled'))    AS declined_rsvps,
         COUNT(*) FILTER (WHERE canonical_status IN ('pending', 'maybe'))         AS pending_rsvps,
         COUNT(*) FILTER (WHERE checked_in = TRUE)                                AS checked_in_count
       FROM rsvps
       WHERE event_id = $1`,
      [eventId],
    );

    const totalRsvps      = Number(rsvpStats?.total_rsvps      ?? 0);
    const confirmedRsvps  = Number(rsvpStats?.confirmed_rsvps  ?? 0);
    const declinedRsvps   = Number(rsvpStats?.declined_rsvps   ?? 0);
    const pendingRsvps    = Number(rsvpStats?.pending_rsvps    ?? 0);
    const checkedInCount  = Number(rsvpStats?.checked_in_count ?? 0);
    const acceptanceRate  = totalRsvps > 0
      ? Math.round((confirmedRsvps / totalRsvps) * 100)
      : 0;

    // ── Budget ─────────────────────────────────────────────────────────────────
    const budgetStats = await db.get<{
      total_allocated: string;
      total_spent: string;
    }>(
      `SELECT
         COALESCE(SUM(bc.allocated_amount), 0)::numeric    AS total_allocated,
         COALESCE(SUM(ex.amount), 0)::numeric              AS total_spent
       FROM budget_categories bc
       LEFT JOIN expenses ex ON ex.category_id = bc.id
       WHERE bc.event_id = $1`,
      [eventId],
    );

    const totalBudgetAllocated = Number(budgetStats?.total_allocated ?? 0);
    const totalBudgetSpent     = Number(budgetStats?.total_spent     ?? 0);
    const budgetUtilizationPct = totalBudgetAllocated > 0
      ? Math.round((totalBudgetSpent / totalBudgetAllocated) * 100)
      : 0;

    // ── Tasks ──────────────────────────────────────────────────────────────────
    const taskRows = await db.all<{ status: string; cnt: string }>(
      `SELECT status, COUNT(*) AS cnt FROM tasks WHERE event_id = $1 GROUP BY status`,
      [eventId],
    );
    const tasksByStatus = { Pending: 0, InProgress: 0, Blocked: 0, Complete: 0 };
    let totalTasks = 0;
    for (const row of taskRows) {
      const cnt = Number(row.cnt);
      totalTasks += cnt;
      if (row.status === 'Pending')     tasksByStatus.Pending    += cnt;
      else if (row.status === 'In Progress') tasksByStatus.InProgress += cnt;
      else if (row.status === 'Blocked')     tasksByStatus.Blocked    += cnt;
      else if (row.status === 'Complete')    tasksByStatus.Complete   += cnt;
    }
    const taskCompletionRate = totalTasks > 0
      ? Math.round((tasksByStatus.Complete / totalTasks) * 100)
      : 0;

    // ── Vendors ─ (no vendors table in current schema) ────────────────────────
    const vendorsByStatus = {
      Contacted:     0,
      QuoteReceived: 0,
      Booked:        0,
      Confirmed:     0,
      Cancelled:     0,
    };

    // ── Dietary restrictions ─ (no dietary column in current schema) ──────────
    const rsvpByDietaryRestriction: Array<{ dietary: string; count: number }> = [];

    // ── Top expense categories (top 5 by spent) ────────────────────────────────
    const topExpenseRows = await db.all<{ category: string; spent: string }>(
      `SELECT bc.name AS category,
              COALESCE(SUM(ex.amount), 0)::numeric AS spent
       FROM budget_categories bc
       LEFT JOIN expenses ex ON ex.category_id = bc.id
       WHERE bc.event_id = $1
       GROUP BY bc.id, bc.name
       ORDER BY spent DESC
       LIMIT 5`,
      [eventId],
    );
    const topExpenseCategories = topExpenseRows.map((r) => ({
      category: String(r.category),
      spent:    Number(r.spent),
    }));

    res.json({
      totalRsvps,
      confirmedRsvps,
      declinedRsvps,
      pendingRsvps,
      checkedInCount,
      acceptanceRate,
      totalBudgetAllocated,
      totalBudgetSpent,
      budgetUtilizationPct,
      tasksByStatus,
      taskCompletionRate,
      vendorsByStatus,
      rsvpByDietaryRestriction,
      topExpenseCategories,
    });
  } catch (error) {
    console.error('Error fetching event analytics:', error);
    res.status(500).json({ error: 'Failed to fetch event analytics' });
  }
}

// ── Global analytics ──────────────────────────────────────────────────────────

/**
 * GET /api/analytics
 * Returns aggregated stats across all events owned by / associated with the
 * authenticated user.
 */
export async function getGlobalAnalytics(req: AuthRequest, res: Response): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const db     = getDatabase();
    const userId = req.user.id;
    const today  = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

    const globalStats = await db.get<{
      total_events: string;
      upcoming_events: string;
      completed_events: string;
      total_guests: string;
    }>(
      `SELECT
         COUNT(DISTINCT e.id)                                          AS total_events,
         COUNT(DISTINCT e.id) FILTER (WHERE e.date >= $1)               AS upcoming_events,
         COUNT(DISTINCT e.id) FILTER (WHERE e.status = 'Completed')    AS completed_events,
         COALESCE(SUM(r.guests) FILTER (WHERE r.canonical_status = 'confirmed'), 0)  AS total_guests
       FROM events e
       LEFT JOIN rsvps r ON r.event_id = e.id
       WHERE e.deleted_at IS NULL
         AND (e.created_by = $2
              OR EXISTS (SELECT 1 FROM event_members em
                         WHERE em.event_id = e.id AND em.user_id = $3))`,
      [today, userId, userId],
    );

    const totalBudgetRow = await db.get<{ total_budget: string }>(
      `SELECT COALESCE(SUM(bc.allocated_amount), 0)::numeric AS total_budget
       FROM budget_categories bc
       JOIN events e ON e.id = bc.event_id
       WHERE e.deleted_at IS NULL
         AND (e.created_by = $1
              OR EXISTS (SELECT 1 FROM event_members em
                         WHERE em.event_id = e.id AND em.user_id = $2))`,
      [userId, userId],
    );

    // Average RSVP acceptance rate across the user's events
    const rsvpRateRow = await db.get<{ avg_rate: string }>(
      `SELECT COALESCE(AVG(rate), 0) AS avg_rate
       FROM (
         SELECT
           CASE WHEN COUNT(*) > 0
                THEN COUNT(*) FILTER (WHERE r.canonical_status = 'confirmed') * 100.0 / COUNT(*)
                ELSE 0
           END AS rate
         FROM rsvps r
         JOIN events e ON r.event_id = e.id
         WHERE e.deleted_at IS NULL
           AND (e.created_by = $1
                OR EXISTS (SELECT 1 FROM event_members em
                           WHERE em.event_id = e.id AND em.user_id = $2))
         GROUP BY r.event_id
       ) sub`,
      [userId, userId],
    );

    res.json({
      totalEvents:        Number(globalStats?.total_events     ?? 0),
      upcomingEvents:     Number(globalStats?.upcoming_events  ?? 0),
      completedEvents:    Number(globalStats?.completed_events ?? 0),
      totalGuestsManaged: Number(globalStats?.total_guests     ?? 0),
      totalBudgetManaged: Number(totalBudgetRow?.total_budget  ?? 0),
      averageRsvpRate:    Math.round(Number(rsvpRateRow?.avg_rate ?? 0)),
    });
  } catch (error) {
    console.error('Error fetching global analytics:', error);
    res.status(500).json({ error: 'Failed to fetch global analytics' });
  }
}

// ── CSV export ────────────────────────────────────────────────────────────────

/**
 * GET /api/events/:eventId/analytics/export?format=csv
 * Returns a downloadable CSV with RSVP list + budget summary.
 * Uses manual CSV string building — no extra library required.
 */
export async function exportEventReport(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { eventId } = req.params;
    const { format } = req.query as { format?: string };

    if (format && format !== 'csv') {
      res.status(400).json({ error: 'Unsupported format. Only csv is supported.' });
      return;
    }

    const accessEvent = await requireEventAccess(req, res, eventId, { allowMembers: true });
    if (!accessEvent) return;

    const db = getDatabase();
    const event = await db.get<{ title: string }>(
      'SELECT title FROM events WHERE id = $1 AND deleted_at IS NULL',
      [eventId],
    );
    if (!event) {
      res.status(404).json({ error: 'Event not found' });
      return;
    }

    // RSVP rows
    const rsvps = await db.all<{
      id:            number;
      name:          string;
      email:         string;
      guests:        number;
      status:        string;
      notes:         string | null;
      source:        string;
      checked_in:    boolean;
      checked_in_at: string | null;
      created_at:    string;
    }>(
      `SELECT id, name, email, guests, canonical_status AS status, notes, source,
              checked_in, checked_in_at, created_at
       FROM rsvps
       WHERE event_id = $1
       ORDER BY created_at ASC`,
      [eventId],
    );

    // Budget summary rows
    const budgetRows = await db.all<{
      category:  string;
      allocated: string;
      spent:     string;
    }>(
      `SELECT bc.name AS category,
              bc.allocated_amount::numeric              AS allocated,
              COALESCE(SUM(ex.amount), 0)::numeric      AS spent
       FROM budget_categories bc
       LEFT JOIN expenses ex ON ex.category_id = bc.id
       WHERE bc.event_id = $1
       GROUP BY bc.id, bc.name, bc.allocated_amount
       ORDER BY bc.name ASC`,
      [eventId],
    );

    function esc(v: unknown): string {
      const s = String(v ?? '');
      return `"${s.replace(/"/g, '""')}"`;
    }

    const lines: string[] = [];

    // Section: RSVPs
    lines.push(esc('RSVP LIST'));
    lines.push(
      ['ID', 'Name', 'Email', 'Guests', 'Status', 'Notes', 'Source',
        'Checked In', 'Checked In At', 'Created At'].map(esc).join(','),
    );
    for (const r of rsvps) {
      lines.push(
        [r.id, r.name, r.email, r.guests, r.status,
          r.notes ?? '', r.source,
          r.checked_in ? 'Yes' : 'No',
          r.checked_in_at ?? '',
          r.created_at,
        ].map(esc).join(','),
      );
    }

    lines.push('');

    // Section: Budget
    lines.push(esc('BUDGET SUMMARY'));
    lines.push(['Category', 'Allocated', 'Spent', 'Utilization %'].map(esc).join(','));
    for (const b of budgetRows) {
      const allocated = Number(b.allocated);
      const spent     = Number(b.spent);
      const util      = allocated > 0 ? Math.round((spent / allocated) * 100) : 0;
      lines.push(
        [b.category, allocated.toFixed(2), spent.toFixed(2), `${util}%`].map(esc).join(','),
      );
    }

    const csv      = lines.join('\r\n');
    const safeTitle = event.title.replace(/[^\w\s-]/g, '').replace(/\s+/g, '-');

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${safeTitle}-report.csv"`);
    res.send(csv);
  } catch (error) {
    console.error('Error exporting event report:', error);
    res.status(500).json({ error: 'Failed to export event report' });
  }
}

// ── Communication tracking metrics (#467) ─────────────────────────────────────

interface CommunicationMetricRow {
  total_sent: number;
  total_failed: number;
  unique_opens: number;
  total_opens: number;
  unique_clicks: number;
  total_clicks: number;
}

interface PerCampaignRow {
  campaign_type: string;
  sent: number;
  opens: number;
  clicks: number;
}

/**
 * GET /api/events/:eventId/analytics/communication
 * Aggregate open/click stats for the event's communication log.
 */
export async function getCommunicationMetrics(
  req: AuthRequest,
  res: Response,
): Promise<void> {
  try {
    const { eventId } = req.params;

    const event = await requireEventAccess(req, res, eventId, { allowMembers: true });
    if (!event) return;

    const db = getDatabase();

    // Count distinct communication_log rows so the LEFT JOIN to
    // communication_tracking_events doesn't multiply `sent`/`failed` when a
    // single send accumulates many opens/clicks.
    const totals = await db.get<CommunicationMetricRow>(
      `SELECT
         COUNT(DISTINCT cl.id)
           AS total_sent,
         COUNT(DISTINCT cl.id) FILTER (WHERE cl.status = 'failed')
           AS total_failed,
         COUNT(DISTINCT te.communication_log_id)
           FILTER (WHERE te.event_type = 'open')                AS unique_opens,
         COUNT(*) FILTER (WHERE te.event_type = 'open')         AS total_opens,
         COUNT(DISTINCT te.communication_log_id)
           FILTER (WHERE te.event_type = 'click')               AS unique_clicks,
         COUNT(*) FILTER (WHERE te.event_type = 'click')        AS total_clicks
       FROM communication_log cl
       LEFT JOIN communication_tracking_events te
         ON te.communication_log_id = cl.id
       WHERE cl.event_id = $1`,
      [eventId],
    );

    const perCampaign = await db.all<PerCampaignRow>(
      `SELECT
         cl.communication_type AS campaign_type,
         COUNT(DISTINCT cl.id) AS sent,
         COUNT(*) FILTER (WHERE te.event_type = 'open')  AS opens,
         COUNT(*) FILTER (WHERE te.event_type = 'click') AS clicks
       FROM communication_log cl
       LEFT JOIN communication_tracking_events te
         ON te.communication_log_id = cl.id
       WHERE cl.event_id = $1
       GROUP BY cl.communication_type
       ORDER BY cl.communication_type`,
      [eventId],
    );

    const sent = Number(totals?.total_sent ?? 0);
    const failed = Number(totals?.total_failed ?? 0);
    const uniqueOpens = Number(totals?.unique_opens ?? 0);
    const totalOpens = Number(totals?.total_opens ?? 0);
    const uniqueClicks = Number(totals?.unique_clicks ?? 0);
    const totalClicks = Number(totals?.total_clicks ?? 0);
    const delivered = Math.max(sent - failed, 0);

    res.json({
      totals: {
        sent,
        failed,
        delivered,
        uniqueOpens,
        totalOpens,
        uniqueClicks,
        totalClicks,
        openRate: delivered > 0 ? uniqueOpens / delivered : 0,
        clickRate: delivered > 0 ? uniqueClicks / delivered : 0,
      },
      byCampaign: perCampaign.map((row) => ({
        campaignType: row.campaign_type,
        sent: Number(row.sent),
        opens: Number(row.opens),
        clicks: Number(row.clicks),
      })),
    });
  } catch (error) {
    console.error('Error fetching communication metrics:', error);
    res.status(500).json({ error: 'Failed to fetch communication metrics' });
  }
}

