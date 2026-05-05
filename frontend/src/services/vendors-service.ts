import { api, apiFetch } from '../lib/api-client';

export type VendorStatus = 'Contacted' | 'Quote Received' | 'Booked' | 'Confirmed' | 'Cancelled';

export interface Vendor {
  id: number;
  event_id: number;
  name: string;
  category: string;
  email: string | null;
  phone: string | null;
  website: string | null;
  status: VendorStatus;
  quoted_amount: number | null;
  contract_file: string | null;
  notes: string | null;
  rating: number | null;
  created_by: number | null;
  created_at: string;
  updated_at: string;
}

export interface CreateVendorInput {
  name: string;
  category: string;
  email?: string;
  phone?: string;
  website?: string;
  status?: VendorStatus;
  quoted_amount?: number;
  notes?: string;
  rating?: number;
}

export interface UpdateVendorInput extends Partial<CreateVendorInput> {}

export async function listVendors(eventId: number): Promise<Vendor[]> {
  const data = await api.get<{ vendors: Vendor[] }>(`/api/events/${eventId}/vendors`);
  return data.vendors ?? [];
}

export async function createVendor(eventId: number, input: CreateVendorInput): Promise<Vendor> {
  const data = await api.post<{ vendor: Vendor }>(`/api/events/${eventId}/vendors`, input);
  return data.vendor;
}

export async function updateVendor(eventId: number, vendorId: number, input: UpdateVendorInput): Promise<Vendor> {
  const data = await api.put<{ vendor: Vendor }>(`/api/events/${eventId}/vendors/${vendorId}`, input);
  return data.vendor;
}

export async function deleteVendor(eventId: number, vendorId: number): Promise<void> {
  await api.delete(`/api/events/${eventId}/vendors/${vendorId}`);
}

export async function uploadVendorContract(eventId: number, vendorId: number, file: File): Promise<Vendor> {
  const formData = new FormData();
  formData.append('file', file);
  const res = await apiFetch(`/api/events/${eventId}/vendors/${vendorId}/contract`, {
    method: 'POST',
    body: formData,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText })) as { error?: string };
    throw new Error(body.error ?? res.statusText);
  }

  const data = await res.json() as { vendor: Vendor };
  return data.vendor;
}
