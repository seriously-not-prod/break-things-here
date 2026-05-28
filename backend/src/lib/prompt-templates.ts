/**
 * Prompt Template and Version Management — Story #966
 *
 * Provides a central, versioned registry for all AI system prompts used across
 * the festival planner application.  Moving prompt logic into this module:
 *
 *  - Makes AI behaviour changes traceable (version metadata on every request)
 *  - Enables controlled rollback when a prompt update causes regressions
 *  - Provides a single place to review, test, and document prompt changes
 *  - Keeps the ai-controller free of long inline prompt strings
 *
 * ## Version scheme
 * Templates use a `MAJOR.MINOR.PATCH` version string where:
 *  - PATCH — copy tweaks, formatting improvements
 *  - MINOR — new fields, additional instructions (backward-compatible)
 *  - MAJOR — breaking structural change (e.g. schema change in JSON output)
 *
 * ## Rollback path
 * Every previous version is retained in the registry with `deprecated: true`.
 * To roll back, call `getTemplate(id, '<previous-version>')`.  The deprecated
 * flag signals to callers that the version is not recommended for new requests
 * but is still available for audit / rollback purposes.
 *
 * ## Adding a new version
 * 1. Set `deprecated: true` on the current active entry for the template id.
 * 2. Append a new entry with the same id, incremented version, and new content.
 * 3. Update the tests in `backend/__tests__/prompt-templates.test.ts`.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

/** The context domain a template belongs to. */
export type PromptTemplateContext =
  | 'suggest-event'
  | 'suggest-task'
  | 'suggest-rsvp'
  | 'suggest-general'
  | 'grounded-event'
  | 'grounded-task'
  | 'grounded-rsvp'
  | 'task-breakdown'
  | 'budget-insight'
  | 'vendor-recommendation'
  | 'conflict-resolution'
  | 'analytics-narrative';

/** A single versioned prompt template entry. */
export interface PromptTemplate {
  /** Unique identifier shared across all versions of the same template. */
  readonly id: PromptTemplateContext;
  /** Semantic version string (e.g. '1.0.0'). */
  readonly version: string;
  /** Human-readable summary of what this template instructs the model to do. */
  readonly description: string;
  /** ISO 8601 date the template version was introduced. */
  readonly createdAt: string;
  /** The prompt text to pass as the system message to the AI provider. */
  readonly content: string;
  /**
   * `true` for all non-current versions that have been superseded.
   * Deprecated templates remain available for rollback but are never returned
   * by `getTemplate(id)` without an explicit version pin.
   */
  readonly deprecated?: boolean;
}

/** Metadata snapshot attached to each AI request for traceability. */
export interface PromptVersionMetadata {
  templateId: PromptTemplateContext;
  version: string;
  deprecated: boolean;
}

// ── Registry ──────────────────────────────────────────────────────────────────

/**
 * Master prompt template registry.
 *
 * Rules:
 *  - At most ONE entry per (id, version) pair.
 *  - The latest non-deprecated entry for each id is the active version.
 *  - All superseded versions MUST carry `deprecated: true`.
 *  - Never delete entries — rollback relies on deprecated entries surviving.
 */
const TEMPLATE_REGISTRY: ReadonlyArray<PromptTemplate> = [
  // ── Suggest: event ─────────────────────────────────────────────────────────
  {
    id: 'suggest-event',
    version: '1.0.0',
    description: 'General event planning suggestions (suggest endpoint, event context)',
    createdAt: '2025-01-01',
    content: `You are a festival event planning assistant. Given partial event details, \
suggest a catchy title, a short engaging description, an ideal venue type, \
and 3 promotional tips. Be concise and practical.`,
  },

  // ── Suggest: task ──────────────────────────────────────────────────────────
  {
    id: 'suggest-task',
    version: '1.0.0',
    description: 'Task management suggestions (suggest endpoint, task context)',
    createdAt: '2025-01-01',
    content: `You are a festival event planning assistant specialising in task management. \
Given a task description, suggest a clear action title, a realistic due-date \
range, who should own it, and any dependencies. Be brief.`,
  },

  // ── Suggest: RSVP ─────────────────────────────────────────────────────────
  {
    id: 'suggest-rsvp',
    version: '1.0.0',
    description: 'RSVP management suggestions (suggest endpoint, rsvp context)',
    createdAt: '2025-01-01',
    content: `You are a festival event planning assistant. Given RSVP data context, \
suggest personalised confirmation messages, follow-up reminders, and capacity \
management tips. Be friendly and concise.`,
  },

  // ── Suggest: general ──────────────────────────────────────────────────────
  {
    id: 'suggest-general',
    version: '1.0.0',
    description: 'General planning assistant (suggest endpoint, general context)',
    createdAt: '2025-01-01',
    content: `You are a helpful festival event planning assistant. Answer the user's \
question with practical, actionable advice for running a successful festival event.`,
  },

  // ── Grounded: event ────────────────────────────────────────────────────────
  {
    id: 'grounded-event',
    version: '1.0.0',
    description: 'Grounded event improvement suggestions (grounded endpoint, event workflow)',
    createdAt: '2025-01-01',
    content: `You are a festival event planning AI assistant. You will receive details about a real event including its title, description, type, dates, location, capacity, tags, and current RSVP numbers.
Use ALL provided fields to tailor your response specifically to this event. Return ONLY a valid JSON object with this exact schema (no markdown, no explanation):
{"title":"improved title suggestion","description":"improved description","venueType":"ideal venue type","promotionalTips":["tip 1","tip 2","tip 3"]}`,
  },

  // ── Grounded: task ─────────────────────────────────────────────────────────
  {
    id: 'grounded-task',
    version: '1.0.0',
    description: 'Grounded next-task suggestion (grounded endpoint, task workflow)',
    createdAt: '2025-01-01',
    content: `You are a task management AI for festival events. You will receive an event title and its current task list.
Suggest the next best task and return ONLY a valid JSON object (no markdown, no explanation):
{"actionTitle":"task title","dueDateRange":"suggested due date range","owner":"suggested role/person type","dependencies":["dep1","dep2"]}`,
  },

  // ── Grounded: RSVP ────────────────────────────────────────────────────────
  {
    id: 'grounded-rsvp',
    version: '1.0.0',
    description: 'Grounded RSVP management suggestion (grounded endpoint, rsvp workflow)',
    createdAt: '2025-01-01',
    content: `You are an RSVP management AI for festival events. You will receive attendance statistics for a real event.
Analyze and return ONLY a valid JSON object (no markdown, no explanation):
{"confirmationMessage":"suggested confirmation message","reminderMessage":"suggested reminder message","capacityTip":"capacity management tip"}`,
  },

  // ── Task breakdown ─────────────────────────────────────────────────────────
  {
    id: 'task-breakdown',
    version: '1.0.0',
    description: 'Structured task breakdown for a festival event (task-breakdown endpoint)',
    createdAt: '2025-01-01',
    content: `You are a festival event planning AI specializing in task management and project planning.
Given an event context and the organizer's planning request, produce a detailed task breakdown.
Return ONLY a valid JSON array (no markdown, no explanation) where each element has:
{"title":"task title","owner":"role/person type","dueWindow":"e.g. 2 weeks before event","dependencies":["dep1"],"priority":"low|medium|high|urgent","timelineConstraint":"brief constraint note"}`,
  },

  // ── Budget insight ─────────────────────────────────────────────────────────
  {
    id: 'budget-insight',
    version: '1.0.0',
    description: 'Budget variance and risk analysis for a festival event (budget-insight endpoint)',
    createdAt: '2025-01-01',
    content: `You are a financial risk analyst AI for festival event management.
Analyze the budget data provided and return ONLY a valid JSON object (no markdown, no explanation):
{"recommendations":["at least 3 actionable recommendations"],"riskLevel":"low|medium|high","anomalies":["list of anomalies or empty array"],"summary":"one-sentence executive summary"}`,
  },

  // ── Vendor recommendation ──────────────────────────────────────────────────
  {
    id: 'vendor-recommendation',
    version: '1.0.0',
    description: 'Vendor selection advisory for a festival event (vendor-recommendation endpoint)',
    createdAt: '2025-01-01',
    content: `You are a vendor selection advisory AI for festival event management.
You will receive a list of real vendors with their details. Only reference vendorId values from the provided list — never invent new ones.
Return ONLY a valid JSON array (no markdown, no explanation) where each element has:
{"vendorId":123,"vendorName":"name","score":85,"rationale":"brief rationale","recommendation":"hire|consider|avoid"}`,
  },

  // ── Conflict resolution ────────────────────────────────────────────────────
  {
    id: 'conflict-resolution',
    version: '1.0.0',
    description: 'Timeline conflict resolution advisory for a festival event (conflict-resolution endpoint)',
    createdAt: '2025-01-01',
    content: `You are a timeline conflict resolution advisory AI for festival event management.
Analyze timeline conflicts and return ONLY a valid JSON array (no markdown, no explanation):
{"conflictId":"id","severity":"low|medium|high","suggestion":"resolution suggestion","rationale":"brief rationale"}`,
  },

  // ── Analytics narrative ────────────────────────────────────────────────────
  {
    id: 'analytics-narrative',
    version: '1.0.0',
    description: 'Analytics narrative summary for a festival event (analytics-narrative endpoint)',
    createdAt: '2025-01-01',
    content: `You are a data analytics AI for festival event planning. \
Given aggregated event metrics, produce a concise executive narrative and trend analysis. \
Return ONLY a valid JSON object (no markdown, no explanation) with keys: \
summary (string), trends (array of {metric,direction,observation}), \
dataQuality (\"sufficient\"|\"partial\"|\"insufficient\"), \
recommendations (array of strings).`,
  },
];

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Returns the active (non-deprecated) prompt template for the given id.
 *
 * If `version` is provided, returns that specific version regardless of its
 * deprecated status — this is the rollback path.
 *
 * Throws if no matching template is found so callers never silently fall back
 * to an empty prompt.
 */
export function getTemplate(
  id: PromptTemplateContext,
  version?: string,
): PromptTemplate {
  if (version !== undefined) {
    const pinned = TEMPLATE_REGISTRY.find((t) => t.id === id && t.version === version);
    if (!pinned) {
      throw new Error(
        `Prompt template not found: id="${id}" version="${version}". ` +
          'Check TEMPLATE_REGISTRY in prompt-templates.ts.',
      );
    }
    return pinned;
  }

  // Latest non-deprecated entry for the id (last entry wins).
  const active = [...TEMPLATE_REGISTRY]
    .reverse()
    .find((t) => t.id === id && !t.deprecated);

  if (!active) {
    throw new Error(
      `No active prompt template found for id="${id}". ` +
        'All versions may be deprecated. Provide an explicit version to roll back.',
    );
  }

  return active;
}

/**
 * Returns version metadata for the active template.
 * Attach this to every AI request log entry for traceability (#966).
 */
export function getTemplateMetadata(
  id: PromptTemplateContext,
  version?: string,
): PromptVersionMetadata {
  const t = getTemplate(id, version);
  return {
    templateId: t.id,
    version: t.version,
    deprecated: t.deprecated ?? false,
  };
}

/**
 * Returns every version of a template (including deprecated), newest first.
 * Useful for displaying history in admin tooling or debugging.
 */
export function getTemplateHistory(id: PromptTemplateContext): PromptTemplate[] {
  return [...TEMPLATE_REGISTRY]
    .filter((t) => t.id === id)
    .sort((a, b) => b.version.localeCompare(a.version, undefined, { numeric: true }));
}

/**
 * Returns the current active version for every template context, one entry
 * each.  Suitable for admin dashboards that want to show deployed versions.
 */
export function listActiveTemplates(): PromptTemplate[] {
  const seen = new Set<PromptTemplateContext>();
  const result: PromptTemplate[] = [];

  // Iterate reversed to pick up the latest non-deprecated version per id.
  for (const t of [...TEMPLATE_REGISTRY].reverse()) {
    if (!t.deprecated && !seen.has(t.id)) {
      seen.add(t.id);
      result.push(t);
    }
  }

  return result;
}
