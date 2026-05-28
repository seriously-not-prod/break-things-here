/**
 * Analytics Narrative AI Service — Story #955
 *
 * Calls POST /api/ai/analytics-narrative with an event ID, comparison window,
 * and an optional organiser focus prompt.  Returns a structured narrative
 * summary grounded exclusively in live analytics data fetched from the database.
 *
 * All outputs are deterministic in their data grounding: the AI is strictly
 * instructed to reference only the metrics present in the context and never
 * to fabricate or extrapolate values.
 */

export type NarrativeTrendDirection = 'up' | 'down' | 'stable';
export type NarrativeDataQuality = 'sufficient' | 'sparse';

export interface AnalyticsNarrativeResponse {
  workflowType: 'analytics-narrative';
  eventId: number;
  eventTitle: string;
  /** One-line headline (≤ 120 chars) referencing at least one concrete metric. */
  headline: string;
  /** Overall trend direction: up = improving, down = declining, stable = mixed/no prior. */
  trendDirection: NarrativeTrendDirection;
  /** 1–3 sentence grounded narrative. */
  summary: string;
  /** Up to 5 notable metric change statements citing specific numbers. */
  notableChanges: string[];
  /** Up to 3 actionable recommended next steps grounded in the data. */
  suggestedActions: string[];
  /** Whether the underlying data was rich enough for a full analysis. */
  dataQuality: NarrativeDataQuality;
  contextSummary: {
    windowDays: number;
    currentPeriodGrounded: boolean;
    priorPeriodGrounded: boolean;
  };
  raw: string;
}

export interface AnalyticsNarrativeRequest {
  eventId: number;
  /**
   * Comparison window in days (1–90, default 7).
   * Metrics from before this window are used as the prior-period baseline.
   */
  windowDays?: number;
  /** Optional organiser focus (max 500 chars) to steer the narrative tone. */
  prompt?: string;
}

export async function fetchAnalyticsNarrative(
  request: AnalyticsNarrativeRequest,
): Promise<AnalyticsNarrativeResponse> {
  const response = await fetch('/api/ai/analytics-narrative', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    const data = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error ?? `Analytics narrative request failed (${response.status})`);
  }

  return response.json() as Promise<AnalyticsNarrativeResponse>;
}
