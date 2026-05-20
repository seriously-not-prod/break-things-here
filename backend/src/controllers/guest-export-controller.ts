/**
 * Excel + PDF export for the guest list (#543, #583).
 *
 * Excel export uses the SpreadsheetML 2003 XML format. The format is read
 * natively by Excel 2003+, LibreOffice, Numbers, and Google Sheets, and lets
 * us avoid adding a heavy binary-xlsx dependency to the backend. The file is
 * served with the standard Excel mime type and the `.xls` extension.
 *
 * PDF export is delegated to the frontend (uses the existing jsPDF +
 * jspdf-autotable libraries) — this endpoint returns the same structured
 * dataset as JSON so the renderer is shared with on-screen views.
 */
import type { Request, Response } from 'express';
import { getDatabase } from '../db/database.js';
import { requireEventAccess } from '../utils/event-access.js';
import { computeProfileCompleteness } from '../utils/profile-completeness.js';
import { toCanonicalStatus } from '../utils/rsvp-taxonomy.js';

interface AuthRequest extends Request {
  user?: { id: number; email: string; role_id: number };
}

interface GuestExportRow {
  id: number;
  name: string;
  email: string;
  phone: string | null;
  status: string;
  canonical_status: string | null;
  guests: number;
  guest_group: string | null;
  notes: string | null;
  source: string | null;
  checked_in: boolean;
  checked_in_at: string | null;
  late_arrival: boolean | null;
  dietary_restriction: string | null;
  accessibility_needs: string | null;
  meal_choice: string | null;
  plus_one: boolean;
  plus_one_name: string | null;
  company: string | null;
  title: string | null;
  relation_type: string | null;
  age_group: string | null;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  state_region: string | null;
  postal_code: string | null;
  country: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  profile_completeness: number | null;
  unsubscribed_at: string | null;
  created_at: string;
}

const EXPORT_COLUMNS: {
  key: keyof GuestExportRow;
  label: string;
  type: 'String' | 'Number' | 'DateTime';
}[] = [
  { key: 'name', label: 'Name', type: 'String' },
  { key: 'email', label: 'Email', type: 'String' },
  { key: 'phone', label: 'Phone', type: 'String' },
  { key: 'status', label: 'Status', type: 'String' },
  { key: 'canonical_status', label: 'Canonical Status', type: 'String' },
  { key: 'guests', label: 'Guest Count', type: 'Number' },
  { key: 'guest_group', label: 'Guest Group', type: 'String' },
  { key: 'company', label: 'Company', type: 'String' },
  { key: 'title', label: 'Title', type: 'String' },
  { key: 'relation_type', label: 'Relation', type: 'String' },
  { key: 'age_group', label: 'Age Group', type: 'String' },
  { key: 'dietary_restriction', label: 'Dietary', type: 'String' },
  { key: 'meal_choice', label: 'Meal Choice', type: 'String' },
  { key: 'accessibility_needs', label: 'Accessibility', type: 'String' },
  { key: 'address_line1', label: 'Address 1', type: 'String' },
  { key: 'address_line2', label: 'Address 2', type: 'String' },
  { key: 'city', label: 'City', type: 'String' },
  { key: 'state_region', label: 'State/Region', type: 'String' },
  { key: 'postal_code', label: 'Postal Code', type: 'String' },
  { key: 'country', label: 'Country', type: 'String' },
  { key: 'emergency_contact_name', label: 'Emergency Contact', type: 'String' },
  { key: 'emergency_contact_phone', label: 'Emergency Phone', type: 'String' },
  { key: 'plus_one', label: 'Plus One', type: 'String' },
  { key: 'plus_one_name', label: 'Plus One Name', type: 'String' },
  { key: 'checked_in', label: 'Checked In', type: 'String' },
  { key: 'checked_in_at', label: 'Checked In At', type: 'DateTime' },
  { key: 'late_arrival', label: 'Late Arrival', type: 'String' },
  { key: 'profile_completeness', label: 'Profile %', type: 'Number' },
  { key: 'unsubscribed_at', label: 'Unsubscribed', type: 'DateTime' },
  { key: 'created_at', label: 'Submitted At', type: 'DateTime' },
];

async function loadRows(eventId: string): Promise<GuestExportRow[]> {
  const db = getDatabase();
  return db.all<GuestExportRow>(
    `SELECT id, name, email, phone, status, canonical_status, guests, guest_group,
            notes, source, checked_in, checked_in_at, late_arrival,
            dietary_restriction, accessibility_needs, meal_choice,
            plus_one, plus_one_name, company, title, relation_type, age_group,
            address_line1, address_line2, city, state_region, postal_code, country,
            emergency_contact_name, emergency_contact_phone,
            profile_completeness, unsubscribed_at, created_at
     FROM rsvps WHERE event_id = $1 ORDER BY name ASC, created_at DESC`,
    [eventId],
  );
}

function xmlEscape(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function formatExcelCell(value: unknown, type: 'String' | 'Number' | 'DateTime'): string {
  if (value === null || value === undefined || value === '') {
    return `<Cell><Data ss:Type="String"></Data></Cell>`;
  }
  if (type === 'Number') {
    const n = Number(value);
    return `<Cell><Data ss:Type="Number">${Number.isFinite(n) ? n : 0}</Data></Cell>`;
  }
  if (type === 'DateTime') {
    return `<Cell><Data ss:Type="String">${xmlEscape(value)}</Data></Cell>`;
  }
  if (typeof value === 'boolean') {
    return `<Cell><Data ss:Type="String">${value ? 'Yes' : 'No'}</Data></Cell>`;
  }
  return `<Cell><Data ss:Type="String">${xmlEscape(value)}</Data></Cell>`;
}

function buildSpreadsheetMl(eventTitle: string, rows: GuestExportRow[]): string {
  const headerCells = EXPORT_COLUMNS.map(
    (c) => `<Cell><Data ss:Type="String">${xmlEscape(c.label)}</Data></Cell>`,
  ).join('');
  const bodyRows = rows
    .map((row) => {
      const cells = EXPORT_COLUMNS.map((c) => formatExcelCell(row[c.key], c.type)).join('');
      return `<Row>${cells}</Row>`;
    })
    .join('');
  return `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
  <Worksheet ss:Name="${xmlEscape(eventTitle).slice(0, 30) || 'Guests'}">
    <Table>
      <Row>${headerCells}</Row>
      ${bodyRows}
    </Table>
  </Worksheet>
</Workbook>`;
}

/** GET /api/events/:eventId/rsvps/export.xlsx */
export async function exportRsvpsXlsx(req: Request, res: Response): Promise<Response> {
  const authReq = req as AuthRequest;
  const { eventId } = req.params;
  const event = await requireEventAccess(authReq, res, eventId, { ownerOnly: true });
  if (!event) return res as Response;

  const db = getDatabase();
  const ev = await db.get<{ title: string }>('SELECT title FROM events WHERE id = $1', [eventId]);
  const rows = await loadRows(eventId);
  const enriched = rows.map((r) => ({
    ...r,
    canonical_status:
      r.canonical_status ??
      toCanonicalStatus(r.status, { waitlisted: false, checkedIn: r.checked_in }),
    profile_completeness: r.profile_completeness ?? computeProfileCompleteness(r),
  }));
  const body = buildSpreadsheetMl(ev?.title ?? 'Guests', enriched);
  res.setHeader('Content-Type', 'application/vnd.ms-excel; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="event-${eventId}-guests.xls"`);
  return res.send(body);
}

/** GET /api/events/:eventId/rsvps/export.pdf — returns JSON the frontend renders */
export async function exportRsvpsPdfData(req: Request, res: Response): Promise<Response> {
  const authReq = req as AuthRequest;
  const { eventId } = req.params;
  const event = await requireEventAccess(authReq, res, eventId, { ownerOnly: true });
  if (!event) return res as Response;

  const db = getDatabase();
  const ev = await db.get<{ title: string; date: string; location: string | null }>(
    'SELECT title, date, location FROM events WHERE id = $1',
    [eventId],
  );
  const rows = await loadRows(eventId);
  return res.json({
    event: ev,
    columns: EXPORT_COLUMNS.map((c) => ({ key: c.key, label: c.label })),
    rows: rows.map((r) => ({
      ...r,
      canonical_status:
        r.canonical_status ??
        toCanonicalStatus(r.status, { waitlisted: false, checkedIn: r.checked_in }),
      profile_completeness: r.profile_completeness ?? computeProfileCompleteness(r),
    })),
  });
}
