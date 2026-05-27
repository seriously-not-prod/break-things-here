/**
 * Shared structured AI output schemas — Issue #964
 *
 * Provides:
 * - TypeScript types / interfaces for every AI response contract.
 * - Runtime validation functions that return typed `ParseResult<T>` objects
 *   instead of silently returning `null`, so callers can surface actionable
 *   validation errors and log schema violations for observability.
 * - A provider-safe JSON extraction helper that strips markdown fences that
 *   some models emit before the JSON payload.
 * - Reusable across all AI workflows (suggest, grounded, rsvp-draft, general).
 */

// ── Validation primitives ─────────────────────────────────────────────────────

/** A single schema violation linked to the offending field. */
export interface SchemaValidationError {
  /** Dot-notation path to the invalid field, e.g. `"promotionalTips[0]"`. */
  field: string;
  /** Human-readable description of the constraint that was violated. */
  message: string;
  /** The value that was found at `field` (may be `undefined`). */
  received?: unknown;
}

/** Discriminated union returned by every `parse*` function in this module. */
export type ParseResult<T> =
  | { ok: true; data: T; errors: [] }
  | { ok: false; data: null; errors: SchemaValidationError[] };

function ok<T>(data: T): ParseResult<T> {
  return { ok: true, data, errors: [] };
}

function fail<T>(errors: SchemaValidationError[]): ParseResult<T> {
  return { ok: false, data: null, errors };
}

// ── Provider-safe JSON extractor ──────────────────────────────────────────────

/**
 * Strips markdown code fences that Azure OpenAI / OpenAI models sometimes
 * prepend or append, then parses the result as JSON.
 *
 * Returns a `ParseResult` with a structured error when the raw string is not
 * valid JSON after stripping.
 */
export function extractJson(raw: string): ParseResult<Record<string, unknown>> {
  const cleaned = raw
    .replace(/```(?:json)?\s*/gi, '')
    .replace(/```\s*/g, '')
    .trim();

  try {
    const parsed = JSON.parse(cleaned) as unknown;
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      return fail([
        {
          field: '<root>',
          message: 'AI response must be a JSON object',
          received: typeof parsed,
        },
      ]);
    }
    return ok(parsed as Record<string, unknown>);
  } catch {
    return fail([
      {
        field: '<root>',
        message: 'AI response is not valid JSON',
        received: cleaned.substring(0, 200),
      },
    ]);
  }
}

// ── Output schema types ───────────────────────────────────────────────────────

/**
 * Structured suggestion for the `event` AI workflow context.
 * Maps to the grounded event system-prompt JSON contract.
 */
export interface EventSuggestionSchema {
  title: string;
  description: string;
  venueType: string;
  promotionalTips: string[];
}

/**
 * Structured suggestion for the `task` AI workflow context.
 * Maps to the grounded task system-prompt JSON contract.
 */
export interface TaskSuggestionSchema {
  actionTitle: string;
  dueDateRange: string;
  owner: string;
  dependencies: string[];
}

/**
 * Structured suggestion for the `rsvp` AI workflow context.
 * Maps to the grounded RSVP system-prompt JSON contract.
 */
export interface RsvpSuggestionSchema {
  confirmationMessage: string;
  reminderMessage: string;
  capacityTip: string;
}

/**
 * Structured suggestion for the `general` AI workflow context.
 * The general context returns free-form advice; we wrap it in a typed envelope
 * so all contexts have a consistent structured contract.
 */
export interface GeneralSuggestionSchema {
  advice: string;
  /** Optional ordered action items extracted from the response (may be empty). */
  actionItems: string[];
}

/**
 * Structured output for the RSVP communication drafting endpoint (#951).
 * Three distinct editable message variants.
 */
export interface RsvpCommunicationDraftSchema {
  /** Reminder targeted at pending / maybe guests. */
  reminderVariant: string;
  /** Thank-you / confirmation message for confirmed guests. */
  confirmationVariant: string;
  /** Urgent deadline reminder for non-responders. */
  deadlineReminder: string;
}

/** Union of all AI output schema types. */
export type AiOutputSchema =
  | EventSuggestionSchema
  | TaskSuggestionSchema
  | RsvpSuggestionSchema
  | GeneralSuggestionSchema
  | RsvpCommunicationDraftSchema;

// ── Schema validators ─────────────────────────────────────────────────────────

/**
 * Parse and validate the AI model response for the `event` workflow context.
 *
 * Required fields: `title` (string), `description` (string).
 * Optional fields default to empty values rather than being rejected.
 */
export function parseEventSuggestion(raw: string): ParseResult<EventSuggestionSchema> {
  const jsonResult = extractJson(raw);
  if (!jsonResult.ok) return fail(jsonResult.errors);

  const p = jsonResult.data;
  const errors: SchemaValidationError[] = [];

  if (typeof p.title !== 'string' || p.title.trim() === '') {
    errors.push({
      field: 'title',
      message: 'title must be a non-empty string',
      received: p.title,
    });
  }
  if (typeof p.description !== 'string' || p.description.trim() === '') {
    errors.push({
      field: 'description',
      message: 'description must be a non-empty string',
      received: p.description,
    });
  }

  // Validate optional array field — each element must be a string.
  const rawTips = p.promotionalTips;
  if (rawTips !== undefined && !Array.isArray(rawTips)) {
    errors.push({
      field: 'promotionalTips',
      message: 'promotionalTips must be an array',
      received: rawTips,
    });
  } else if (Array.isArray(rawTips)) {
    rawTips.forEach((tip, i) => {
      if (typeof tip !== 'string') {
        errors.push({
          field: `promotionalTips[${i}]`,
          message: 'Each promotional tip must be a string',
          received: tip,
        });
      }
    });
  }

  if (errors.length > 0) return fail(errors);

  return ok({
    title: (p.title as string).trim(),
    description: (p.description as string).trim(),
    venueType: typeof p.venueType === 'string' ? p.venueType.trim() : '',
    promotionalTips: Array.isArray(p.promotionalTips)
      ? (p.promotionalTips as string[]).map((t) => String(t))
      : [],
  });
}

/**
 * Parse and validate the AI model response for the `task` workflow context.
 *
 * Required field: `actionTitle` (string).
 * Optional fields default to empty values or empty arrays.
 */
export function parseTaskSuggestion(raw: string): ParseResult<TaskSuggestionSchema> {
  const jsonResult = extractJson(raw);
  if (!jsonResult.ok) return fail(jsonResult.errors);

  const p = jsonResult.data;
  const errors: SchemaValidationError[] = [];

  if (typeof p.actionTitle !== 'string' || p.actionTitle.trim() === '') {
    errors.push({
      field: 'actionTitle',
      message: 'actionTitle must be a non-empty string',
      received: p.actionTitle,
    });
  }

  const rawDeps = p.dependencies;
  if (rawDeps !== undefined && !Array.isArray(rawDeps)) {
    errors.push({
      field: 'dependencies',
      message: 'dependencies must be an array',
      received: rawDeps,
    });
  } else if (Array.isArray(rawDeps)) {
    rawDeps.forEach((dep, i) => {
      if (typeof dep !== 'string') {
        errors.push({
          field: `dependencies[${i}]`,
          message: 'Each dependency must be a string',
          received: dep,
        });
      }
    });
  }

  if (errors.length > 0) return fail(errors);

  return ok({
    actionTitle: (p.actionTitle as string).trim(),
    dueDateRange: typeof p.dueDateRange === 'string' ? p.dueDateRange.trim() : '',
    owner: typeof p.owner === 'string' ? p.owner.trim() : '',
    dependencies: Array.isArray(p.dependencies)
      ? (p.dependencies as string[]).map((d) => String(d))
      : [],
  });
}

/**
 * Parse and validate the AI model response for the `rsvp` workflow context.
 *
 * Required field: `confirmationMessage` (string).
 * Optional fields default to empty strings.
 */
export function parseRsvpSuggestion(raw: string): ParseResult<RsvpSuggestionSchema> {
  const jsonResult = extractJson(raw);
  if (!jsonResult.ok) return fail(jsonResult.errors);

  const p = jsonResult.data;
  const errors: SchemaValidationError[] = [];

  if (typeof p.confirmationMessage !== 'string' || p.confirmationMessage.trim() === '') {
    errors.push({
      field: 'confirmationMessage',
      message: 'confirmationMessage must be a non-empty string',
      received: p.confirmationMessage,
    });
  }

  if (errors.length > 0) return fail(errors);

  return ok({
    confirmationMessage: (p.confirmationMessage as string).trim(),
    reminderMessage: typeof p.reminderMessage === 'string' ? p.reminderMessage.trim() : '',
    capacityTip: typeof p.capacityTip === 'string' ? p.capacityTip.trim() : '',
  });
}

/**
 * Parse and validate the AI model response for the `general` workflow context.
 *
 * The general context returns free-form text; we wrap it in a typed envelope.
 * When the model returns plain text instead of JSON we treat the entire string
 * as the `advice` field so no information is lost.
 */
export function parseGeneralSuggestion(raw: string): ParseResult<GeneralSuggestionSchema> {
  const jsonResult = extractJson(raw);

  // General context may return plain text — normalise gracefully.
  if (!jsonResult.ok) {
    const trimmed = raw.trim();
    if (trimmed.length === 0) {
      return fail([
        {
          field: 'advice',
          message: 'AI response is empty',
          received: raw,
        },
      ]);
    }
    return ok({ advice: trimmed, actionItems: [] });
  }

  const p = jsonResult.data;
  const advice =
    typeof p.advice === 'string' && p.advice.trim() !== '' ? p.advice.trim() : raw.trim();

  const rawItems = p.actionItems;
  const actionItems: string[] = [];
  const errors: SchemaValidationError[] = [];

  if (rawItems !== undefined && !Array.isArray(rawItems)) {
    errors.push({
      field: 'actionItems',
      message: 'actionItems must be an array when provided',
      received: rawItems,
    });
  } else if (Array.isArray(rawItems)) {
    rawItems.forEach((item, i) => {
      if (typeof item !== 'string') {
        errors.push({
          field: `actionItems[${i}]`,
          message: 'Each action item must be a string',
          received: item,
        });
      } else {
        actionItems.push(item);
      }
    });
  }

  if (errors.length > 0) return fail(errors);

  return ok({ advice, actionItems });
}

/**
 * Parse and validate the AI model response for the RSVP communication
 * drafting endpoint (#951).
 *
 * Required field: `reminderVariant` (string).
 * Optional fields default to empty strings.
 */
export function parseRsvpCommunicationDraft(
  raw: string,
): ParseResult<RsvpCommunicationDraftSchema> {
  const jsonResult = extractJson(raw);
  if (!jsonResult.ok) return fail(jsonResult.errors);

  const p = jsonResult.data;
  const errors: SchemaValidationError[] = [];

  if (typeof p.reminderVariant !== 'string' || p.reminderVariant.trim() === '') {
    errors.push({
      field: 'reminderVariant',
      message: 'reminderVariant must be a non-empty string',
      received: p.reminderVariant,
    });
  }

  if (errors.length > 0) return fail(errors);

  return ok({
    reminderVariant: (p.reminderVariant as string).trim(),
    confirmationVariant:
      typeof p.confirmationVariant === 'string' ? p.confirmationVariant.trim() : '',
    deadlineReminder: typeof p.deadlineReminder === 'string' ? p.deadlineReminder.trim() : '',
  });
}

// ── Budget insight schema ─────────────────────────────────────────────────────

export type BudgetRiskLevel = 'low' | 'medium' | 'high' | 'critical';
export type BudgetPriority = 'low' | 'medium' | 'high' | 'critical';

/**
 * A single actionable recommendation in a budget insight response.
 */
export interface BudgetRecommendationSchema {
  category: string;
  insight: string;
  action: string;
  priority: BudgetPriority;
}

/**
 * Structured output for the budget insight AI endpoint (#952).
 */
export interface BudgetInsightOutputSchema {
  summary: string;
  riskLevel: BudgetRiskLevel;
  anomalies: string[];
  recommendations: BudgetRecommendationSchema[];
}

/**
 * Parse and validate the AI model response for the budget insight endpoint.
 *
 * Required fields: `recommendations` (non-empty array with at least one valid item).
 * Optional fields default to empty/neutral values.
 */
export function parseBudgetInsightOutput(raw: string): ParseResult<BudgetInsightOutputSchema> {
  const jsonResult = extractJson(raw);
  if (!jsonResult.ok) return fail(jsonResult.errors);

  const p = jsonResult.data;
  const errors: SchemaValidationError[] = [];

  const VALID_RISK = new Set<string>(['low', 'medium', 'high', 'critical']);
  const VALID_PRIORITY = new Set<string>(['low', 'medium', 'high', 'critical']);

  if (!Array.isArray(p.recommendations)) {
    errors.push({
      field: 'recommendations',
      message: 'recommendations must be an array',
      received: p.recommendations,
    });
  }

  if (errors.length > 0) return fail(errors);

  const recommendations: BudgetRecommendationSchema[] = [];
  const rawRecs = p.recommendations as unknown[];
  for (let i = 0; i < rawRecs.length; i++) {
    const item = rawRecs[i];
    if (typeof item !== 'object' || item === null) continue;
    const r = item as Record<string, unknown>;
    if (typeof r.insight !== 'string' || !r.insight.trim()) continue;
    recommendations.push({
      category: typeof r.category === 'string' ? r.category : 'Overall',
      insight: r.insight.trim(),
      action: typeof r.action === 'string' ? r.action.trim() : '',
      priority: VALID_PRIORITY.has(r.priority as string)
        ? (r.priority as BudgetPriority)
        : 'medium',
    });
  }

  if (recommendations.length === 0) {
    return fail([
      {
        field: 'recommendations',
        message: 'At least one valid recommendation with a non-empty insight is required',
        received: p.recommendations,
      },
    ]);
  }

  return ok({
    summary: typeof p.summary === 'string' ? p.summary.trim() : '',
    riskLevel: VALID_RISK.has(p.riskLevel as string) ? (p.riskLevel as BudgetRiskLevel) : 'medium',
    anomalies: Array.isArray(p.anomalies)
      ? (p.anomalies as unknown[]).filter((a): a is string => typeof a === 'string')
      : [],
    recommendations,
  });
}

// ── Task breakdown schema ─────────────────────────────────────────────────────

export type TaskBreakdownPriority = 'low' | 'medium' | 'high' | 'urgent';

/**
 * A single task item in an AI-generated task breakdown response.
 */
export interface TaskBreakdownItemSchema {
  title: string;
  owner: string;
  dueWindow: string;
  dependencies: string[];
  priority: TaskBreakdownPriority;
  timelineConstraint: string;
}

/**
 * Parse and validate the AI model response for the task breakdown endpoint (#950).
 *
 * The model returns a JSON array; each item must have a non-empty `title`.
 * Returns an error result when the array is empty or malformed.
 */
export function parseTaskBreakdownOutput(raw: string): ParseResult<TaskBreakdownItemSchema[]> {
  const cleaned = raw
    .replace(/```(?:json)?\s*/gi, '')
    .replace(/```\s*/g, '')
    .trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    return fail([
      {
        field: '<root>',
        message: 'AI task breakdown response is not valid JSON',
        received: cleaned.substring(0, 200),
      },
    ]);
  }

  if (!Array.isArray(parsed)) {
    return fail([
      {
        field: '<root>',
        message: 'AI task breakdown response must be a JSON array',
        received: typeof parsed,
      },
    ]);
  }

  const VALID_PRIORITIES = new Set<string>(['low', 'medium', 'high', 'urgent']);
  const items: TaskBreakdownItemSchema[] = [];

  for (const item of parsed) {
    if (typeof item !== 'object' || item === null) continue;
    const t = item as Record<string, unknown>;
    if (typeof t.title !== 'string' || !t.title.trim()) continue;

    items.push({
      title: t.title.trim(),
      owner: typeof t.owner === 'string' ? t.owner.trim() : '',
      dueWindow: typeof t.dueWindow === 'string' ? t.dueWindow.trim() : '',
      dependencies: Array.isArray(t.dependencies)
        ? (t.dependencies as unknown[]).filter((d): d is string => typeof d === 'string')
        : [],
      priority: VALID_PRIORITIES.has(t.priority as string)
        ? (t.priority as TaskBreakdownPriority)
        : 'medium',
      timelineConstraint:
        typeof t.timelineConstraint === 'string' ? t.timelineConstraint.trim() : '',
    });
  }

  if (items.length === 0) {
    return fail([
      {
        field: '<root>',
        message:
          'AI task breakdown returned no valid items (each item must have a non-empty title)',
        received: parsed.length,
      },
    ]);
  }

  return ok(items);
}

// ── Vendor recommendation schema — Story #953 ────────────────────────────────

/**
 * A single ranked vendor recommendation entry.
 *
 * All fields are grounded exclusively in data fetched from the database;
 * the AI model is explicitly instructed not to invent vendor facts.
 */
export interface VendorRecommendationItemSchema {
  /** Database ID of the vendor — allows UI to link back to the record. */
  vendorId: number;
  /** Vendor name as stored in the database. */
  vendorName: string;
  /** Rank position (1 = best). */
  rank: number;
  /** Composite advisory score 0–100 derived only from supplied data. */
  score: number;
  /** Plain-text explanation of the ranking using only the supplied fields. */
  rationale: string;
  /** Short list of observable strengths drawn from the grounded data. */
  strengths: string[];
  /** Short list of observable concerns drawn from the grounded data (may be empty). */
  concerns: string[];
}

/**
 * Structured output for the vendor recommendation AI endpoint (#953).
 */
export interface VendorRecommendationOutputSchema {
  /** Plain-text overall advisory summary. */
  summary: string;
  /** Ranked list of vendor recommendations grounded in real data. */
  recommendations: VendorRecommendationItemSchema[];
  /** Advisory disclaimer that must be surfaced in every UI rendering. */
  advisoryLabel: string;
}

/**
 * Parse and validate the AI model response for the vendor recommendation endpoint.
 *
 * Required field: `recommendations` (non-empty array).
 * Optional fields default to safe empty values.
 * Vendor IDs are cross-validated against the supplied `validVendorIds` set so
 * the AI cannot hallucinate vendor records that were not included in the prompt.
 */
export function parseVendorRecommendationOutput(
  raw: string,
  validVendorIds: Set<number>,
): ParseResult<VendorRecommendationOutputSchema> {
  const jsonResult = extractJson(raw);
  if (!jsonResult.ok) return fail(jsonResult.errors);

  const p = jsonResult.data;
  const errors: SchemaValidationError[] = [];

  if (!Array.isArray(p.recommendations)) {
    errors.push({
      field: 'recommendations',
      message: 'recommendations must be an array',
      received: p.recommendations,
    });
  }

  if (errors.length > 0) return fail(errors);

  const recommendations: VendorRecommendationItemSchema[] = [];
  const rawRecs = p.recommendations as unknown[];

  for (let i = 0; i < rawRecs.length; i++) {
    const item = rawRecs[i];
    if (typeof item !== 'object' || item === null) continue;
    const r = item as Record<string, unknown>;

    // Require vendorId to be a number present in the grounded data set.
    const vendorId =
      typeof r.vendorId === 'number'
        ? r.vendorId
        : typeof r.vendorId === 'string'
          ? parseInt(r.vendorId, 10)
          : NaN;

    if (!Number.isFinite(vendorId) || !validVendorIds.has(vendorId)) {
      // Skip recommendations referencing vendor IDs not in the grounded set —
      // this is the primary hallucination-prevention guard.
      continue;
    }

    if (typeof r.rationale !== 'string' || !r.rationale.trim()) continue;

    const rawScore = typeof r.score === 'number' ? r.score : parseFloat(String(r.score));
    const score = Number.isFinite(rawScore) ? Math.min(100, Math.max(0, Math.round(rawScore))) : 0;

    const rawRank = typeof r.rank === 'number' ? r.rank : parseInt(String(r.rank), 10);
    const rank = Number.isFinite(rawRank) && rawRank > 0 ? rawRank : i + 1;

    recommendations.push({
      vendorId,
      vendorName:
        typeof r.vendorName === 'string' && r.vendorName.trim() ? r.vendorName.trim() : '',
      rank,
      score,
      rationale: r.rationale.trim(),
      strengths: Array.isArray(r.strengths)
        ? (r.strengths as unknown[]).filter((s): s is string => typeof s === 'string')
        : [],
      concerns: Array.isArray(r.concerns)
        ? (r.concerns as unknown[]).filter((c): c is string => typeof c === 'string')
        : [],
    });
  }

  if (recommendations.length === 0) {
    return fail([
      {
        field: 'recommendations',
        message:
          'At least one valid recommendation with a grounded vendorId and non-empty rationale is required',
        received: p.recommendations,
      },
    ]);
  }

  // Sort by rank ascending for deterministic output order.
  recommendations.sort((a, b) => a.rank - b.rank);

  const ADVISORY_FALLBACK =
    'AI advisory only — recommendations are based solely on available vendor data. Verify all information independently before making contracting decisions.';

  return ok({
    summary: typeof p.summary === 'string' ? p.summary.trim() : '',
    recommendations,
    advisoryLabel:
      typeof p.advisoryLabel === 'string' && p.advisoryLabel.trim()
        ? p.advisoryLabel.trim()
        : ADVISORY_FALLBACK,
  });
}

// ── Conflict resolution schema — Story #954 ──────────────────────────────────

/**
 * A single advisory conflict resolution suggestion.
 *
 * All fields are grounded in real timeline activity data fetched from the
 * database; the AI model is explicitly instructed not to fabricate activity
 * names, IDs, or time constraints.
 */
export interface ConflictResolutionSuggestionSchema {
  /** Composite key identifying the conflicting pair: "<activityAId>-<activityBId>". */
  conflictId: string;
  /** Database ID of the first activity in the conflict pair. */
  activityAId: number;
  /** Title of the first activity (from grounded data). */
  activityATitle: string;
  /** Database ID of the second activity in the conflict pair. */
  activityBId: number;
  /** Title of the second activity (from grounded data). */
  activityBTitle: string;
  /** Reason for the conflict (mirrors ConflictReason from timeline-conflict service). */
  reason: string;
  /** Plain-text advisory suggestion for resolving the conflict. */
  suggestion: string;
  /** Notes on how the proposed resolution affects task/activity dependencies. */
  dependencyImpact: string;
  /** Notes on how the proposed resolution affects shared resources (vendor/location). */
  resourceImpact: string;
  /** Optional list of concrete alternative time slot proposals. */
  alternativeSlots: string[];
}

/**
 * Structured output for the timeline conflict resolution AI endpoint (#954).
 */
export interface ConflictResolutionOutputSchema {
  /** Plain-text overview of all detected conflicts and resolution approach. */
  summary: string;
  /** Number of conflicts detected and passed to the model for grounding. */
  conflictCount: number;
  /** One suggestion per detected conflict, advisory-only. */
  suggestions: ConflictResolutionSuggestionSchema[];
  /** Advisory disclaimer that must be surfaced in every UI rendering. */
  advisoryLabel: string;
}

/**
 * Parse and validate the AI model response for the conflict resolution endpoint.
 *
 * Required field: `suggestions` (array; may be empty when no conflicts exist).
 * Optional fields default to safe empty values.
 * Activity IDs are cross-validated against the `validActivityIds` set to prevent
 * the AI from referencing activities not present in the grounded data.
 */
export function parseConflictResolutionOutput(
  raw: string,
  validActivityIds: Set<number>,
): ParseResult<ConflictResolutionOutputSchema> {
  const jsonResult = extractJson(raw);
  if (!jsonResult.ok) return fail(jsonResult.errors);

  const p = jsonResult.data;
  const errors: SchemaValidationError[] = [];

  if (!Array.isArray(p.suggestions)) {
    errors.push({
      field: 'suggestions',
      message: 'suggestions must be an array',
      received: p.suggestions,
    });
  }

  if (errors.length > 0) return fail(errors);

  const suggestions: ConflictResolutionSuggestionSchema[] = [];
  const rawSuggestions = p.suggestions as unknown[];

  for (let i = 0; i < rawSuggestions.length; i++) {
    const item = rawSuggestions[i];
    if (typeof item !== 'object' || item === null) continue;
    const s = item as Record<string, unknown>;

    // Both activity IDs must reference grounded activities.
    const aId =
      typeof s.activityAId === 'number'
        ? s.activityAId
        : typeof s.activityAId === 'string'
          ? parseInt(s.activityAId, 10)
          : NaN;
    const bId =
      typeof s.activityBId === 'number'
        ? s.activityBId
        : typeof s.activityBId === 'string'
          ? parseInt(s.activityBId, 10)
          : NaN;

    if (
      !Number.isFinite(aId) ||
      !Number.isFinite(bId) ||
      !validActivityIds.has(aId) ||
      !validActivityIds.has(bId)
    ) {
      // Drop suggestions referencing activity IDs outside the grounded set.
      continue;
    }

    if (typeof s.suggestion !== 'string' || !s.suggestion.trim()) continue;

    suggestions.push({
      conflictId: `${aId}-${bId}`,
      activityAId: aId,
      activityATitle: typeof s.activityATitle === 'string' ? s.activityATitle.trim() : '',
      activityBId: bId,
      activityBTitle: typeof s.activityBTitle === 'string' ? s.activityBTitle.trim() : '',
      reason: typeof s.reason === 'string' ? s.reason.trim() : 'overlap',
      suggestion: s.suggestion.trim(),
      dependencyImpact: typeof s.dependencyImpact === 'string' ? s.dependencyImpact.trim() : '',
      resourceImpact: typeof s.resourceImpact === 'string' ? s.resourceImpact.trim() : '',
      alternativeSlots: Array.isArray(s.alternativeSlots)
        ? (s.alternativeSlots as unknown[]).filter((sl): sl is string => typeof sl === 'string')
        : [],
    });
  }

  const ADVISORY_FALLBACK =
    'AI advisory only — suggestions are based solely on detected timeline conflict data. Review each proposal carefully before making any scheduling changes.';

  const rawCount = p.conflictCount;
  const conflictCount =
    typeof rawCount === 'number' && Number.isInteger(rawCount) && rawCount >= 0
      ? rawCount
      : suggestions.length;

  return ok({
    summary: typeof p.summary === 'string' ? p.summary.trim() : '',
    conflictCount,
    suggestions,
    advisoryLabel:
      typeof p.advisoryLabel === 'string' && p.advisoryLabel.trim()
        ? p.advisoryLabel.trim()
        : ADVISORY_FALLBACK,
  });
}

// ── Workflow-type dispatcher ───────────────────────────────────────────────────

export type GroundedWorkflowType = 'event' | 'task' | 'rsvp';
export type AiWorkflowType = GroundedWorkflowType | 'general';

/**
 * Dispatches to the correct schema validator for a given grounded workflow
 * type (event / task / rsvp).
 *
 * Returns a `ParseResult` containing the structured data or a list of
 * actionable schema validation errors.
 */
export function parseGroundedOutput(
  workflowType: GroundedWorkflowType,
  raw: string,
): ParseResult<EventSuggestionSchema | TaskSuggestionSchema | RsvpSuggestionSchema> {
  switch (workflowType) {
    case 'event':
      return parseEventSuggestion(raw);
    case 'task':
      return parseTaskSuggestion(raw);
    case 'rsvp':
      return parseRsvpSuggestion(raw);
  }
}

/**
 * Formats a list of `SchemaValidationError` objects into a concise,
 * human-readable string suitable for logging and API error responses.
 */
export function formatValidationErrors(errors: SchemaValidationError[]): string {
  return errors
    .map(
      (e) =>
        `[${e.field}] ${e.message}${e.received !== undefined ? ` (got: ${JSON.stringify(e.received)})` : ''}`,
    )
    .join('; ');
}
