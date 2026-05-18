/**
 * Vendor Performance Service (#463)
 */

import { api } from '../lib/api-client';

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
  total_expenses: number;
  total_paid: number;
  total_pending: number;
  timeline_items: number;
  performance_score: number;
}

export async function getVendorPerformance(
  eventId: number | string,
  vendorId: number | string,
): Promise<VendorPerformance> {
  const data = await api.get<{ performance: VendorPerformance }>(
    `/api/events/${eventId}/vendors/${vendorId}/performance`,
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
