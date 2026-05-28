/**
 * Budget Insight AI Service — Story #952
 *
 * Calls POST /api/ai/budget-insight with event ID and an optional user prompt.
 * Returns a structured BudgetInsightResponse containing variance analysis,
 * risk indicators, anomalies, and at least 3 actionable recommendations.
 */

import { api } from '../lib/api-client';

export interface BudgetRecommendation {
  category: string;
  insight: string;
  action: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
}

export interface BudgetInsightResponse {
  workflowType: 'budget-insight';
  eventId: number;
  eventTitle: string;
  summary: string;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  totalAllocated: number;
  totalSpent: number;
  totalVariance: number;
  overspentCategories: string[];
  anomalies: string[];
  recommendations: BudgetRecommendation[];
  raw: string;
  contextSummary: {
    groundedFields: string[];
    categoryCount: number;
    expenseCount: number;
  };
}

export interface BudgetInsightRequest {
  eventId: number;
  prompt?: string;
}

export async function fetchBudgetInsight(
  request: BudgetInsightRequest,
): Promise<BudgetInsightResponse> {
  return api.post<BudgetInsightResponse>('/api/ai/budget-insight', request);
}
