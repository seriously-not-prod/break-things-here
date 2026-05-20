/**
 * Event Custom Fields Controller (#541, #577)
 *
 * Owner/admin/member-with-edit access manages per-event custom fields. Field
 * definitions and current values share one row so the editor stays simple and
 * we still get strict validation per field_type.
 */

import { Request, Response } from 'express';
import { getDatabase } from '../db/database.js';
import { requireEventAccess } from '../utils/event-access.js';

interface AuthRequest extends Request {
  user?: { id: number; email: string; role_id: number };
}

type FieldType = 'text' | 'number' | 'boolean' | 'date' | 'url' | 'select';
const VALID_TYPES: readonly FieldType[] = [
  'text',
  'number',
  'boolean',
  'date',
  'url',
  'select',
] as const;

const MAX_LABEL = 120;
const MAX_KEY = 60;
const MAX_VALUE = 4000;

interface CustomFieldRow {
  id: number;
  event_id: number;
  field_key: string;
  label: string;
  field_type: FieldType;
  options: unknown;
  value: string | null;
  required: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

function isValidKey(key: string): boolean {
  return /^[a-z][a-z0-9_]{0,59}$/.test(key);
}

function isValidUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

function validateValueAgainstType(
  type: FieldType,
  raw: unknown,
  required: boolean,
  options: unknown,
): { ok: true; value: string | null } | { ok: false; error: string } {
  if (raw === null || raw === undefined || raw === '') {
    if (required) return { ok: false, error: 'value is required for this field.' };
    return { ok: true, value: null };
  }
  const asString = typeof raw === 'string' ? raw : String(raw);
  if (asString.length > MAX_VALUE) {
    return { ok: false, error: `value exceeds ${MAX_VALUE} character limit.` };
  }

  switch (type) {
    case 'text':
      return { ok: true, value: asString };
    case 'number': {
      const n = Number(asString);
      if (!Number.isFinite(n)) return { ok: false, error: 'value must be a number.' };
      return { ok: true, value: String(n) };
    }
    case 'boolean': {
      if (asString === 'true' || asString === 'false') return { ok: true, value: asString };
      return { ok: false, error: 'value must be "true" or "false".' };
    }
    case 'date': {
      const d = new Date(asString);
      if (Number.isNaN(d.getTime())) return { ok: false, error: 'value must be a valid date.' };
      return { ok: true, value: d.toISOString().slice(0, 10) };
    }
    case 'url': {
      if (!isValidUrl(asString)) return { ok: false, error: 'value must be a valid http(s) URL.' };
      return { ok: true, value: asString };
    }
    case 'select': {
      const choices = Array.isArray(options) ? options.map(String) : [];
      if (choices.length === 0) {
        return { ok: false, error: 'select field is missing options.' };
      }
      if (!choices.includes(asString)) {
        return { ok: false, error: `value must be one of: ${choices.join(', ')}` };
      }
      return { ok: true, value: asString };
    }
    default:
      return { ok: false, error: 'unsupported field type.' };
  }
}

export async function listFields(req: Request, res: Response): Promise<Response> {
  const authReq = req as AuthRequest;
  const { eventId } = req.params;
  const event = await requireEventAccess(authReq, res, eventId, { allowMembers: true });
  if (!event) return res as Response;

  const db = getDatabase();
  const rows = await db.all<CustomFieldRow>(
    `SELECT id, event_id, field_key, label, field_type, options, value, required, sort_order,
            created_at, updated_at
       FROM event_custom_fields
      WHERE event_id = $1
      ORDER BY sort_order ASC, id ASC`,
    [eventId],
  );
  return res.json({ fields: rows });
}

export async function createField(req: Request, res: Response): Promise<Response> {
  const authReq = req as AuthRequest;
  const { eventId } = req.params;
  const event = await requireEventAccess(authReq, res, eventId, { allowMembers: true });
  if (!event) return res as Response;

  const { field_key, label, field_type, options, value, required, sort_order } = (req.body ??
    {}) as Record<string, unknown>;

  if (typeof field_key !== 'string' || !isValidKey(field_key)) {
    return res.status(400).json({
      error:
        'field_key must be lowercase alphanumeric/underscore (a-z0-9_), starting with a letter.',
    });
  }
  if (typeof label !== 'string' || !label.trim()) {
    return res.status(400).json({ error: 'label is required.' });
  }
  if (typeof field_type !== 'string' || !(VALID_TYPES as readonly string[]).includes(field_type)) {
    return res.status(400).json({ error: `field_type must be one of: ${VALID_TYPES.join(', ')}` });
  }

  const cleanLabel = (label as string).trim().substring(0, MAX_LABEL);
  const cleanKey = (field_key as string).trim().substring(0, MAX_KEY);
  const safeRequired = Boolean(required);
  const safeOptions =
    field_type === 'select'
      ? Array.isArray(options)
        ? (options as unknown[]).map((o) => String(o)).slice(0, 50)
        : null
      : null;

  if (field_type === 'select' && (!safeOptions || safeOptions.length === 0)) {
    return res.status(400).json({ error: 'select field requires a non-empty options array.' });
  }

  let safeValue: string | null = null;
  if (value !== undefined) {
    const v = validateValueAgainstType(field_type as FieldType, value, safeRequired, safeOptions);
    if (!v.ok) return res.status(400).json({ error: v.error });
    safeValue = v.value;
  }

  const db = getDatabase();
  // Uniqueness on (event_id, field_key) — surface as 409 instead of 500.
  const dup = await db.get<{ id: number }>(
    'SELECT id FROM event_custom_fields WHERE event_id = $1 AND field_key = $2',
    [eventId, cleanKey],
  );
  if (dup) return res.status(409).json({ error: 'A field with this key already exists.' });

  const result = await db.run(
    `INSERT INTO event_custom_fields
       (event_id, field_key, label, field_type, options, value, required, sort_order,
        created_by, updated_by)
     VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8, $9, $10)
     RETURNING id`,
    [
      eventId,
      cleanKey,
      cleanLabel,
      field_type,
      safeOptions ? JSON.stringify(safeOptions) : null,
      safeValue,
      safeRequired,
      Number(sort_order) || 0,
      authReq.user?.id ?? null,
      authReq.user?.id ?? null,
    ],
  );

  const created = await db.get<CustomFieldRow>(
    `SELECT id, event_id, field_key, label, field_type, options, value, required, sort_order,
            created_at, updated_at
       FROM event_custom_fields WHERE id = $1`,
    [result.lastID],
  );
  return res.status(201).json(created);
}

export async function updateField(req: Request, res: Response): Promise<Response> {
  const authReq = req as AuthRequest;
  const { eventId, fieldId } = req.params;
  const event = await requireEventAccess(authReq, res, eventId, { allowMembers: true });
  if (!event) return res as Response;

  const db = getDatabase();
  const existing = await db.get<CustomFieldRow>(
    `SELECT id, event_id, field_key, label, field_type, options, value, required, sort_order
       FROM event_custom_fields
      WHERE id = $1 AND event_id = $2`,
    [fieldId, eventId],
  );
  if (!existing) return res.status(404).json({ error: 'Custom field not found.' });

  const { label, options, value, required, sort_order } = (req.body ?? {}) as Record<
    string,
    unknown
  >;

  const nextLabel =
    typeof label === 'string' && label.trim()
      ? label.trim().substring(0, MAX_LABEL)
      : existing.label;
  const nextRequired = required === undefined ? existing.required : Boolean(required);
  const nextSort = sort_order === undefined ? existing.sort_order : Number(sort_order) || 0;
  let nextOptions: unknown = existing.options;
  if (existing.field_type === 'select' && options !== undefined) {
    if (!Array.isArray(options) || options.length === 0) {
      return res.status(400).json({ error: 'select field requires a non-empty options array.' });
    }
    nextOptions = (options as unknown[]).map((o) => String(o)).slice(0, 50);
  }

  let nextValue: string | null = existing.value;
  if (value !== undefined) {
    const v = validateValueAgainstType(existing.field_type, value, nextRequired, nextOptions);
    if (!v.ok) return res.status(400).json({ error: v.error });
    nextValue = v.value;
  } else if (nextRequired && (existing.value === null || existing.value === '')) {
    return res
      .status(400)
      .json({ error: 'Field is now required but has no value set. Provide a value first.' });
  }

  await db.run(
    `UPDATE event_custom_fields
        SET label = $1, options = $2::jsonb, value = $3, required = $4, sort_order = $5,
            updated_by = $6, updated_at = CURRENT_TIMESTAMP
      WHERE id = $7 AND event_id = $8`,
    [
      nextLabel,
      nextOptions ? JSON.stringify(nextOptions) : null,
      nextValue,
      nextRequired,
      nextSort,
      authReq.user?.id ?? null,
      fieldId,
      eventId,
    ],
  );

  const updated = await db.get<CustomFieldRow>(
    `SELECT id, event_id, field_key, label, field_type, options, value, required, sort_order,
            created_at, updated_at
       FROM event_custom_fields WHERE id = $1`,
    [fieldId],
  );
  return res.json(updated);
}

export async function deleteField(req: Request, res: Response): Promise<Response> {
  const authReq = req as AuthRequest;
  const { eventId, fieldId } = req.params;
  const event = await requireEventAccess(authReq, res, eventId, { allowMembers: true });
  if (!event) return res as Response;

  const db = getDatabase();
  const existing = await db.get<{ id: number }>(
    'SELECT id FROM event_custom_fields WHERE id = $1 AND event_id = $2',
    [fieldId, eventId],
  );
  if (!existing) return res.status(404).json({ error: 'Custom field not found.' });

  await db.run('DELETE FROM event_custom_fields WHERE id = ? AND event_id = ?', [fieldId, eventId]);
  return res.json({ message: 'Custom field deleted.' });
}
