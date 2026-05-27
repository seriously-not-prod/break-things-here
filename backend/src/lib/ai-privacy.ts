/**
 * AI Data Privacy and PII Minimization — Issue #957
 *
 * Provides reusable, tested controls to protect personally-identifiable
 * information (PII) and sensitive data across every AI workflow:
 *
 * - PII detection: regex patterns for email, phone, SSN, credit-card, IP
 *   address, date-of-birth, passport/ID numbers, and street addresses.
 * - Data classification: four-tier taxonomy (PUBLIC → INTERNAL → SENSITIVE →
 *   RESTRICTED) applied to AI-bound fields so callers can enforce policy
 *   without hard-coding field lists in controllers.
 * - Prompt redaction: replaces detected PII in free-text strings with typed
 *   placeholder tokens (e.g. `[EMAIL]`, `[PHONE]`) before the text is
 *   embedded in a provider request, minimising exposure.
 * - Provider payload filtering: removes or redacts SENSITIVE/RESTRICTED
 *   fields from the structured context objects that are serialised into
 *   grounded-workflow prompts.
 * - Safe log sanitisation: strips PII from strings written to application
 *   logs and telemetry so sensitive data is never persisted in log sinks.
 * - Privacy event logging: persists redaction/classification decisions to
 *   `ai_privacy_events` for compliance audit trails.
 *
 * All functions are stateless and pure except `logAiPrivacyEvent`, which
 * performs I/O.  Database failures in `logAiPrivacyEvent` are swallowed so
 * they never affect the caller (same pattern as `logAiSafetyEvent`).
 *
 * ## Provider Payload Examples
 *
 * SAFE payload (fields allowed to reach AI provider):
 * ```json
 * {
 *   "eventTitle": "Summer Festival",
 *   "eventType": "Concert",
 *   "capacity": 500,
 *   "confirmedRsvps": 312,
 *   "status": "published",
 *   "tags": "music,outdoor"
 * }
 * ```
 *
 * UNSAFE payload (fields redacted before provider call):
 * ```json
 * {
 *   "guestEmail": "[EMAIL]",
 *   "guestPhone": "[PHONE]",
 *   "hostAddress": "[ADDRESS]",
 *   "creditCard": "[CREDIT_CARD]"
 * }
 * ```
 */

import { getDatabase } from '../db/database.js';

// ── Sensitivity taxonomy ──────────────────────────────────────────────────────

/**
 * Four-tier sensitivity classification for AI-bound data fields.
 *
 * | Tier        | Description                                           | AI provider |
 * |-------------|-------------------------------------------------------|-------------|
 * | PUBLIC      | Non-personal, freely-shareable event metadata         | ✅ Allowed  |
 * | INTERNAL    | Operational data visible to authenticated users       | ✅ Allowed  |
 * | SENSITIVE   | PII or personal data requiring minimisation           | ⚠️ Redacted |
 * | RESTRICTED  | Regulated data (financial, medical) — never sent      | ❌ Excluded |
 */
export type DataClassification = 'PUBLIC' | 'INTERNAL' | 'SENSITIVE' | 'RESTRICTED';

/** Classification decision for a single named field. */
export interface FieldClassification {
  /** The field name that was classified. */
  field: string;
  /** Assigned sensitivity tier. */
  classification: DataClassification;
  /** Whether this field was redacted/excluded from the AI payload. */
  redacted: boolean;
  /** Human-readable reason for the classification decision. */
  reason: string;
}

/** Result returned by `redactPii`. */
export interface RedactionResult {
  /** The redacted string safe to include in provider prompts and logs. */
  text: string;
  /** `true` when at least one PII pattern was replaced. */
  piiDetected: boolean;
  /** PII categories that were found and replaced (deduplicated). */
  detectedCategories: PiiCategory[];
  /** Total number of replacement substitutions performed. */
  substitutionCount: number;
}

/** Result returned by `filterProviderPayload`. */
export interface PayloadFilterResult {
  /** Sanitised payload safe to serialise into a provider prompt. */
  payload: Record<string, unknown>;
  /** Per-field classification decisions for traceability. */
  classifications: FieldClassification[];
  /** `true` when at least one field was redacted or excluded. */
  filtered: boolean;
}

/** Payload written to `ai_privacy_events` by `logAiPrivacyEvent`. */
export interface AiPrivacyEvent {
  userId: number | undefined;
  eventType: 'pii_detected' | 'field_redacted' | 'payload_filtered' | 'log_sanitised';
  workflowType: string;
  entityId: number | null;
  piiCategories: PiiCategory[];
  fieldNames: string[];
  detail: string;
}

// ── PII detection patterns ────────────────────────────────────────────────────

/**
 * PII category labels used for redaction placeholder tokens and event
 * metadata.  Each category maps directly to a `[TOKEN]` replacement.
 */
export type PiiCategory =
  | 'EMAIL'
  | 'PHONE'
  | 'SSN'
  | 'CREDIT_CARD'
  | 'IP_ADDRESS'
  | 'DATE_OF_BIRTH'
  | 'PASSPORT'
  | 'ADDRESS'
  | 'NATIONAL_ID';

/**
 * Ordered list of PII detection patterns applied by `redactPii`.
 *
 * Each descriptor defines:
 * - `pattern`     — global, case-insensitive RegExp
 * - `category`    — PII category label for logging and the replacement token
 * - `replacement` — the safe placeholder that replaces each match
 *
 * Patterns are applied sequentially.  More-specific patterns (SSN, credit-card)
 * are listed before broader numeric patterns to prevent partial overlap.
 */
const PII_PATTERNS: ReadonlyArray<{
  readonly pattern: RegExp;
  readonly category: PiiCategory;
  readonly replacement: string;
}> = [
  // ── Email addresses ───────────────────────────────────────────────────────
  {
    pattern: /\b[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}\b/g,
    category: 'EMAIL',
    replacement: '[EMAIL]',
  },
  // ── US Social Security Numbers ────────────────────────────────────────────
  {
    pattern: /\b\d{3}-\d{2}-\d{4}\b/g,
    category: 'SSN',
    replacement: '[SSN]',
  },
  // ── Credit / debit card numbers (Visa, Mastercard, Amex, Discover) ────────
  {
    pattern:
      /\b(?:4[0-9]{12}(?:[0-9]{3})?|5[1-5][0-9]{14}|3[47][0-9]{13}|3(?:0[0-5]|[68][0-9])[0-9]{11}|6(?:011|5[0-9]{2})[0-9]{12})\b/g,
    category: 'CREDIT_CARD',
    replacement: '[CREDIT_CARD]',
  },
  // ── International phone numbers (E.164 and common national formats) ────────
  {
    pattern: /(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]\d{3}[-.\s]\d{4}\b/g,
    category: 'PHONE',
    replacement: '[PHONE]',
  },
  // ── IPv4 addresses ────────────────────────────────────────────────────────
  {
    pattern: /\b(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\b/g,
    category: 'IP_ADDRESS',
    replacement: '[IP_ADDRESS]',
  },
  // ── Date-of-birth patterns (ISO 8601 and common national formats) ─────────
  {
    // Matches: YYYY-MM-DD, DD/MM/YYYY, MM/DD/YYYY preceded by DOB/born/birth
    pattern:
      /(?:dob|date[_\s]of[_\s]birth|born[_\s]on|birth[_\s]date)\s*[:\-]?\s*\d{1,4}[-/]\d{1,2}[-/]\d{2,4}/gi,
    category: 'DATE_OF_BIRTH',
    replacement: '[DATE_OF_BIRTH]',
  },
  // ── Passport and national ID numbers ─────────────────────────────────────
  {
    // Simple heuristic: "passport:" or "national id:" followed by alphanumeric
    pattern: /(?:passport|national[_\s]id|id[_\s]number)\s*[:\-]?\s*[A-Z0-9]{6,12}\b/gi,
    category: 'PASSPORT',
    replacement: '[PASSPORT]',
  },
  // ── Street address fragments ──────────────────────────────────────────────
  {
    // Matches numbered street addresses: "123 Main Street", "45 Oak Ave", etc.
    pattern: /\b\d{1,5}\s+[A-Za-z0-9\s]{3,40}(?:street|st|avenue|ave|road|rd|lane|ln|drive|dr|court|ct|boulevard|blvd|way|place|pl)\b/gi,
    category: 'ADDRESS',
    replacement: '[ADDRESS]',
  },
];

// ── Field-level classification catalogue ─────────────────────────────────────

/**
 * Known AI-bound field names and their assigned sensitivity tier.
 *
 * This catalogue is the single source of truth for data classification.
 * Fields not listed here are classified as INTERNAL by default.
 *
 * Classification guide:
 * - PUBLIC      — Event metadata visible to any visitor (title, date, tags)
 * - INTERNAL    — Operational fields shown to authenticated staff (status, capacity)
 * - SENSITIVE   — PII fields that require redaction (email, phone, name)
 * - RESTRICTED  — Regulated data that must never reach AI providers (payment, medical)
 */
const FIELD_CLASSIFICATIONS: ReadonlyMap<string, DataClassification> = new Map([
  // ── PUBLIC — safe to send verbatim ────────────────────────────────────────
  ['title', 'PUBLIC'],
  ['eventTitle', 'PUBLIC'],
  ['event_title', 'PUBLIC'],
  ['description', 'PUBLIC'],
  ['event_type', 'PUBLIC'],
  ['eventType', 'PUBLIC'],
  ['date', 'PUBLIC'],
  ['end_date', 'PUBLIC'],
  ['event_time', 'PUBLIC'],
  ['tags', 'PUBLIC'],
  ['venue_name', 'PUBLIC'],
  ['location', 'PUBLIC'],
  ['status', 'PUBLIC'],
  ['capacity', 'PUBLIC'],
  ['confirmedRsvps', 'PUBLIC'],
  ['totalRsvps', 'PUBLIC'],
  ['confirmed', 'PUBLIC'],
  ['declined', 'PUBLIC'],
  ['pending', 'PUBLIC'],
  ['total', 'PUBLIC'],
  // ── INTERNAL — operational, allowed but not publicly disclosed ────────────
  ['id', 'INTERNAL'],
  ['eventId', 'INTERNAL'],
  ['event_id', 'INTERNAL'],
  ['userId', 'INTERNAL'],
  ['user_id', 'INTERNAL'],
  ['entityId', 'INTERNAL'],
  ['entity_id', 'INTERNAL'],
  ['workflowType', 'INTERNAL'],
  ['workflow_type', 'INTERNAL'],
  ['provider', 'INTERNAL'],
  ['durationMs', 'INTERNAL'],
  ['duration_ms', 'INTERNAL'],
  ['role', 'INTERNAL'],
  ['role_id', 'INTERNAL'],
  // ── SENSITIVE — PII; must be redacted before AI provider call ────────────
  ['email', 'SENSITIVE'],
  ['guestEmail', 'SENSITIVE'],
  ['guest_email', 'SENSITIVE'],
  ['userEmail', 'SENSITIVE'],
  ['user_email', 'SENSITIVE'],
  ['phone', 'SENSITIVE'],
  ['phoneNumber', 'SENSITIVE'],
  ['phone_number', 'SENSITIVE'],
  ['guestPhone', 'SENSITIVE'],
  ['guest_phone', 'SENSITIVE'],
  ['name', 'SENSITIVE'],
  ['fullName', 'SENSITIVE'],
  ['full_name', 'SENSITIVE'],
  ['firstName', 'SENSITIVE'],
  ['first_name', 'SENSITIVE'],
  ['lastName', 'SENSITIVE'],
  ['last_name', 'SENSITIVE'],
  ['displayName', 'SENSITIVE'],
  ['display_name', 'SENSITIVE'],
  ['username', 'SENSITIVE'],
  ['address', 'SENSITIVE'],
  ['hostAddress', 'SENSITIVE'],
  ['host_address', 'SENSITIVE'],
  ['street', 'SENSITIVE'],
  ['ipAddress', 'SENSITIVE'],
  ['ip_address', 'SENSITIVE'],
  ['dateOfBirth', 'SENSITIVE'],
  ['date_of_birth', 'SENSITIVE'],
  ['dob', 'SENSITIVE'],
  // ── RESTRICTED — regulated data; excluded entirely from AI payloads ───────
  ['passwordHash', 'RESTRICTED'],
  ['password_hash', 'RESTRICTED'],
  ['password', 'RESTRICTED'],
  ['creditCard', 'RESTRICTED'],
  ['credit_card', 'RESTRICTED'],
  ['cardNumber', 'RESTRICTED'],
  ['card_number', 'RESTRICTED'],
  ['ssn', 'RESTRICTED'],
  ['socialSecurityNumber', 'RESTRICTED'],
  ['social_security_number', 'RESTRICTED'],
  ['passport', 'RESTRICTED'],
  ['passportNumber', 'RESTRICTED'],
  ['passport_number', 'RESTRICTED'],
  ['nationalId', 'RESTRICTED'],
  ['national_id', 'RESTRICTED'],
  ['medicalRecord', 'RESTRICTED'],
  ['medical_record', 'RESTRICTED'],
  ['apiKey', 'RESTRICTED'],
  ['api_key', 'RESTRICTED'],
  ['secret', 'RESTRICTED'],
  ['token', 'RESTRICTED'],
  ['refreshToken', 'RESTRICTED'],
  ['refresh_token', 'RESTRICTED'],
  ['accessToken', 'RESTRICTED'],
  ['access_token', 'RESTRICTED'],
]);

// ── Core privacy functions ────────────────────────────────────────────────────

/**
 * Classifies a field name against the known sensitivity catalogue.
 *
 * Falls back to INTERNAL for unknown fields so that unrecognised names are
 * treated as operational-but-not-public rather than silently allowed as PUBLIC.
 *
 * @param fieldName - The field key to classify.
 */
export function classifyField(fieldName: string): DataClassification {
  return FIELD_CLASSIFICATIONS.get(fieldName) ?? 'INTERNAL';
}

/**
 * Detects and replaces PII patterns in a free-text string.
 *
 * Applies all `PII_PATTERNS` in sequence, replacing matches with typed
 * placeholder tokens (`[EMAIL]`, `[PHONE]`, etc.).  Returns a structured
 * `RedactionResult` so callers can log events and audit decisions without
 * parsing the resulting string.
 *
 * Safe to call on non-string inputs — returns a clean empty result.
 *
 * @param input - Raw string that may contain PII (e.g. user prompt text).
 */
export function redactPii(input: unknown): RedactionResult {
  if (typeof input !== 'string') {
    return { text: '', piiDetected: false, detectedCategories: [], substitutionCount: 0 };
  }

  let text = input;
  let substitutionCount = 0;
  const detectedSet = new Set<PiiCategory>();

  for (const { pattern, category, replacement } of PII_PATTERNS) {
    // Reset lastIndex before each pass so global patterns don't skip matches
    // when `redactPii` is called multiple times on different strings.
    pattern.lastIndex = 0;
    const matches = text.match(pattern);
    if (matches && matches.length > 0) {
      detectedSet.add(category);
      substitutionCount += matches.length;
      pattern.lastIndex = 0;
      text = text.replace(pattern, replacement);
    }
  }

  return {
    text,
    piiDetected: substitutionCount > 0,
    detectedCategories: Array.from(detectedSet),
    substitutionCount,
  };
}

/**
 * Sanitises a string for safe inclusion in application logs and telemetry.
 *
 * Delegates to `redactPii` and returns only the cleaned text.  Intended for
 * lightweight use in logging paths where the full `RedactionResult` metadata
 * is not needed.
 *
 * @param value - String to sanitise before logging.
 */
export function sanitiseForLog(value: unknown): string {
  if (typeof value !== 'string') return String(value ?? '');
  return redactPii(value).text;
}

/**
 * Filters a structured object payload destined for an AI provider prompt.
 *
 * For each field:
 * - PUBLIC / INTERNAL → included as-is
 * - SENSITIVE         → string values are passed through `redactPii`; non-string
 *                       values are replaced with `[REDACTED]`
 * - RESTRICTED        → field is removed entirely from the output payload
 *
 * Returns a `PayloadFilterResult` containing the sanitised payload and
 * per-field classification decisions for traceability.
 *
 * @param payload - Arbitrary object to sanitise (e.g. event context record).
 */
export function filterProviderPayload(
  payload: Record<string, unknown>,
): PayloadFilterResult {
  const sanitised: Record<string, unknown> = {};
  const classifications: FieldClassification[] = [];
  let filtered = false;

  for (const [field, value] of Object.entries(payload)) {
    const classification = classifyField(field);

    if (classification === 'RESTRICTED') {
      // Exclude entirely — do not include key in the output.
      classifications.push({
        field,
        classification,
        redacted: true,
        reason: 'RESTRICTED field excluded from AI provider payload',
      });
      filtered = true;
      continue;
    }

    if (classification === 'SENSITIVE') {
      if (typeof value === 'string') {
        const result = redactPii(value);
        sanitised[field] = result.text;
        const wasRedacted = result.piiDetected;
        classifications.push({
          field,
          classification,
          redacted: wasRedacted,
          reason: wasRedacted
            ? `SENSITIVE string field redacted (categories: ${result.detectedCategories.join(', ')})`
            : 'SENSITIVE string field — no PII detected, included as-is',
        });
        if (wasRedacted) filtered = true;
      } else if (value !== null && value !== undefined) {
        // Non-string sensitive value (number, object) — replace with token.
        sanitised[field] = '[REDACTED]';
        classifications.push({
          field,
          classification,
          redacted: true,
          reason: 'SENSITIVE non-string field replaced with [REDACTED]',
        });
        filtered = true;
      }
      // null / undefined sensitive fields are omitted silently.
      continue;
    }

    // PUBLIC / INTERNAL: include value as-is.
    sanitised[field] = value;
    classifications.push({
      field,
      classification,
      redacted: false,
      reason: `${classification} field included verbatim`,
    });
  }

  return { payload: sanitised, classifications, filtered };
}

/**
 * Builds a safe telemetry-ready representation of a request/response object
 * by applying `filterProviderPayload` and stringifying the result.
 *
 * Intended for debug logging where the full context object needs to be
 * recorded but must not leak PII into log sinks.
 *
 * @param context - Object to sanitise (e.g. grounded workflow context).
 */
export function buildSafeLogContext(context: Record<string, unknown>): string {
  const { payload } = filterProviderPayload(context);
  return JSON.stringify(payload);
}

// ── Privacy event logging ─────────────────────────────────────────────────────

/**
 * Persists an `AiPrivacyEvent` to the `ai_privacy_events` table for
 * compliance audit and privacy-incident observability.
 *
 * Failures are silently swallowed so a logging error never impacts the
 * in-flight AI request (same pattern as `logAiSafetyEvent`).
 */
export async function logAiPrivacyEvent(event: AiPrivacyEvent): Promise<void> {
  try {
    const db = getDatabase();
    await db.run(
      `INSERT INTO ai_privacy_events
         (user_id, event_type, workflow_type, entity_id,
          pii_categories, field_names, detail, occurred_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
      [
        event.userId ?? null,
        event.eventType,
        event.workflowType,
        event.entityId,
        JSON.stringify(event.piiCategories),
        JSON.stringify(event.fieldNames),
        event.detail,
      ],
    );
  } catch {
    // Best-effort: do not propagate database errors to the caller.
  }
}
