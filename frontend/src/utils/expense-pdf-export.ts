/**
 * Expense Summary PDF Export Utility
 * Generates a printable PDF report of budget categories and expenses.
 * Issue #453 / BRD section 3.4
 */

import { jsPDF } from 'jspdf';
import { applyPlugin } from 'jspdf-autotable';
import type { BudgetCategory, BudgetSummary, Expense } from '../services/budget-service';

// Apply autotable plugin to jsPDF
applyPlugin(jsPDF);

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ExpensePdfOptions {
  categories: BudgetCategory[];
  expenses: Expense[];
  summary: BudgetSummary;
  /** Optional event name used in PDF title */
  eventName?: string;
  /** Override current date (useful for testing) */
  generatedAt?: Date;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmtCurrency = (n: number): string =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(n);

const fmtDate = (iso: string): string => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('en-US');
};

const capitalize = (s: string): string =>
  s.length > 0 ? s.charAt(0).toUpperCase() + s.slice(1) : s;

// ─── Main export function ─────────────────────────────────────────────────────

/**
 * Generates a PDF expense summary and triggers a browser download.
 *
 * @param options - Categories, expenses, summary totals, and optional metadata
 * @returns The generated jsPDF document instance (useful for testing)
 */
export function generateExpenseSummaryPdf(options: ExpensePdfOptions): jsPDF {
  const { categories, expenses, summary, eventName = 'Event', generatedAt = new Date() } = options;

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 14;
  let currentY = margin;

  // ── Title ─────────────────────────────────────────────────────────────────
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.text('Expense Summary Report', margin, currentY);
  currentY += 8;

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100);
  doc.text(
    `${eventName}  ·  Generated: ${generatedAt.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })}`,
    margin,
    currentY,
  );
  doc.setTextColor(0);
  currentY += 10;

  // ── Summary KPI section ───────────────────────────────────────────────────
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text('Budget Overview', margin, currentY);
  currentY += 6;

  const kpiData: [string, string][] = [
    ['Total Allocated', fmtCurrency(summary.totalAllocated)],
    ['Total Spent', fmtCurrency(summary.totalSpent)],
    ['Remaining', fmtCurrency(summary.remaining)],
    ['Budget Used', `${summary.percentUsed}%`],
  ];

  // Draw a simple 2-column KPI block
  const colW = (pageWidth - margin * 2) / 2;
  doc.setFontSize(10);
  kpiData.forEach(([label, value], idx) => {
    const x = margin + (idx % 2) * colW;
    const y = currentY + Math.floor(idx / 2) * 8;
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(80);
    doc.text(label, x, y);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(0);
    doc.text(value, x + colW * 0.5, y);
  });
  currentY += Math.ceil(kpiData.length / 2) * 8 + 8;

  // ── Categories Table ──────────────────────────────────────────────────────
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text('Category Breakdown', margin, currentY);
  currentY += 4;

  const categoryRows = categories.map((cat) => {
    const pct = cat.allocated_amount > 0 ? Math.round((cat.spent / cat.allocated_amount) * 100) : 0;
    return [
      cat.name,
      fmtCurrency(cat.allocated_amount),
      fmtCurrency(cat.spent),
      fmtCurrency(cat.allocated_amount - cat.spent),
      `${pct}%`,
    ];
  });

  // @ts-expect-error autoTable is added by applyPlugin at runtime
  doc.autoTable({
    startY: currentY,
    head: [['Category', 'Allocated', 'Spent', 'Remaining', '% Used']],
    body: categoryRows.length > 0 ? categoryRows : [['No categories', '', '', '', '']],
    theme: 'striped',
    headStyles: { fillColor: [37, 99, 235], textColor: 255, fontStyle: 'bold' },
    styles: { fontSize: 9, cellPadding: 3 },
    columnStyles: {
      0: { cellWidth: 55 },
      1: { halign: 'right' },
      2: { halign: 'right' },
      3: { halign: 'right' },
      4: { halign: 'right', cellWidth: 20 },
    },
    margin: { left: margin, right: margin },
  });

  // @ts-expect-error autoTable adds lastAutoTable to the doc instance
  currentY = (doc.lastAutoTable?.finalY ?? currentY) + 12;

  // ── Expense Detail Table ──────────────────────────────────────────────────
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text('Expense Details', margin, currentY);
  currentY += 4;

  const expenseRows = expenses.map((exp) => [
    exp.title,
    exp.category_name ?? '—',
    fmtCurrency(exp.amount),
    capitalize(exp.payment_status),
    exp.vendor_name ?? '—',
    fmtDate(exp.created_at),
  ]);

  // @ts-expect-error autoTable is added by applyPlugin at runtime
  doc.autoTable({
    startY: currentY,
    head: [['Title', 'Category', 'Amount', 'Status', 'Vendor', 'Date']],
    body: expenseRows.length > 0 ? expenseRows : [['No expenses recorded', '', '', '', '', '']],
    theme: 'striped',
    headStyles: { fillColor: [37, 99, 235], textColor: 255, fontStyle: 'bold' },
    styles: { fontSize: 9, cellPadding: 3 },
    columnStyles: {
      0: { cellWidth: 45 },
      2: { halign: 'right' },
      5: { cellWidth: 25 },
    },
    margin: { left: margin, right: margin },
  });

  // ── Footer on each page ───────────────────────────────────────────────────
  const pageCount: number = doc.getNumberOfPages();
  doc.setFontSize(8);
  doc.setTextColor(150);
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.text(`Page ${i} of ${pageCount}`, pageWidth / 2, doc.internal.pageSize.getHeight() - 8, {
      align: 'center',
    });
  }

  // ── Save ──────────────────────────────────────────────────────────────────
  const fileName = `expense-summary-${eventName.toLowerCase().replace(/\s+/g, '-')}-${generatedAt
    .toISOString()
    .slice(0, 10)}.pdf`;
  doc.save(fileName);

  return doc;
}
