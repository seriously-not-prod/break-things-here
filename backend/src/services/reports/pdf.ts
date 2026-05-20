/**
 * PDF Report Renderer (#813)
 *
 * Server-side PDF generation for:
 *   - Guest list
 *   - Budget summary
 *   - Expense detail
 *
 * Uses PDFKit for lightweight, dependency-free PDF creation.
 * Each report includes:
 *   - Event header with name and date
 *   - Footer with page numbers
 *   - Generated-at timestamp
 *   - Tabular data section(s)
 */
import PDFDocument from 'pdfkit';
import { getDatabase } from '../../db/database.js';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type PdfReportType = 'guest_list' | 'budget_summary' | 'expense_detail';

export interface PdfReportOptions {
  /** Event ID to scope the report */
  eventId: number;
  /** Report type determines which data and layout to render */
  reportType: PdfReportType;
}

export interface PdfReportMeta {
  reportType: PdfReportType;
  eventName: string;
  generatedAt: string;
  pageCount: number;
  byteLength: number;
}

interface EventInfo {
  id: number;
  name: string;
  event_date: string | null;
  location: string | null;
}

interface GuestRow {
  guest_name: string;
  email: string;
  status: string;
  dietary_requirements: string | null;
  checked_in: boolean;
}

interface BudgetRow {
  category: string;
  allocated: number;
  spent: number;
  remaining: number;
}

interface ExpenseRow {
  category: string;
  description: string;
  amount: number;
  date: string;
  vendor: string | null;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const VALID_REPORT_TYPES = new Set<PdfReportType>([
  'guest_list',
  'budget_summary',
  'expense_detail',
]);

const PAGE_MARGIN = 50;
const HEADER_HEIGHT = 80;
const FOOTER_HEIGHT = 40;
const ROW_HEIGHT = 18;
const TABLE_TOP_PADDING = 20;

/** A4 dimensions in PostScript points */
const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const CONTENT_WIDTH = PAGE_WIDTH - 2 * PAGE_MARGIN;

const FONT_SIZE_TITLE = 18;
const FONT_SIZE_SUBTITLE = 11;
const FONT_SIZE_TABLE_HEADER = 9;
const FONT_SIZE_TABLE_BODY = 8;
const FONT_SIZE_FOOTER = 8;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Generate a PDF report and return it as a Buffer along with metadata.
 *
 * @param options - Report configuration (eventId, reportType)
 * @returns Buffer containing the PDF and metadata about it
 * @throws Error if eventId is invalid or report type is unsupported
 */
export async function generatePdfReport(
  options: PdfReportOptions,
): Promise<{ buffer: Buffer; meta: PdfReportMeta }> {
  const { eventId, reportType } = options;

  if (!VALID_REPORT_TYPES.has(reportType)) {
    throw new Error(`Unsupported report type: ${reportType}`);
  }

  const db = getDatabase();

  // Fetch event info
  const event = await db.get<EventInfo>(
    'SELECT id, name, event_date, location FROM events WHERE id = $1',
    [eventId],
  );
  if (!event) {
    throw new Error(`Event not found: ${eventId}`);
  }

  const generatedAt = new Date().toISOString();

  // Fetch domain-specific data
  let tableData: TableData;
  switch (reportType) {
    case 'guest_list':
      tableData = await fetchGuestListData(event);
      break;
    case 'budget_summary':
      tableData = await fetchBudgetSummaryData(event);
      break;
    case 'expense_detail':
      tableData = await fetchExpenseDetailData(event);
      break;
  }

  // Build the PDF document
  const { buffer, pageCount } = await buildPdf(event, reportType, tableData, generatedAt);

  return {
    buffer,
    meta: {
      reportType,
      eventName: event.name,
      generatedAt,
      pageCount,
      byteLength: buffer.length,
    },
  };
}

/**
 * Returns true if the given string is a valid PDF report type.
 */
export function isValidPdfReportType(value: string): value is PdfReportType {
  return VALID_REPORT_TYPES.has(value as PdfReportType);
}

// ---------------------------------------------------------------------------
// Data fetchers
// ---------------------------------------------------------------------------

interface TableColumn {
  header: string;
  width: number;
}

interface TableData {
  title: string;
  subtitle: string;
  columns: TableColumn[];
  rows: string[][];
}

async function fetchGuestListData(event: EventInfo): Promise<TableData> {
  const db = getDatabase();
  const guests = await db.all<GuestRow>(
    `SELECT guest_name, email, status, dietary_requirements, checked_in
     FROM rsvps
     WHERE event_id = $1
     ORDER BY guest_name ASC`,
    [event.id],
  );

  const columns: TableColumn[] = [
    { header: 'Guest Name', width: 140 },
    { header: 'Email', width: 150 },
    { header: 'RSVP Status', width: 80 },
    { header: 'Dietary', width: 100 },
    { header: 'Checked In', width: 60 },
  ];

  const rows = guests.map((g) => [
    truncate(g.guest_name, 30),
    truncate(g.email, 32),
    g.status ?? '',
    truncate(g.dietary_requirements ?? '—', 20),
    g.checked_in ? 'Yes' : 'No',
  ]);

  return {
    title: 'Guest List Report',
    subtitle: `Total guests: ${guests.length}`,
    columns,
    rows,
  };
}

async function fetchBudgetSummaryData(event: EventInfo): Promise<TableData> {
  const db = getDatabase();
  const budget = await db.all<BudgetRow>(
    `SELECT
       bc.name AS category,
       bc.allocated_amount::numeric AS allocated,
       COALESCE(SUM(ex.amount), 0)::numeric AS spent,
       (bc.allocated_amount - COALESCE(SUM(ex.amount), 0))::numeric AS remaining
     FROM budget_categories bc
     LEFT JOIN expenses ex ON ex.budget_category_id = bc.id AND ex.event_id = bc.event_id
     WHERE bc.event_id = $1
     GROUP BY bc.id, bc.name, bc.allocated_amount
     ORDER BY bc.name ASC`,
    [event.id],
  );

  const totalAllocated = budget.reduce((s, r) => s + Number(r.allocated), 0);
  const totalSpent = budget.reduce((s, r) => s + Number(r.spent), 0);

  const columns: TableColumn[] = [
    { header: 'Category', width: 160 },
    { header: 'Allocated ($)', width: 100 },
    { header: 'Spent ($)', width: 100 },
    { header: 'Remaining ($)', width: 100 },
  ];

  const rows = budget.map((b) => [
    truncate(b.category, 30),
    formatCurrency(b.allocated),
    formatCurrency(b.spent),
    formatCurrency(b.remaining),
  ]);

  // Totals row
  rows.push([
    'TOTAL',
    formatCurrency(totalAllocated),
    formatCurrency(totalSpent),
    formatCurrency(totalAllocated - totalSpent),
  ]);

  return {
    title: 'Budget Summary Report',
    subtitle: `Total allocated: $${totalAllocated.toLocaleString()} | Spent: $${totalSpent.toLocaleString()}`,
    columns,
    rows,
  };
}

async function fetchExpenseDetailData(event: EventInfo): Promise<TableData> {
  const db = getDatabase();
  const expenses = await db.all<ExpenseRow>(
    `SELECT
       bc.name AS category,
       ex.description,
       ex.amount::numeric AS amount,
       ex.expense_date AS date,
       v.name AS vendor
     FROM expenses ex
     JOIN budget_categories bc ON bc.id = ex.budget_category_id
     LEFT JOIN vendors v ON v.id = ex.vendor_id
     WHERE ex.event_id = $1
     ORDER BY ex.expense_date DESC, ex.id DESC`,
    [event.id],
  );

  const totalExpenses = expenses.reduce((s, r) => s + Number(r.amount), 0);

  const columns: TableColumn[] = [
    { header: 'Category', width: 110 },
    { header: 'Description', width: 150 },
    { header: 'Amount ($)', width: 80 },
    { header: 'Date', width: 80 },
    { header: 'Vendor', width: 100 },
  ];

  const rows = expenses.map((e) => [
    truncate(e.category, 22),
    truncate(e.description, 30),
    formatCurrency(e.amount),
    e.date ? formatDate(e.date) : '—',
    truncate(e.vendor ?? '—', 20),
  ]);

  return {
    title: 'Expense Detail Report',
    subtitle: `Total: $${totalExpenses.toLocaleString()} | ${expenses.length} transactions`,
    columns,
    rows,
  };
}

// ---------------------------------------------------------------------------
// PDF builder
// ---------------------------------------------------------------------------

function buildPdf(
  event: EventInfo,
  reportType: PdfReportType,
  tableData: TableData,
  generatedAt: string,
): Promise<{ buffer: Buffer; pageCount: number }> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];

    const doc = new PDFDocument({
      size: 'A4',
      margins: { top: PAGE_MARGIN, bottom: PAGE_MARGIN, left: PAGE_MARGIN, right: PAGE_MARGIN },
      bufferPages: true,
      info: {
        Title: `${tableData.title} — ${event.name}`,
        Author: 'Festival Event Planner',
        Subject: reportType,
        CreationDate: new Date(generatedAt),
      },
    });

    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('error', reject);
    doc.on('end', () => {
      const buffer = Buffer.concat(chunks);
      const pageCount = doc.bufferedPageRange().count;
      resolve({ buffer, pageCount });
    });

    // --- Render header on first page ---
    renderHeader(doc, event, tableData.title, tableData.subtitle, generatedAt);

    // --- Render table content ---
    const tableStartY = PAGE_MARGIN + HEADER_HEIGHT + TABLE_TOP_PADDING;
    renderTable(doc, tableData.columns, tableData.rows, tableStartY);

    // --- Render footers on all buffered pages ---
    const { start, count } = doc.bufferedPageRange();
    for (let i = start; i < start + count; i++) {
      doc.switchToPage(i);
      renderFooter(doc, i + 1, count);
    }

    doc.end();
  });
}

// ---------------------------------------------------------------------------
// Render primitives
// ---------------------------------------------------------------------------

function renderHeader(
  doc: PDFKit.PDFDocument,
  event: EventInfo,
  title: string,
  subtitle: string,
  generatedAt: string,
): void {
  doc.fontSize(FONT_SIZE_TITLE).font('Helvetica-Bold').fillColor('#1a1a1a');
  doc.text(title, PAGE_MARGIN, PAGE_MARGIN);

  doc.fontSize(FONT_SIZE_SUBTITLE).font('Helvetica').fillColor('#444444');
  doc.text(`Event: ${event.name}`, PAGE_MARGIN, PAGE_MARGIN + 26);

  const eventDate = event.event_date ? formatDate(event.event_date) : 'TBD';
  const location = event.location ?? 'TBD';
  doc.text(`Date: ${eventDate} | Location: ${location}`, PAGE_MARGIN, PAGE_MARGIN + 40);
  doc.text(subtitle, PAGE_MARGIN, PAGE_MARGIN + 54);

  // Generated-at timestamp (right-aligned)
  doc
    .fontSize(FONT_SIZE_FOOTER)
    .fillColor('#888888')
    .text(`Generated: ${formatDateTime(generatedAt)}`, PAGE_MARGIN, PAGE_MARGIN + 68, {
      width: CONTENT_WIDTH,
      align: 'right',
    });

  doc.fillColor('#000000');
}

function renderFooter(doc: PDFKit.PDFDocument, pageNumber: number, totalPages: number): void {
  const y = PAGE_HEIGHT - PAGE_MARGIN + 10;
  doc
    .fontSize(FONT_SIZE_FOOTER)
    .font('Helvetica')
    .fillColor('#888888')
    .text(`Page ${pageNumber} of ${totalPages}`, PAGE_MARGIN, y, {
      width: CONTENT_WIDTH,
      align: 'center',
    });
  doc.fillColor('#000000');
}

function renderTable(
  doc: PDFKit.PDFDocument,
  columns: TableColumn[],
  rows: string[][],
  startY: number,
): void {
  const usableBottom = PAGE_HEIGHT - PAGE_MARGIN - FOOTER_HEIGHT;
  let y = startY;

  // Draw initial header row
  y = drawTableHeaderRow(doc, columns, y);

  // Draw data rows with pagination
  for (const row of rows) {
    if (y + ROW_HEIGHT > usableBottom) {
      doc.addPage();
      y = PAGE_MARGIN + TABLE_TOP_PADDING;
      y = drawTableHeaderRow(doc, columns, y);
    }
    y = drawTableDataRow(doc, columns, row, y);
  }
}

function drawTableHeaderRow(doc: PDFKit.PDFDocument, columns: TableColumn[], y: number): number {
  let x = PAGE_MARGIN;
  const totalWidth = columns.reduce((s, c) => s + c.width, 0);

  // Header background
  doc.save();
  doc.rect(x, y, totalWidth, ROW_HEIGHT).fill('#e8e8e8');
  doc.restore();

  // Header text
  doc.fontSize(FONT_SIZE_TABLE_HEADER).font('Helvetica-Bold').fillColor('#1a1a1a');
  for (const col of columns) {
    doc.text(col.header, x + 4, y + 5, { width: col.width - 8, lineBreak: false });
    x += col.width;
  }

  return y + ROW_HEIGHT;
}

function drawTableDataRow(
  doc: PDFKit.PDFDocument,
  columns: TableColumn[],
  values: string[],
  y: number,
): number {
  let x = PAGE_MARGIN;
  const totalWidth = columns.reduce((s, c) => s + c.width, 0);

  // Zebra striping
  const stripe = Math.floor((y - PAGE_MARGIN) / ROW_HEIGHT) % 2 === 0;
  if (stripe) {
    doc.save();
    doc.rect(x, y, totalWidth, ROW_HEIGHT).fill('#fafafa');
    doc.restore();
  }

  // Row text
  doc.fontSize(FONT_SIZE_TABLE_BODY).font('Helvetica').fillColor('#333333');
  for (let i = 0; i < columns.length; i++) {
    doc.text(values[i] ?? '', x + 4, y + 5, { width: columns[i].width - 8, lineBreak: false });
    x += columns[i].width;
  }

  return y + ROW_HEIGHT;
}

// ---------------------------------------------------------------------------
// Formatting utilities
// ---------------------------------------------------------------------------

function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen - 1) + '…';
}

function formatCurrency(value: number | string): string {
  const n = typeof value === 'string' ? parseFloat(value) : value;
  if (isNaN(n)) return '$0.00';
  return `$${n.toFixed(2)}`;
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function formatDateTime(isoStr: string): string {
  const d = new Date(isoStr);
  if (isNaN(d.getTime())) return isoStr;
  return d.toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short',
  });
}
