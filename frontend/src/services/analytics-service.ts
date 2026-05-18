/**
 * Analytics Service
 * Typed API adapter for the analytics and reporting endpoints.
 * BRD 3.10, 3.11
 */

import { api } from '../lib/api-client';
import { getAuthHeaders } from '../lib/api-client';

// ── Types ────────────────────────────────────────────────────────────────────

export interface TaskStatusBreakdown {
  Pending:    number;
  InProgress: number;
  Blocked:    number;
  Complete:   number;
}

export interface VendorStatusBreakdown {
  Contacted:     number;
  QuoteReceived: number;
  Booked:        number;
  Confirmed:     number;
  Cancelled:     number;
}

export interface DietaryCount {
  dietary: string;
  count:   number;
}

export interface ExpenseCategory {
  category: string;
  spent:    number;
}

export interface EventAnalytics {
  totalRsvps:               number;
  confirmedRsvps:           number;
  declinedRsvps:            number;
  pendingRsvps:             number;
  checkedInCount:           number;
  acceptanceRate:           number;
  totalBudgetAllocated:     number;
  totalBudgetSpent:         number;
  budgetUtilizationPct:     number;
  tasksByStatus:            TaskStatusBreakdown;
  taskCompletionRate:       number;
  vendorsByStatus:          VendorStatusBreakdown;
  rsvpByDietaryRestriction: DietaryCount[];
  topExpenseCategories:     ExpenseCategory[];
}

export interface GlobalAnalytics {
  totalEvents:        number;
  upcomingEvents:     number;
  completedEvents:    number;
  totalGuestsManaged: number;
  totalBudgetManaged: number;
  averageRsvpRate:    number;
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
  return api.get<CommunicationMetrics>(
    `/api/events/${eventId}/analytics/communication`,
  );
}

/**
 * Triggers a CSV download of the event report.
 * Uses fetch directly so we can handle the binary/text stream as a blob.
 */
export async function exportEventReport(eventId: string | number): Promise<void> {
  const API_BASE = import.meta.env.VITE_API_URL ?? '';
  const headers = getAuthHeaders();

  const res = await fetch(
    `${API_BASE}/api/events/${eventId}/analytics/export?format=csv`,
    { headers, credentials: 'include' },
  );

  if (!res.ok) {
    throw new Error(`Export failed: ${res.statusText}`);
  }

  const blob = await res.blob();
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');

  const disposition = res.headers.get('Content-Disposition') ?? '';
  const match       = /filename="([^"]+)"/.exec(disposition);
  a.download        = match?.[1] ?? `event-${eventId}-report.csv`;
  a.href            = url;
  a.style.display   = 'none';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
