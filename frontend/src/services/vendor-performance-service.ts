/**
 * Vendor Performance Service (#463 / #798)
 */

import { api } from '../lib/api-client';

export type VendorPerformanceWindow = 'lifetime' | '90d';

export interface VendorPerformance {
  vendor_id: number;
  vendor_name: string;
  category: string;
  status: string;
  rating: number | null;
  contract_on_file: boolean;
  quoted_amount: number | null;
  days_active: number;
  total_communications: number;
  last_contact_at: string | null;
  // #798 additions
  mean_response_hours: number | null;
  median_response_hours: number | null;
  on_time_completed: number;
  on_time_total_completed: number;
  on_time_rate: number | null;
  complaint_count: number;
  // existing
  total_expenses: number;
  total_paid: number;
  total_pending: number;
  timeline_items: number;
  performance_score: number;
  window: VendorPerformanceWindow;
}

export async function getVendorPerformance(
  eventId: number | string,
  vendorId: number | string,
  windowFilter: VendorPerformanceWindow = 'lifetime',
): Promise<VendorPerformance> {
  const qs = windowFilter === '90d' ? '?window=90d' : '';
  const data = await api.get<{ performance: VendorPerformance }>(
    `/api/events/${eventId}/vendors/${vendorId}/performance${qs}`,
  );
  return data.performance;
}

export async function listVendorPerformance(
  eventId: number | string,
): Promise<VendorPerformance[]> {
  const data = await api.get<{ performance: VendorPerformance[] }>(
    `/api/events/${eventId}/vendors/performance`,
  );
  return data.performance;
}
