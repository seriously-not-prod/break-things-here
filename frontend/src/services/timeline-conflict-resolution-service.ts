/**
 * Timeline Conflict Resolution AI Service — Story #954
 *
 * Calls POST /api/ai/conflict-resolution with an event ID and an optional
 * user prompt.  Returns a structured ConflictResolutionResponse containing
 * AI-generated advisory suggestions for each detected timeline conflict.
 *
 * All suggestions are advisory-only.  Callers MUST surface the
 * `advisoryLabel` field in the UI so users understand these are AI-generated
 * suggestions that require independent review before any scheduling change is made.
 * NO changes are applied automatically.
 */

export interface ConflictResolutionSuggestion {
  /** Composite key: "<activityAId>-<activityBId>". */
  conflictId: string;
  activityAId: number;
  activityATitle: string;
  activityBId: number;
  activityBTitle: string;
  /** Conflict reason (overlap | adjacent_no_buffer | resource_double_book | sort_dependency). */
  reason: string;
  /** Advisory suggestion for resolving the conflict. */
  suggestion: string;
  /** Notes on dependency impact. */
  dependencyImpact: string;
  /** Notes on resource (vendor/location) impact. */
  resourceImpact: string;
  /** Optional concrete alternative time slot proposals. */
  alternativeSlots: string[];
}

export interface ConflictResolutionResponse {
  workflowType: 'conflict-resolution';
  eventId: number;
  eventTitle: string;
  /** Number of conflicts detected by the server-side conflict detection service. */
  conflictCount: number;
  suggestions: ConflictResolutionSuggestion[];
  /** Plain-text overview of detected conflicts and resolution strategy. */
  summary: string;
  /** Advisory disclaimer — MUST be displayed in the UI at all times. */
  advisoryLabel: string;
  /** Raw AI model output for traceability. */
  raw: string;
  contextSummary: {
    activityCount: number;
    groundedConflicts: number;
  };
}

export interface ConflictResolutionRequest {
  eventId: number;
  /** Optional user guidance for the resolution suggestions. */
  prompt?: string;
}

export async function fetchConflictResolutionSuggestions(
  request: ConflictResolutionRequest,
): Promise<ConflictResolutionResponse> {
  const response = await fetch('/api/ai/conflict-resolution', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    const data = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error ?? `Conflict resolution request failed (${response.status})`);
  }

  return response.json() as Promise<ConflictResolutionResponse>;
}
