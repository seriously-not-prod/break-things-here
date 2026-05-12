/**
 * Reports — scheduled delivery + on-demand snapshot (#562, #622)
 *
 * The controller exposes:
 *   - CRUD on scheduled_reports
 *   - GET /reports/run/:id to render a report payload synchronously
 *   - POST /reports/run/:id to record a delivery attempt
 *
 * Email delivery is intentionally pluggable: the controller produces the JSON
 * payload and a deliveries row, and a downstream worker dispatches via the
 * existing nodemailer transport.
 */

import { Request, Response } from 'express';
import { getDatabase } from '../db/database.js';
import { requireEventAccess } from '../utils/event-access.js';

interface AuthRequest extends Request {
  user?: { id: number; email: string; role_id: number };
}

const REPORT_TYPES = [
  'rsvp_summary',
  'budget_summary',
  'task_summary',
  'storage_summary',
  'full',
] as const;
type ReportType = (typeof REPORT_TYPES)[number];

const FREQUENCIES = ['daily', 'weekly', 'monthly'] as const;
type Frequency = (typeof FREQUENCIES)[number];

function nextRunDate(frequency: Frequency, now: Date = new Date()): Date {
  const d = new Date(now);
  if (frequency === 'daily') d.setUTCDate(d.getUTCDate() + 1);
  else if (frequency === 'weekly') d.setUTCDate(d.getUTCDate() + 7);
  else d.setUTCMonth(d.getUTCMonth() + 1);
  // Roll back to 06:00 UTC for predictable scheduling.
  d.setUTCHours(6, 0, 0, 0);
  return d;
}

// Length-bounded, single-pass parser to avoid the polynomial regex CodeQL
// flagged for the older `/^[^\s@]+@[^\s@]+\.[^\s@]+$/` pattern.
function isValidEmail(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  if (value.length === 0 || value.length > 254) return false;
  const at = value.indexOf('@');
  if (at <= 0 || at !== value.lastIndexOf('@')) return false;
  const local = value.slice(0, at);
  const domain = value.slice(at + 1);
  if (local.length === 0 || domain.length === 0) return false;
  // Whitespace not allowed in either segment.
  if (/[\s]/.test(local) || /[\s]/.test(domain)) return false;
  // Domain must contain at least one dot, and neither side of the dot empty.
  const dot = domain.lastIndexOf('.');
  if (dot <= 0 || dot >= domain.length - 1) return false;
  return true;
}

export async function listReports(req: Request, res: Response): Promise<Response> {
  const authReq = req as AuthRequest;
  const { eventId } = req.params;
  const event = await requireEventAccess(authReq, res, eventId, { allowMembers: true });
  if (!event) return res as Response;

  const db = getDatabase();
  const rows = await db.all(
    `SELECT id, event_id, report_type, frequency, recipients, filters,
            next_run_at, last_run_at, is_active, created_by, created_at, updated_at
       FROM scheduled_reports WHERE event_id = ? ORDER BY created_at DESC`,
    [eventId],
  );
  return res.json({ reports: rows });
}

export async function createReport(req: Request, res: Response): Promise<Response> {
  const authReq = req as AuthRequest;
  const { eventId } = req.params;
  const event = await requireEventAccess(authReq, res, eventId, { allowMembers: true });
  if (!event) return res as Response;

  const { reportType, frequency, recipients, filters } = (req.body ?? {}) as Record<
    string,
    unknown
  >;
  if (typeof reportType !== 'string' || !(REPORT_TYPES as readonly string[]).includes(reportType)) {
    return res.status(400).json({ error: `reportType must be one of: ${REPORT_TYPES.join(', ')}` });
  }
  if (typeof frequency !== 'string' || !(FREQUENCIES as readonly string[]).includes(frequency)) {
    return res.status(400).json({ error: `frequency must be one of: ${FREQUENCIES.join(', ')}` });
  }
  if (!Array.isArray(recipients) || recipients.length === 0) {
    return res.status(400).json({ error: 'recipients must be a non-empty array of emails.' });
  }
  const validRecipients = (recipients as unknown[]).filter(isValidEmail);
  if (validRecipients.length !== recipients.length) {
    return res.status(400).json({ error: 'One or more recipients are not valid emails.' });
  }

  const db = getDatabase();
  const nextRun = nextRunDate(frequency as Frequency).toISOString();

  const result = await db.run(
    `INSERT INTO scheduled_reports
       (event_id, report_type, frequency, recipients, filters, next_run_at, created_by, updated_by)
     VALUES (?, ?, ?, ?::jsonb, ?::jsonb, ?, ?, ?)
     RETURNING id`,
    [
      eventId,
      reportType,
      frequency,
      JSON.stringify(validRecipients),
      filters ? JSON.stringify(filters) : null,
      nextRun,
      authReq.user?.id ?? null,
      authReq.user?.id ?? null,
    ],
  );

  const created = await db.get(
    `SELECT id, event_id, report_type, frequency, recipients, filters,
            next_run_at, last_run_at, is_active, created_at
       FROM scheduled_reports WHERE id = ?`,
    [result.lastID],
  );
  return res.status(201).json(created);
}

export async function updateReport(req: Request, res: Response): Promise<Response> {
  const authReq = req as AuthRequest;
  const { eventId, reportId } = req.params;
  const event = await requireEventAccess(authReq, res, eventId, { allowMembers: true });
  if (!event) return res as Response;

  const db = getDatabase();
  const existing = await db.get<{
    id: number;
    recipients: unknown;
    filters: unknown;
    frequency: Frequency;
    is_active: boolean;
  }>(
    `SELECT id, recipients, filters, frequency, is_active
       FROM scheduled_reports WHERE id = ? AND event_id = ?`,
    [reportId, eventId],
  );
  if (!existing) return res.status(404).json({ error: 'Report not found.' });

  const { frequency, recipients, filters, isActive } = (req.body ?? {}) as Record<
    string,
    unknown
  >;

  let nextFrequency: Frequency = existing.frequency;
  if (frequency !== undefined) {
    if (typeof frequency !== 'string' || !(FREQUENCIES as readonly string[]).includes(frequency)) {
      return res.status(400).json({ error: 'Invalid frequency.' });
    }
    nextFrequency = frequency as Frequency;
  }

  let nextRecipients: string[] | null = null;
  if (recipients !== undefined) {
    if (!Array.isArray(recipients) || recipients.length === 0) {
      return res
        .status(400)
        .json({ error: 'recipients must be a non-empty array of emails.' });
    }
    const valid = (recipients as unknown[]).filter(isValidEmail);
    if (valid.length !== recipients.length) {
      return res
        .status(400)
        .json({ error: 'One or more recipients are not valid emails.' });
    }
    nextRecipients = valid;
  }

  const nextIsActive = isActive === undefined ? existing.is_active : Boolean(isActive);

  await db.run(
    `UPDATE scheduled_reports
        SET frequency = ?, recipients = ?::jsonb, filters = ?::jsonb,
            is_active = ?, next_run_at = ?, updated_by = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND event_id = ?`,
    [
      nextFrequency,
      nextRecipients ? JSON.stringify(nextRecipients) : JSON.stringify(existing.recipients ?? []),
      filters !== undefined ? JSON.stringify(filters) : (existing.filters ? JSON.stringify(existing.filters) : null),
      nextIsActive,
      nextIsActive ? nextRunDate(nextFrequency).toISOString() : null,
      authReq.user?.id ?? null,
      reportId,
      eventId,
    ],
  );

  const updated = await db.get(
    `SELECT id, event_id, report_type, frequency, recipients, filters,
            next_run_at, last_run_at, is_active, updated_at
       FROM scheduled_reports WHERE id = ?`,
    [reportId],
  );
  return res.json(updated);
}

export async function deleteReport(req: Request, res: Response): Promise<Response> {
  const authReq = req as AuthRequest;
  const { eventId, reportId } = req.params;
  const event = await requireEventAccess(authReq, res, eventId, { allowMembers: true });
  if (!event) return res as Response;

  const db = getDatabase();
  const existing = await db.get<{ id: number }>(
    'SELECT id FROM scheduled_reports WHERE id = ? AND event_id = ?',
    [reportId, eventId],
  );
  if (!existing) return res.status(404).json({ error: 'Report not found.' });
  await db.run('DELETE FROM scheduled_reports WHERE id = ?', [reportId]);
  return res.json({ message: 'Report deleted.' });
}

/**
 * Render a fresh report payload synchronously. Useful for the "Run now"
 * button on the UI and as the body of the email worker.
 */
export async function renderReport(req: Request, res: Response): Promise<Response> {
  const authReq = req as AuthRequest;
  const { eventId, reportId } = req.params;
  const event = await requireEventAccess(authReq, res, eventId, { allowMembers: true });
  if (!event) return res as Response;

  const db = getDatabase();
  const report = await db.get<{
    id: number;
    report_type: ReportType;
    filters: unknown;
  }>(
    'SELECT id, report_type, filters FROM scheduled_reports WHERE id = ? AND event_id = ?',
    [reportId, eventId],
  );
  if (!report) return res.status(404).json({ error: 'Report not found.' });

  const payload = await renderPayload(eventId, report.report_type);
  return res.json({ reportId: report.id, type: report.report_type, generatedAt: new Date().toISOString(), payload });
}

/**
 * Record a delivery attempt. The actual SMTP send happens in a worker; the
 * controller persists the delivery row so we have an audit trail.
 */
export async function recordDelivery(req: Request, res: Response): Promise<Response> {
  const authReq = req as AuthRequest;
  const { eventId, reportId } = req.params;
  const event = await requireEventAccess(authReq, res, eventId, { allowMembers: true });
  if (!event) return res as Response;

  const { status, errorMessage, recipients } = (req.body ?? {}) as {
    status?: unknown;
    errorMessage?: unknown;
    recipients?: unknown;
  };
  if (status !== 'success' && status !== 'failed' && status !== 'partial') {
    return res.status(400).json({ error: 'status must be success|failed|partial.' });
  }
  const safeError = typeof errorMessage === 'string' ? errorMessage.substring(0, 1000) : null;
  const recipientList = Array.isArray(recipients) ? (recipients as unknown[]).filter(isValidEmail) : [];

  const db = getDatabase();
  const report = await db.get<{ id: number; frequency: Frequency; is_active: boolean }>(
    'SELECT id, frequency, is_active FROM scheduled_reports WHERE id = ? AND event_id = ?',
    [reportId, eventId],
  );
  if (!report) return res.status(404).json({ error: 'Report not found.' });

  await db.run(
    `INSERT INTO scheduled_report_deliveries (report_id, recipients, status, error_message)
     VALUES (?, ?::jsonb, ?, ?)`,
    [reportId, JSON.stringify(recipientList), status, safeError],
  );

  if (report.is_active) {
    await db.run(
      `UPDATE scheduled_reports
          SET last_run_at = CURRENT_TIMESTAMP,
              next_run_at = ?,
              updated_at = CURRENT_TIMESTAMP
        WHERE id = ?`,
      [nextRunDate(report.frequency).toISOString(), reportId],
    );
  }

  return res.json({ delivered: true, status });
}

async function renderPayload(eventId: string, type: ReportType): Promise<Record<string, unknown>> {
  const db = getDatabase();
  switch (type) {
    case 'rsvp_summary': {
      const counts = await db.get(
        `SELECT
            COUNT(*) FILTER (WHERE status = 'Going')::int      AS going,
            COUNT(*) FILTER (WHERE status = 'Maybe')::int      AS maybe,
            COUNT(*) FILTER (WHERE status = 'Pending')::int    AS pending,
            COUNT(*) FILTER (WHERE status = 'Declined')::int   AS declined,
            COUNT(*) FILTER (WHERE checked_in = TRUE)::int     AS checked_in,
            COUNT(*)::int                                      AS total
           FROM rsvps WHERE event_id = ?`,
        [eventId],
      );
      return { type, counts };
    }
    case 'budget_summary': {
      const totals = await db.get(
        `SELECT
            COALESCE(SUM(allocated_amount), 0)::numeric AS allocated,
            (SELECT COALESCE(SUM(amount), 0) FROM expenses WHERE event_id = ?)::numeric AS spent,
            COUNT(*)::int AS categories
           FROM budget_categories WHERE event_id = ?`,
        [eventId, eventId],
      );
      return { type, totals };
    }
    case 'task_summary': {
      const counts = await db.get(
        `SELECT
            COUNT(*) FILTER (WHERE status = 'Complete' OR status = 'Completed')::int AS complete,
            COUNT(*) FILTER (WHERE status = 'In Progress')::int AS in_progress,
            COUNT(*) FILTER (WHERE status = 'Blocked')::int AS blocked,
            COUNT(*) FILTER (WHERE status = 'Pending')::int AS pending,
            COUNT(*)::int AS total
           FROM tasks WHERE event_id = ?`,
        [eventId],
      );
      return { type, counts };
    }
    case 'storage_summary': {
      const storage = await db.get(
        `SELECT
            e.storage_quota_bytes AS quota,
            e.storage_used_bytes  AS used,
            (SELECT COUNT(*) FROM event_documents WHERE event_id = e.id)::int AS document_count,
            (SELECT COUNT(*) FROM event_documents WHERE event_id = e.id AND mime_type LIKE 'image/%')::int AS image_count
           FROM events e WHERE e.id = ?`,
        [eventId],
      );
      return { type, storage };
    }
    case 'full':
    default: {
      const [rsvp, budget, task, storage] = await Promise.all([
        renderPayload(eventId, 'rsvp_summary'),
        renderPayload(eventId, 'budget_summary'),
        renderPayload(eventId, 'task_summary'),
        renderPayload(eventId, 'storage_summary'),
      ]);
      return { type: 'full', sections: { rsvp, budget, task, storage } };
    }
  }
}

/**
 * Worker-facing endpoint: list reports that are due to fire. Lives at
 * /api/admin/reports/due so the cron worker can poll.
 */
export async function listDueReports(req: Request, res: Response): Promise<Response> {
  const authReq = req as AuthRequest;
  if (authReq.user?.role_id !== 3) {
    return res.status(403).json({ error: 'Admin role required.' });
  }

  const db = getDatabase();
  const rows = await db.all(
    `SELECT id, event_id, report_type, frequency, recipients, filters, next_run_at, last_run_at
       FROM scheduled_reports
      WHERE is_active = TRUE AND next_run_at <= CURRENT_TIMESTAMP
      ORDER BY next_run_at ASC LIMIT 100`,
  );
  return res.json({ due: rows });
}
