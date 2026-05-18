/**
 * Event bulk-actions service — story #410, task #433
 * Drives /api/events/bulk for archive / delete / export.
 */

import { api, apiFetch } from '../lib/api-client';

export type BulkAction = 'archive' | 'delete' | 'export';

export interface BulkResultEntry {
  event_id: number;
  status: 'ok' | 'forbidden' | 'not_found' | 'error';
  message?: string;
}

export interface BulkResultSummary {
  action: BulkAction;
  results: BulkResultEntry[];
  success: number;
  total: number;
}

export async function bulkArchiveOrDelete(
  action: 'archive' | 'delete',
  event_ids: number[],
): Promise<BulkResultSummary> {
  return api.post<BulkResultSummary>('/api/events/bulk', { action, event_ids });
}

/**
 * Trigger a CSV download for the supplied event ids.
 * Browser-only — uses an object URL because the endpoint streams `text/csv`.
 */
export async function bulkExportCsv(event_ids: number[]): Promise<void> {
  const res = await apiFetch('/api/events/bulk', {
    method: 'POST',
    body: JSON.stringify({ action: 'export', event_ids }),
    headers: { 'Content-Type': 'application/json' },
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(detail || `Export failed (HTTP ${res.status})`);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `events-export-${Date.now()}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
