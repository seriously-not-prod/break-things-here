/**
 * Budget Templates Service (#438)
 * API client for budget template CRUD and applying templates to events.
 */

import { api } from '../lib/api-client';

export interface BudgetTemplateItem {
  id: number;
  template_id: number;
  name: string;
  allocated_amount: number;
  color: string;
  created_at: string;
}

export interface BudgetTemplate {
  id: number;
  name: string;
  description: string | null;
  created_by: number | null;
  created_at: string;
  item_count?: number;
}

export interface CreateTemplatePayload {
  name: string;
  description?: string;
  items: Array<{ name: string; allocated_amount: number; color?: string }>;
}

export async function listBudgetTemplates(): Promise<BudgetTemplate[]> {
  const data = await api.get<{ templates: BudgetTemplate[] }>('/api/budget-templates');
  return data.templates;
}

export async function getBudgetTemplate(
  id: number,
): Promise<{ template: BudgetTemplate; items: BudgetTemplateItem[] }> {
  return api.get<{ template: BudgetTemplate; items: BudgetTemplateItem[] }>(
    `/api/budget-templates/${id}`,
  );
}

export async function createBudgetTemplate(
  payload: CreateTemplatePayload,
): Promise<{ template: BudgetTemplate; items: BudgetTemplateItem[] }> {
  return api.post<{ template: BudgetTemplate; items: BudgetTemplateItem[] }>(
    '/api/budget-templates',
    payload,
  );
}

export async function deleteBudgetTemplate(id: number): Promise<void> {
  await api.delete(`/api/budget-templates/${id}`);
}

export async function applyBudgetTemplate(
  eventId: number | string,
  templateId: number,
): Promise<{ categories: unknown[] }> {
  return api.post<{ categories: unknown[] }>(
    `/api/events/${eventId}/budget/apply-template`,
    { template_id: templateId },
  );
}
