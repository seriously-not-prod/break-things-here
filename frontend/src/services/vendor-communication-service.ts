/**
 * Vendor Communication & Compare Service (#452)
 */

import { api } from '../lib/api-client';

export interface VendorCommLog {
  id: number;
  event_id: number;
  vendor_id: number;
  type: 'email' | 'call' | 'meeting' | 'quote' | 'follow_up' | 'other';
  subject: string;
  body: string | null;
  sent_by: number | null;
  author_name: string | null;
  created_at: string;
}

export async function listVendorCommunication(
  eventId: number | string,
  vendorId: number | string,
): Promise<VendorCommLog[]> {
  const data = await api.get<{ logs: VendorCommLog[] }>(
    `/api/events/${eventId}/vendors/${vendorId}/communication`,
  );
  return data.logs;
}

export async function addVendorCommunication(
  eventId: number | string,
  vendorId: number | string,
  payload: { type: string; subject: string; body?: string },
): Promise<VendorCommLog> {
  const data = await api.post<{ log: VendorCommLog }>(
    `/api/events/${eventId}/vendors/${vendorId}/communication`,
    payload,
  );
  return data.log;
}

export async function deleteVendorCommunication(
  eventId: number | string,
  vendorId: number | string,
  logId: number,
): Promise<void> {
  await api.delete(`/api/events/${eventId}/vendors/${vendorId}/communication/${logId}`);
}

export interface VendorCompare {
  id: number;
  name: string;
  category: string;
  status: string;
  quoted_amount: number | null;
  rating: number | null;
  contract_file: string | null;
  communication_count: number;
  last_contact_at: string | null;
}

export async function compareVendors(
  eventId: number | string,
  vendorIds: number[],
): Promise<VendorCompare[]> {
  const ids = vendorIds.join(',');
  const data = await api.get<{ vendors: VendorCompare[] }>(
    `/api/events/${eventId}/vendors/compare?ids=${ids}`,
  );
  return data.vendors;
}
