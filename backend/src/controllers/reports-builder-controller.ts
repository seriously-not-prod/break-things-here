/**
 * Report Builder Controller (#812)
 *
 * Exposes:
 *   POST /api/events/:eventId/reports/builder/run  — run a report now (CSV / XLSX / JSON)
 *   POST /api/events/:eventId/reports/builder/save — persist config to scheduled_reports
 *   GET  /api/reports/builder/domains              — list available domains + fields
 */
import type { Request, Response } from 'express';
import ExcelJS from 'exceljs';
import { getDatabase } from '../db/database.js';
import { requireEventAccess } from '../utils/event-access.js';
import {
  buildReport,
  getDomainFieldMeta,
  getAllDomains,
  type ReportDomain,
  type BuildReportConfig,
} from '../services/reports/build-report.js';

interface AuthRequest extends Request {
  user?: { id: number; email: string; role_id: number };
}

const VALID_DOMAINS = new Set<ReportDomain>(getAllDomains());
const VALID_FREQUENCIES = new Set(['daily', 'weekly', 'monthly', 'one_off']);
const VALID_FORMATS = new Set(['json', 'csv', 'xlsx']);

// ---------------------------------------------------------------------------
// GET /api/reports/builder/domains
// ---------------------------------------------------------------------------

/**
 * Return all domain metadata (field lists) for the builder UI.
 * No event context required — this is a static schema endpoint.
 */
export function getDomains(req: Request, res: Response): Response {
  const authReq = req as AuthRequest;
  if (!authReq.user) return res.status(401).json({ error: 'Unauthorized.' });

  const domains = getAllDomains().map((domain) => ({
    domain,
    fields: getDomainFieldMeta(domain),
  }));
  return res.json({ domains });
}

// ---------------------------------------------------------------------------
// POST /api/events/:eventId/reports/builder/run
// ---------------------------------------------------------------------------

/**
 * Run a custom report immediately and return results as JSON, CSV, or XLSX.
 *
 * Body:
 *   { domain, fields, filters, groupBy, sort, format }
 *   format: 'json' | 'csv' | 'xlsx'  (defaults to 'json')
 */
export async function runReport(req: Request, res: Response): Promise<void> {
  const authReq = req as AuthRequest;
  const { eventId } = req.params;

  const event = await requireEventAccess(authReq, res, eventId, { allowMembers: true });
  if (!event) return;

  const body = (req.body ?? {}) as Record<string, unknown>;
  const domain = body.domain as string;
  const format = typeof body.format === 'string' ? body.format.toLowerCase() : 'json';

  if (!domain || !VALID_DOMAINS.has(domain as ReportDomain)) {
    res.status(400).json({ error: `domain must be one of: ${[...VALID_DOMAINS].join(', ')}` });
    return;
  }
  if (!VALID_FORMATS.has(format)) {
    res.status(400).json({ error: `format must be one of: json, csv, xlsx` });
    return;
  }

  const config: BuildReportConfig = {
    domain: domain as ReportDomain,
    eventId: Number(eventId),
    fields: Array.isArray(body.fields) ? (body.fields as string[]) : [],
    filters: Array.isArray(body.filters) ? (body.filters as BuildReportConfig['filters']) : [],
    groupBy: typeof body.groupBy === 'string' ? body.groupBy : undefined,
    sort: isSort(body.sort) ? body.sort : undefined,
  };

  const result = await buildReport(config);

  switch (format) {
    case 'csv':
      sendCsv(res, result.columns, result.rows, `report-${domain}`);
      break;
    case 'xlsx':
      await sendXlsx(res, result.columns, result.rows, `report-${domain}`);
      break;
    default:
      res.json(result);
  }
}

// ---------------------------------------------------------------------------
// POST /api/events/:eventId/reports/builder/save
// ---------------------------------------------------------------------------

/**
 * Persist a custom builder configuration to scheduled_reports.
 *
 * Body:
 *   { name, domain, fields, filters, groupBy, sort, frequency, recipients }
 *   frequency: 'one_off' | 'daily' | 'weekly' | 'monthly'
 *   recipients: string[] (emails) — optional for one_off
 */
export async function saveReport(req: Request, res: Response): Promise<Response> {
  const authReq = req as AuthRequest;
  const { eventId } = req.params;

  const event = await requireEventAccess(authReq, res, eventId, { allowMembers: true });
  if (!event) return res as Response;

  // Parse and validate eventId (req.params values are strings)
  const parsedEventId = parseInt(eventId, 10);
  if (isNaN(parsedEventId) || parsedEventId <= 0) {
    return res.status(400).json({ error: 'Invalid eventId.' });
  }

  const body = (req.body ?? {}) as Record<string, unknown>;
  const { name, domain, frequency, recipients } = body;

  if (typeof name !== 'string' || name.trim().length === 0) {
    return res.status(400).json({ error: 'name is required.' });
  }
  if (!domain || !VALID_DOMAINS.has(domain as ReportDomain)) {
    return res
      .status(400)
      .json({ error: `domain must be one of: ${[...VALID_DOMAINS].join(', ')}` });
  }
  if (!frequency || !VALID_FREQUENCIES.has(frequency as string)) {
    return res
      .status(400)
      .json({ error: `frequency must be one of: ${[...VALID_FREQUENCIES].join(', ')}` });
  }

  // Validate recipient emails — use string operations to avoid ReDoS-prone regex
  const isValidEmail = (e: unknown): e is string => {
    if (typeof e !== 'string') return false;
    const at = e.indexOf('@');
    if (at <= 0 || at !== e.lastIndexOf('@')) return false; // no '@', or multiple '@'
    const dot = e.lastIndexOf('.');
    return dot > at + 1 && dot < e.length - 1; // at least one dot after '@'
  };
  if (Array.isArray(recipients) && recipients.length > 0) {
    const invalid = recipients.filter((r) => !isValidEmail(r));
    if (invalid.length > 0) {
      return res
        .status(400)
        .json({ error: `Invalid email(s): ${(invalid as string[]).join(', ')}` });
    }
  }

  // For scheduled frequencies, recipients are required
  if (frequency !== 'one_off' && (!Array.isArray(recipients) || recipients.length === 0)) {
    return res.status(400).json({ error: 'recipients is required for scheduled reports.' });
  }

  const builderConfig = {
    name: (name as string).trim(),
    domain,
    fields: Array.isArray(body.fields) ? body.fields : [],
    filters: Array.isArray(body.filters) ? body.filters : [],
    groupBy: typeof body.groupBy === 'string' ? body.groupBy : null,
    sort: isSort(body.sort) ? body.sort : null,
  };

  const db = getDatabase();
  const result = await db.run(
    `INSERT INTO scheduled_reports
       (event_id, report_type, frequency, recipients, filters, builder_config, next_run_at, created_by, updated_by)
     VALUES ($1, 'custom_builder', $2, $3::jsonb, $4::jsonb, $5::jsonb, $6, $7, $8)
     RETURNING id`,
    [
      parsedEventId,
      frequency,
      JSON.stringify(Array.isArray(recipients) ? recipients : []),
      JSON.stringify(builderConfig.filters),
      JSON.stringify(builderConfig),
      frequency === 'one_off' ? null : nextRunDate(frequency as string),
      authReq.user?.id ?? null,
      authReq.user?.id ?? null,
    ],
  );

  const created = await db.get(
    `SELECT id, event_id, report_type, frequency, recipients, filters, builder_config,
            next_run_at, is_active, created_at
       FROM scheduled_reports WHERE id = $1`,
    [result.lastID],
  );

  return res.status(201).json(created);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function nextRunDate(frequency: string): string {
  const d = new Date();
  if (frequency === 'daily') d.setUTCDate(d.getUTCDate() + 1);
  else if (frequency === 'weekly') d.setUTCDate(d.getUTCDate() + 7);
  else d.setUTCMonth(d.getUTCMonth() + 1);
  d.setUTCHours(6, 0, 0, 0);
  return d.toISOString();
}

function isSort(val: unknown): val is { field: string; direction: 'asc' | 'desc' } {
  if (!val || typeof val !== 'object') return false;
  const v = val as Record<string, unknown>;
  return typeof v.field === 'string' && (v.direction === 'asc' || v.direction === 'desc');
}

/**
 * Neutralize spreadsheet formula injection: prefix cells that start with
 * a formula-trigger character ('=', '+', '-', '@', TAB, CR) with a single
 * quote so spreadsheet applications treat the value as literal text.
 */
function sanitizeForSpreadsheet(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
}

function sendCsv(
  res: Response,
  columns: string[],
  rows: Record<string, unknown>[],
  filename: string,
): void {
  const escape = (v: unknown): string => {
    const safe = sanitizeForSpreadsheet(v);
    const s = safe == null ? '' : String(safe);
    // Wrap in double quotes if value contains comma, newline, or double quote
    if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };

  const lines: string[] = [columns.map(escape).join(',')];
  for (const row of rows) {
    lines.push(Object.values(row).map(escape).join(','));
  }

  const csv = lines.join('\r\n');
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}.csv"`);
  res.send(csv);
}

async function sendXlsx(
  res: Response,
  columns: string[],
  rows: Record<string, unknown>[],
  filename: string,
): Promise<void> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Report');

  // Header row
  sheet.addRow(columns);
  sheet.getRow(1).font = { bold: true };

  // Data rows — sanitize string values to prevent formula injection
  for (const row of rows) {
    sheet.addRow(Object.values(row).map(sanitizeForSpreadsheet));
  }

  // Auto-fit columns
  sheet.columns.forEach((col) => {
    let maxLen = 10;
    col.eachCell?.({ includeEmpty: true }, (cell) => {
      const len = cell.value ? String(cell.value).length : 0;
      if (len > maxLen) maxLen = len;
    });
    col.width = Math.min(maxLen + 2, 50);
  });

  res.setHeader(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  );
  res.setHeader('Content-Disposition', `attachment; filename="${filename}.xlsx"`);
  await workbook.xlsx.write(res as unknown as import('stream').Writable);
  res.end();
}
