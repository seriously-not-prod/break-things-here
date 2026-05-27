/**
 * AI Privacy Middleware — Issue #957
 *
 * Express middleware that enforces PII minimization and data classification
 * rules on every incoming AI workflow request.
 *
 * Responsibilities:
 * - Scan the request body for PII embedded in free-text prompt fields
 * - Classify and filter structured context fields before they reach controllers
 * - Log privacy events to `ai_privacy_events` for compliance audit
 * - Return actionable 400 responses when RESTRICTED data is detected in prompts
 *
 * Usage: mount AFTER `authenticateToken` and BEFORE the AI route handler.
 *
 * ```ts
 * router.post('/api/ai/suggest',
 *   authenticateToken,
 *   requireAiAccess,
 *   applyAiPrivacyControls,
 *   getSuggestion
 * );
 * ```
 */

import { Request, Response, NextFunction } from 'express';
import { redactPii, logAiPrivacyEvent, type PiiCategory } from '../lib/ai-privacy.js';

interface AuthRequest extends Request {
  user?: { id: number; email: string; role_id: number };
}

/**
 * Prompt field names in request bodies that contain free-text user input.
 * Only these fields are subjected to the PII scan middleware pass.
 */
const PROMPT_FIELDS = ['prompt', 'message', 'query', 'text', 'input'] as const;

/**
 * PII categories whose presence in a prompt triggers a hard 400 rejection.
 *
 * These categories represent data that should never appear in AI prompts
 * regardless of context: sending them to an external AI provider would
 * constitute a privacy violation.
 */
const BLOCKING_PII_CATEGORIES = new Set<PiiCategory>(['SSN', 'CREDIT_CARD', 'PASSPORT']);

/**
 * Express middleware that applies PII minimisation to AI request bodies.
 *
 * For each prompt field in the request body:
 * 1. Run `redactPii` to detect and replace PII patterns.
 * 2. If a BLOCKING category (SSN, credit-card, passport) is found:
 *    - Log a `pii_detected` privacy event.
 *    - Return 400 with a clear error message (no PII disclosed in response).
 * 3. If non-blocking PII is found (email, phone, etc.):
 *    - Replace the original field value with the redacted text.
 *    - Log a `pii_detected` privacy event.
 * 4. Call `next()` to continue the middleware chain.
 *
 * The middleware mutates `req.body` in place so downstream handlers always
 * receive privacy-safe prompt text without any code changes.
 */
export async function applyAiPrivacyControls(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const userId = req.user?.id;
  const workflowType =
    (req.body as Record<string, unknown>)?.workflowType ??
    (req.body as Record<string, unknown>)?.context ??
    'unknown';

  const entityId =
    typeof (req.body as Record<string, unknown>)?.entityId === 'number'
      ? ((req.body as Record<string, unknown>).entityId as number)
      : typeof (req.body as Record<string, unknown>)?.eventId === 'number'
        ? ((req.body as Record<string, unknown>).eventId as number)
        : null;

  for (const field of PROMPT_FIELDS) {
    const value = (req.body as Record<string, unknown>)[field];
    if (typeof value !== 'string') continue;

    const result = redactPii(value);
    if (!result.piiDetected) continue;

    // Check whether any blocking PII category was found.
    const blockingFound = result.detectedCategories.filter((c) => BLOCKING_PII_CATEGORIES.has(c));

    if (blockingFound.length > 0) {
      // Log the incident before returning — best effort.
      void logAiPrivacyEvent({
        userId,
        eventType: 'pii_detected',
        workflowType: String(workflowType),
        entityId,
        piiCategories: result.detectedCategories,
        fieldNames: [field],
        detail: `Blocking PII categories detected in prompt field '${field}': ${blockingFound.join(', ')}`,
      });

      res.status(400).json({
        error:
          'The prompt contains sensitive personal data that cannot be sent to AI providers. ' +
          'Please remove personal identifiers and try again.',
      });
      return;
    }

    // Non-blocking PII: redact in-place and log.
    (req.body as Record<string, unknown>)[field] = result.text;
    void logAiPrivacyEvent({
      userId,
      eventType: 'pii_detected',
      workflowType: String(workflowType),
      entityId,
      piiCategories: result.detectedCategories,
      fieldNames: [field],
      detail: `PII redacted from prompt field '${field}' (${result.substitutionCount} substitution(s)): ${result.detectedCategories.join(', ')}`,
    });
  }

  next();
}
