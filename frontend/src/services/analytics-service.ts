/**
 * Analytics Service
 * Typed API adapter for the analytics and reporting endpoints.
 * BRD 3.10, 3.11
 */

import { api } from '../lib/api-client';
import { getAuthHeaders } from '../lib/api-client';

// ── Types ────────────────────────────────────────────────────────────────────

export interface TaskStatusBreakdown {
  Pending: number;
  InProgress: number;
  Blocked: number;
  Complete: number;
}

export interface VendorStatusBreakdown {
  Contacted: number;
  QuoteReceived: number;
  Booked: number;
  Confirmed: number;
  Cancelled: number;
}

export interface DietaryCount {
  dietary: string;
  count: number;
}

export interface ExpenseCategory {
  category: string;
  spent: number;
}

export interface EventAnalytics {
  totalRsvps: number;
  confirmedRsvps: number;
  declinedRsvps: number;
  pendingRsvps: number;
  checkedInCount: number;
  acceptanceRate: number;
  totalBudgetAllocated: number;
  totalBudgetSpent: number;
  budgetUtilizationPct: number;
  tasksByStatus: TaskStatusBreakdown;
  taskCompletionRate: number;
  vendorsByStatus: VendorStatusBreakdown;
  rsvpByDietaryRestriction: DietaryCount[];
  topExpenseCategories: ExpenseCategory[];
}

export interface GlobalAnalytics {
  totalEvents: number;
  upcomingEvents: number;
  completedEvents: number;
  totalGuestsManaged: number;
  totalBudgetManaged: number;
  averageRsvpRate: number;
}

// ── Functions ────────────────────────────────────────────────────────────────

/**
 * Fetches per-event analytics for the given event.
 */
export async function getEventAnalytics(eventId: string | number): Promise<EventAnalytics> {
  return api.get<EventAnalytics>(`/api/events/${eventId}/analytics`);
}

/**
 * Fetches global aggregated analytics for the authenticated user's events.
 */
export async function getGlobalAnalytics(): Promise<GlobalAnalytics> {
  return api.get<GlobalAnalytics>('/api/analytics');
}

// ── Communication metrics (#467) ─────────────────────────────────────────────

export interface CommunicationCampaignRow {
  campaignType: string;
  sent: number;
  opens: number;
  clicks: number;
}

export interface CommunicationMetrics {
  totals: {
    sent: number;
    failed: number;
    delivered: number;
    uniqueOpens: number;
    totalOpens: number;
    uniqueClicks: number;
    totalClicks: number;
    /** Fraction in 0..1 — multiply by 100 for a percentage. */
    openRate: number;
    /** Fraction in 0..1 — multiply by 100 for a percentage. */
    clickRate: number;
  };
  byCampaign: CommunicationCampaignRow[];
}

export async function getCommunicationMetrics(
  eventId: string | number,
): Promise<CommunicationMetrics> {
  return api.get<CommunicationMetrics>(`/api/events/${eventId}/analytics/communication`);
}

/**
 * Triggers a CSV download of the event report.
 * Uses fetch directly so we can handle the binary/text stream as a blob.
 */
export async function exportEventReport(eventId: string | number): Promise<void> {
  const API_BASE = import.meta.env.VITE_API_URL ?? '';
  const headers = getAuthHeaders();

  const res = await fetch(`${API_BASE}/api/events/${eventId}/analytics/export?format=csv`, {
    headers,
    credentials: 'include',
  });

  if (!res.ok) {
    throw new Error(`Export failed: ${res.statusText}`);
  }

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');

  const disposition = res.headers.get('Content-Disposition') ?? '';
  const match = /filename="([^"]+)"/.exec(disposition);
  a.download = match?.[1] ?? `event-${eventId}-report.csv`;
  a.href = url;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Exports the currently loaded EventAnalytics as a PDF file.
 * Generated entirely client-side using jsPDF + jspdf-autotable.
 */
export async function exportEventReportPdf(
  eventId: string | number,
  data: EventAnalytics,
  eventTitle?: string,
): Promise<void> {
  // Lazy-load to keep the main bundle small
  const { default: jsPDF } = await import('jspdf');
  const { default: autoTable } = await import('jspdf-autotable');

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const title = eventTitle
    ? `${eventTitle} — Analytics Report`
    : `Event ${eventId} — Analytics Report`;
  const generated = new Date().toLocaleString();

  doc.setFontSize(16);
  doc.text(title, 14, 18);
  doc.setFontSize(9);
  doc.setTextColor(120);
  doc.text(`Generated: ${generated}`, 14, 24);
  doc.setTextColor(0);

  let y = 30;

  // ── KPIs ──────────────────────────────────────────────────────────────────
  doc.setFontSize(12);
  doc.text('Key Performance Indicators', 14, y);
  y += 2;
  autoTable(doc, {
    startY: y,
    head: [['Metric', 'Value']],
    body: [
      ['Acceptance rate', `${data.acceptanceRate}%`],
      ['Budget utilization', `${data.budgetUtilizationPct}%`],
      ['Task completion rate', `${data.taskCompletionRate}%`],
      ['Confirmed RSVPs', String(data.confirmedRsvps)],
      ['Pending RSVPs', String(data.pendingRsvps)],
      ['Declined RSVPs', String(data.declinedRsvps)],
      ['Checked-in', String(data.checkedInCount)],
    ],
    theme: 'striped',
    headStyles: { fillColor: [22, 163, 74] },
    margin: { left: 14, right: 14 },
  });

  y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;

  // ── Budget ────────────────────────────────────────────────────────────────
  doc.setFontSize(12);
  doc.text('Budget Summary', 14, y);
  y += 2;
  autoTable(doc, {
    startY: y,
    head: [['Category', 'Allocated ($)', 'Spent ($)', 'Utilization %']],
    body: data.topExpenseCategories.map((c) => {
      const util =
        data.totalBudgetAllocated > 0 ? Math.round((c.spent / data.totalBudgetAllocated) * 100) : 0;
      return [c.category, c.spent.toFixed(2), c.spent.toFixed(2), `${util}%`];
    }),
    theme: 'striped',
    headStyles: { fillColor: [249, 115, 22] },
    margin: { left: 14, right: 14 },
  });

  y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;

  // ── Task breakdown ────────────────────────────────────────────────────────
  doc.setFontSize(12);
  doc.text('Task Breakdown', 14, y);
  y += 2;
  autoTable(doc, {
    startY: y,
    head: [['Status', 'Count']],
    body: [
      ['Pending', String(data.tasksByStatus.Pending)],
      ['In Progress', String(data.tasksByStatus.InProgress)],
      ['Blocked', String(data.tasksByStatus.Blocked)],
      ['Complete', String(data.tasksByStatus.Complete)],
    ],
    theme: 'striped',
    headStyles: { fillColor: [14, 165, 233] },
    margin: { left: 14, right: 14 },
  });

  doc.save(`event-${eventId}-analytics.pdf`);
}

/**
 * Exports the currently loaded EventAnalytics as an Excel (.xlsx) workbook.
 * Generated client-side using SheetJS.
 */
export async function exportEventReportExcel(
  eventId: string | number,
  data: EventAnalytics,
  eventTitle?: string,
): Promise<void> {
  const XLSX = await import('xlsx');
  const wb = XLSX.utils.book_new();

  // ── Summary sheet ─────────────────────────────────────────────────────────
  const summaryRows = [
    ['Event Analytics Report', eventTitle ?? `Event ${eventId}`],
    ['Generated', new Date().toLocaleString()],
    [],
    ['Metric', 'Value'],
    ['Acceptance Rate (%)', data.acceptanceRate],
    ['Budget Utilization (%)', data.budgetUtilizationPct],
    ['Task Completion Rate (%)', data.taskCompletionRate],
    ['Confirmed RSVPs', data.confirmedRsvps],
    ['Pending RSVPs', data.pendingRsvps],
    ['Declined RSVPs', data.declinedRsvps],
    ['Checked-in', data.checkedInCount],
    ['Total Budget Allocated ($)', data.totalBudgetAllocated],
    ['Total Budget Spent ($)', data.totalBudgetSpent],
  ];
  const wsSummary = XLSX.utils.aoa_to_sheet(summaryRows);
  XLSX.utils.book_append_sheet(wb, wsSummary, 'Summary');

  // ── Budget sheet ──────────────────────────────────────────────────────────
  const budgetRows: (string | number)[][] = [
    ['Category', 'Spent ($)'],
    ...data.topExpenseCategories.map((c) => [c.category, c.spent]),
  ];
  const wsBudget = XLSX.utils.aoa_to_sheet(budgetRows);
  XLSX.utils.book_append_sheet(wb, wsBudget, 'Budget');

  // ── Tasks sheet ───────────────────────────────────────────────────────────
  const taskRows: (string | number)[][] = [
    ['Status', 'Count'],
    ['Pending', data.tasksByStatus.Pending],
    ['In Progress', data.tasksByStatus.InProgress],
    ['Blocked', data.tasksByStatus.Blocked],
    ['Complete', data.tasksByStatus.Complete],
  ];
  const wsTasks = XLSX.utils.aoa_to_sheet(taskRows);
  XLSX.utils.book_append_sheet(wb, wsTasks, 'Tasks');

  // ── Dietary sheet ─────────────────────────────────────────────────────────
  if (data.rsvpByDietaryRestriction.length > 0) {
    const dietRows: (string | number)[][] = [
      ['Dietary Restriction', 'Count'],
      ...data.rsvpByDietaryRestriction.map((d) => [d.dietary, d.count]),
    ];
    const wsDiet = XLSX.utils.aoa_to_sheet(dietRows);
    XLSX.utils.book_append_sheet(wb, wsDiet, 'Dietary');
  }

  XLSX.writeFile(wb, `event-${eventId}-analytics.xlsx`);
}
