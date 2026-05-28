/**
 * Vendor AI Recommendation Service — Story #953
 *
 * Calls POST /api/ai/vendor-recommendation with an event ID and an optional
 * user prompt.  Returns a structured VendorRecommendationResponse containing
 * ranked vendor recommendations grounded exclusively in live vendor data.
 *
 * All recommendations are advisory-only.  Callers MUST surface the
 * `advisoryLabel` field in the UI so users understand these are AI-generated
 * suggestions that require independent verification before contracting.
 */

export interface VendorRecommendationItem {
  vendorId: number;
  vendorName: string;
  rank: number;
  score: number;
  rationale: string;
  strengths: string[];
  concerns: string[];
}

export interface VendorRecommendationResponse {
  workflowType: 'vendor-recommendation';
  eventId: number;
  eventTitle: string;
  summary: string;
  recommendations: VendorRecommendationItem[];
  /** Advisory disclaimer — MUST be displayed in the UI at all times. */
  advisoryLabel: string;
  raw: string;
  contextSummary: {
    groundedFields: string[];
    vendorCount: number;
  };
}

export interface VendorRecommendationRequest {
  eventId: number;
  prompt?: string;
}

export async function fetchVendorRecommendation(
  request: VendorRecommendationRequest,
): Promise<VendorRecommendationResponse> {
  const response = await fetch('/api/ai/vendor-recommendation', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    const data = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error ?? `Vendor recommendation request failed (${response.status})`);
  }

  return response.json() as Promise<VendorRecommendationResponse>;
}
