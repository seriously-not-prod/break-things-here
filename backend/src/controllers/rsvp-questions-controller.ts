/**
 * Custom RSVP question authoring + response binding (#413, #443).
 *
 * Organizers (event owners or admins) author questions on the event. Public
 * RSVP submitters answer them through the public token-based endpoint, and
 * planners can read aggregated responses for analytics.
 */

import type { Request, Response } from 'express';
import { getDatabase, type DatabaseAdapter } from '../db/database.js';
import { requireEventAccess } from '../utils/event-access.js';

interface AuthRequest extends Request {
  user?: { id: number; email: string; role_id: number };
}

const QUESTION_TYPES = [
  'short_text',
  'long_text',
  'single_choice',
  'multi_choice',
  'number',
  'boolean',
] as const;
type QuestionType = (typeof QUESTION_TYPES)[number];

function parseOptions(input: unknown): string[] | null {
  if (input === null || input === undefined) return null;
  if (!Array.isArray(input)) return null;
  const out: string[] = [];
  for (const v of input) {
    if (typeof v !== 'string') return null;
    const trimmed = v.trim();
    if (trimmed.length === 0) continue;
    if (trimmed.length > 200) return null;
    out.push(trimmed);
  }
  return out;
}

interface QuestionRow {
  id: number;
  event_id: number;
  prompt: string;
  question_type: QuestionType;
  options: string[] | null;
  required: boolean;
  sort_order: number;
}

/**
 * Validate a response value against a question's type/required/options. Returns
 * a normalized string for storage, or an error message describing the problem.
 */
export function validateAndNormalizeResponse(
  question: QuestionRow,
  raw: unknown,
): { value: string | null } | { error: string } {
  if (raw === null || raw === undefined || raw === '') {
    if (question.required) return { error: `"${question.prompt}" is required.` };
    return { value: null };
  }
  switch (question.question_type) {
    case 'short_text':
    case 'long_text': {
      if (typeof raw !== 'string') return { error: `"${question.prompt}" must be text.` };
      const trimmed = raw.trim();
      const max = question.question_type === 'short_text' ? 200 : 2000;
      if (trimmed.length > max) return { error: `"${question.prompt}" is too long.` };
      if (question.required && trimmed.length === 0)
        return { error: `"${question.prompt}" is required.` };
      return { value: trimmed.length === 0 ? null : trimmed };
    }
    case 'number': {
      const n = typeof raw === 'number' ? raw : Number(raw);
      if (!Number.isFinite(n)) return { error: `"${question.prompt}" must be a number.` };
      return { value: String(n) };
    }
    case 'boolean': {
      const truthy = raw === true || raw === 'true' || raw === 1 || raw === '1';
      const falsy = raw === false || raw === 'false' || raw === 0 || raw === '0';
      if (!truthy && !falsy) return { error: `"${question.prompt}" must be yes/no.` };
      return { value: truthy ? 'true' : 'false' };
    }
    case 'single_choice': {
      if (typeof raw !== 'string')
        return { error: `"${question.prompt}" must be one of the listed options.` };
      const trimmed = raw.trim();
      if (!question.options || !question.options.includes(trimmed))
        return { error: `"${question.prompt}" must be one of the listed options.` };
      return { value: trimmed };
    }
    case 'multi_choice': {
      let arr: unknown[] = [];
      if (Array.isArray(raw)) arr = raw;
      else if (typeof raw === 'string') {
        try {
          const parsed = JSON.parse(raw);
          if (!Array.isArray(parsed)) return { error: `"${question.prompt}" must be a list.` };
          arr = parsed;
        } catch {
          return { error: `"${question.prompt}" must be a list.` };
        }
      } else {
        return { error: `"${question.prompt}" must be a list.` };
      }
      const allowed = new Set(question.options ?? []);
      const picks: string[] = [];
      for (const item of arr) {
        if (typeof item !== 'string' || !allowed.has(item))
          return { error: `"${question.prompt}" contains invalid choice.` };
        if (!picks.includes(item)) picks.push(item);
      }
      if (question.required && picks.length === 0)
        return { error: `"${question.prompt}" is required.` };
      return { value: JSON.stringify(picks) };
    }
  }
  return { error: 'Unsupported question type.' };
}

/** Convenience used by other controllers when they need question rows. */
export async function fetchQuestionsForEvent(
  db: DatabaseAdapter,
  eventId: number,
): Promise<QuestionRow[]> {
  const rows = await db.all<{
    id: number;
    event_id: number;
    prompt: string;
    question_type: QuestionType;
    options: string | string[] | null;
    required: boolean;
    sort_order: number;
  }>(
    `SELECT id, event_id, prompt, question_type, options, required, sort_order
     FROM rsvp_questions WHERE event_id = ? ORDER BY sort_order ASC, id ASC`,
    [eventId],
  );
  return rows.map((r) => ({
    ...r,
    options: Array.isArray(r.options)
      ? r.options
      : typeof r.options === 'string' && r.options.length > 0
        ? (JSON.parse(r.options) as string[])
        : null,
  }));
}

/** GET /api/events/:eventId/rsvp-questions */
export async function listQuestions(req: Request, res: Response): Promise<Response> {
  const authReq = req as AuthRequest;
  const { eventId } = req.params;
  const event = await requireEventAccess(authReq, res, eventId, { allowMembers: true });
  if (!event) return res as Response;
  const db = getDatabase();
  const questions = await fetchQuestionsForEvent(db, Number(eventId));
  return res.json({ questions });
}

/** POST /api/events/:eventId/rsvp-questions */
export async function createQuestion(req: Request, res: Response): Promise<Response> {
  const authReq = req as AuthRequest;
  const { eventId } = req.params;
  const event = await requireEventAccess(authReq, res, eventId, { ownerOnly: true });
  if (!event) return res as Response;

  const { prompt, question_type, options, required, sort_order } = (req.body ?? {}) as {
    prompt?: unknown;
    question_type?: unknown;
    options?: unknown;
    required?: unknown;
    sort_order?: unknown;
  };
  if (typeof prompt !== 'string' || !prompt.trim() || prompt.trim().length > 500) {
    return res.status(400).json({ error: 'prompt is required (≤500 chars).' });
  }
  if (typeof question_type !== 'string' || !QUESTION_TYPES.includes(question_type as QuestionType)) {
    return res.status(400).json({ error: 'question_type must be one of: ' + QUESTION_TYPES.join(', ') });
  }
  let parsedOptions: string[] | null = null;
  if (question_type === 'single_choice' || question_type === 'multi_choice') {
    parsedOptions = parseOptions(options);
    if (!parsedOptions || parsedOptions.length < 1) {
      return res.status(400).json({ error: 'options must be a non-empty list of strings.' });
    }
  }

  const db = getDatabase();
  const result = await db.run(
    `INSERT INTO rsvp_questions (event_id, prompt, question_type, options, required, sort_order)
     VALUES (?, ?, ?, ?::jsonb, ?, ?) RETURNING id`,
    [
      eventId,
      prompt.trim(),
      question_type,
      parsedOptions ? JSON.stringify(parsedOptions) : null,
      Boolean(required),
      Number.isInteger(sort_order) ? (sort_order as number) : 0,
    ],
  );
  const row = await db.get(
    `SELECT id, event_id, prompt, question_type, options, required, sort_order, created_at
     FROM rsvp_questions WHERE id = ?`,
    [result.lastID],
  );
  return res.status(201).json({ question: row });
}

/** PATCH /api/events/:eventId/rsvp-questions/:id */
export async function updateQuestion(req: Request, res: Response): Promise<Response> {
  const authReq = req as AuthRequest;
  const { eventId, id } = req.params;
  const event = await requireEventAccess(authReq, res, eventId, { ownerOnly: true });
  if (!event) return res as Response;

  const db = getDatabase();
  const existing = await db.get<{ id: number; question_type: QuestionType }>(
    'SELECT id, question_type FROM rsvp_questions WHERE id = ? AND event_id = ?',
    [id, eventId],
  );
  if (!existing) return res.status(404).json({ error: 'Question not found.' });

  const fields: string[] = [];
  const params: (string | number | boolean | null)[] = [];

  const body = (req.body ?? {}) as Record<string, unknown>;
  if (typeof body.prompt === 'string') {
    if (!body.prompt.trim() || body.prompt.length > 500) {
      return res.status(400).json({ error: 'prompt invalid.' });
    }
    fields.push('prompt = ?');
    params.push(body.prompt.trim());
  }
  if (typeof body.required === 'boolean') {
    fields.push('required = ?');
    params.push(body.required);
  }
  if (Number.isInteger(body.sort_order)) {
    fields.push('sort_order = ?');
    params.push(body.sort_order as number);
  }
  if (Array.isArray(body.options)) {
    if (existing.question_type !== 'single_choice' && existing.question_type !== 'multi_choice') {
      return res
        .status(400)
        .json({ error: 'options can only be set on single_choice/multi_choice questions.' });
    }
    const opts = parseOptions(body.options);
    if (!opts || opts.length < 1)
      return res.status(400).json({ error: 'options must be non-empty list of strings.' });
    fields.push('options = ?::jsonb');
    params.push(JSON.stringify(opts));
  }
  if (fields.length === 0) {
    return res.status(400).json({ error: 'No fields to update.' });
  }
  fields.push('updated_at = CURRENT_TIMESTAMP');
  params.push(id);
  await db.run(`UPDATE rsvp_questions SET ${fields.join(', ')} WHERE id = ?`, params);
  const updated = await db.get(
    `SELECT id, event_id, prompt, question_type, options, required, sort_order
     FROM rsvp_questions WHERE id = ?`,
    [id],
  );
  return res.json({ question: updated });
}

/** DELETE /api/events/:eventId/rsvp-questions/:id */
export async function deleteQuestion(req: Request, res: Response): Promise<Response> {
  const authReq = req as AuthRequest;
  const { eventId, id } = req.params;
  const event = await requireEventAccess(authReq, res, eventId, { ownerOnly: true });
  if (!event) return res as Response;
  const db = getDatabase();
  const r = await db.run(
    'DELETE FROM rsvp_questions WHERE id = ? AND event_id = ?',
    [id, eventId],
  );
  if ((r.changes ?? 0) === 0) return res.status(404).json({ error: 'Question not found.' });
  return res.json({ deleted: true });
}

/**
 * POST /api/public/rsvp/:token/responses
 * Body: { responses: { [questionId: string]: unknown } }
 */
export async function submitResponses(req: Request, res: Response): Promise<Response> {
  const { token } = req.params;
  if (!token) return res.status(404).json({ error: 'Token not found.' });

  const db = getDatabase();
  const tokenRow = await db.get<{ rsvp_id: number; event_id: number }>(
    `SELECT t.rsvp_id, r.event_id
     FROM rsvp_access_tokens t
     JOIN rsvps r ON r.id = t.rsvp_id
     WHERE t.token = ? AND t.revoked_at IS NULL`,
    [token],
  );
  if (!tokenRow) return res.status(404).json({ error: 'Token not found.' });

  const body = (req.body ?? {}) as { responses?: Record<string, unknown> };
  if (!body.responses || typeof body.responses !== 'object') {
    return res.status(400).json({ error: 'responses object is required.' });
  }

  const questions = await fetchQuestionsForEvent(db, tokenRow.event_id);
  if (questions.length === 0) return res.json({ saved: 0 });

  const errors: string[] = [];
  const accepted: Array<{ questionId: number; value: string | null }> = [];

  for (const q of questions) {
    const raw = body.responses[String(q.id)];
    const result = validateAndNormalizeResponse(q, raw);
    if ('error' in result) {
      errors.push(result.error);
    } else {
      accepted.push({ questionId: q.id, value: result.value });
    }
  }
  if (errors.length > 0) {
    return res.status(400).json({ error: 'Validation failed.', details: errors });
  }

  for (const { questionId, value } of accepted) {
    await db.run(
      `INSERT INTO rsvp_question_responses (rsvp_id, question_id, response, created_at, updated_at)
       VALUES (?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
       ON CONFLICT (rsvp_id, question_id)
       DO UPDATE SET response = EXCLUDED.response, updated_at = CURRENT_TIMESTAMP`,
      [tokenRow.rsvp_id, questionId, value],
    );
  }
  return res.json({ saved: accepted.length });
}

/** GET /api/events/:eventId/rsvp-questions/responses — planner-only digest */
export async function listResponses(req: Request, res: Response): Promise<Response> {
  const authReq = req as AuthRequest;
  const { eventId } = req.params;
  const event = await requireEventAccess(authReq, res, eventId, { allowMembers: true });
  if (!event) return res as Response;
  const db = getDatabase();
  const rows = await db.all(
    `SELECT r.id, r.rsvp_id, r.question_id, r.response, r.updated_at,
            rs.name AS guest_name, rs.email AS guest_email,
            q.prompt, q.question_type
     FROM rsvp_question_responses r
     JOIN rsvp_questions q ON q.id = r.question_id
     JOIN rsvps rs        ON rs.id = r.rsvp_id
     WHERE q.event_id = ?
     ORDER BY q.sort_order ASC, r.updated_at DESC`,
    [eventId],
  );
  return res.json({ responses: rows });
}
