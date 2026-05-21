import { Request, Response } from 'express';
import ExcelJS from 'exceljs';
import { getDatabase } from '../db/database.js';
import { createRsvpNotification } from './notifications-controller.js';
import { logActivity } from './activity-feed-controller.js';
import { requireEventAccess } from '../utils/event-access.js';
import { addToWaitlist, runPromotion } from './waitlist-controller.js';
import {
  toCanonicalStatus,
  normalizeLegacyRsvpStatusInput,
  RSVP_STATUS_INPUT_ALIAS_LIST,
  type CanonicalRsvpStatus,
} from '../utils/rsvp-taxonomy.js';
import {
  computeProfileCompleteness,
  type GuestProfileFields,
} from '../utils/profile-completeness.js';
import { listMealOptionsForEvent } from './meal-options-controller.js';
import { AUDIT_ACTIONS, logMutation } from '../utils/audit-log.js';
import { captureEntityVersion } from './entity-versions-controller.js';

interface RsvpRow {
  id: number;
  event_id: number;
  canonical_status: string;
  guests: number;
}

/**
 * BRD v2 guest profile fields that may be supplied on create/update (#582).
 * Kept as a single list so create + update + import share the same column
 * names and the canonical-status / completeness recalculation paths run in
 * one place.
 */
const PROFILE_FIELDS = [
  'phone',
  'dietary_restriction',
  'accessibility_needs',
  'plus_one',
  'plus_one_name',
  'guest_group',
  'rsvp_deadline',
  'address_line1',
  'address_line2',
  'city',
  'state_region',
  'postal_code',
  'country',
  'company',
  'title',
  'relation_type',
  'age_group',
  'emergency_contact_name',
  'emergency_contact_phone',
  'meal_choice',
] as const;
type ProfileField = (typeof PROFILE_FIELDS)[number];

interface RsvpFull extends RsvpRow, GuestProfileFields {
  name?: string | null;
  email?: string | null;
  checked_in?: boolean;
  checked_in_at?: string | null;
  late_arrival?: boolean | null;
  arrival_delay_minutes?: number | null;
  waitlist_position?: number | null;
  meal_choice?: string | null;
  profile_completeness?: number;
}

async function recomputeCompleteness(rsvpId: number): Promise<void> {
  const db = getDatabase();
  const row = await db.get<GuestProfileFields>(
    `SELECT name, email, phone, address_line1, city, postal_code, country,
            company, title, relation_type, age_group,
            emergency_contact_name, emergency_contact_phone,
            dietary_restriction, accessibility_needs
     FROM rsvps WHERE id = $1`,
    [rsvpId],
  );
  if (!row) return;
  const score = computeProfileCompleteness(row);
  await db.run(`UPDATE rsvps SET profile_completeness = $1 WHERE id = $2`, [score, rsvpId]);
}

async function recomputeCanonicalStatus(
  rsvpId: number,
  override?: CanonicalRsvpStatus,
): Promise<void> {
  const db = getDatabase();
  if (override) {
    await db.run(`UPDATE rsvps SET canonical_status = $1 WHERE id = $2`, [override, rsvpId]);
    return;
  }
  // Note: With the status column dropped (#770), canonical_status is now the single source of truth.
  // If override is not provided, the current canonical_status is kept as-is.
  // Most state transitions (waitlist, check-in) explicitly set canonical_status.
}

/**
 * Reject RSVP submissions / edits made after the event's RSVP deadline (#585).
 * Authenticated organizers/admins are still allowed to edit so they can
 * accommodate phone-in requests after the cutoff.
 *
 * Deadlines are stored and compared in UTC. The DB column is a TIMESTAMP; the
 * `pg` driver returns it as a JS `Date` parsed in UTC. Comparison is therefore
 * UTC-safe — both sides become millisecond epoch values via `.getTime()`.
 */
async function isDeadlinePassed(
  eventId: string | number,
): Promise<{ passed: boolean; deadline: string | null }> {
  const db = getDatabase();
  const row = await db.get<{ rsvp_deadline: string | Date | null }>(
    `SELECT rsvp_deadline FROM events WHERE id = $1 AND deleted_at IS NULL`,
    [eventId],
  );
  if (!row?.rsvp_deadline) return { passed: false, deadline: null };
  const deadline =
    row.rsvp_deadline instanceof Date ? row.rsvp_deadline : new Date(row.rsvp_deadline);
  if (Number.isNaN(deadline.getTime())) {
    return { passed: false, deadline: String(row.rsvp_deadline) };
  }
  return { passed: Date.now() > deadline.getTime(), deadline: deadline.toISOString() };
}

/**
 * Inbound deadline strings must be RFC-3339 UTC (i.e. ending with `Z`). We
 * reject ambiguous timezone-less inputs so a guest in one TZ cannot extend
 * their cutoff for guests in another. Documented contract — see PR #644.
 */
const ISO_UTC_REGEX = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,6})?)?Z$/;
function isUtcIso8601(value: unknown): value is string {
  return typeof value === 'string' && ISO_UTC_REGEX.test(value);
}

interface AuthRequest extends Request {
  user?: { id: number; email: string; role_id: number };
}

function parseGuests(value: unknown): number {
  if (value === undefined || value === null || value === '') return 1;
  const guests = Number(value);
  if (!Number.isInteger(guests) || guests < 1) {
    throw new Error('Guest count must be a positive integer.');
  }
  return guests;
}

function isGoing(status?: string): boolean {
  return status === 'confirmed';
}

async function getEventCapacity(
  db: ReturnType<typeof getDatabase>,
  eventId: string,
): Promise<number | null> {
  const event = await db.get<{ capacity: number | null }>(
    'SELECT capacity FROM events WHERE id = $1 AND deleted_at IS NULL',
    [eventId],
  );
  return event?.capacity ?? null;
}

async function getGoingGuestsTotal(
  db: ReturnType<typeof getDatabase>,
  eventId: string,
  excludeRsvpId?: string,
): Promise<number> {
  // Waitlisted entries keep canonical_status='waitlist' but are not occupying a
  // confirmed seat — exclude them so capacity checks measure actual confirmed guests.
  const rows = await db.all<{ total_guests: number }>(
    `SELECT COALESCE(SUM(guests), 0) AS total_guests
     FROM rsvps
     WHERE event_id = $1 AND canonical_status = 'confirmed' AND waitlist_position IS NULL${excludeRsvpId ? ' AND id <> $3' : ''}`,
    excludeRsvpId ? [eventId, excludeRsvpId] : [eventId],
  );
  return rows[0]?.total_guests ?? 0;
}

function csvEscape(value: unknown): string {
  const text = String(value ?? '');
  return `"${text.replace(/"/g, '""')}"`;
}

const IMPORT_TEMPLATE_COLUMNS = [
  'name',
  'email',
  'phone',
  'guests',
  'canonical_status',
  'notes',
  'dietary_restriction',
  'accessibility_needs',
  'plus_one',
  'plus_one_name',
  'guest_group',
  'company',
  'title',
  'relation_type',
  'age_group',
  'address_line1',
  'address_line2',
  'city',
  'state_region',
  'postal_code',
  'country',
  'emergency_contact_name',
  'emergency_contact_phone',
  'meal_choice',
] as const;

/** GET /api/events/:eventId/rsvps */
export async function listRsvps(req: Request, res: Response): Promise<Response> {
  const authReq = req as AuthRequest;
  const db = getDatabase();
  const { eventId } = req.params;
  const event = await requireEventAccess(authReq, res, eventId, { allowMembers: true });
  if (!event) return res as Response;
  const rows = await db.all('SELECT * FROM rsvps WHERE event_id = $1 ORDER BY created_at DESC', [
    eventId,
  ]);
  return res.json({ rsvps: rows });
}

/** GET /api/public/events/:eventId */
export async function getPublicRsvpContext(req: Request, res: Response): Promise<Response> {
  const db = getDatabase();
  const { eventId } = req.params;
  const event = await db.get<{
    id: number;
    title: string;
    description: string | null;
    location: string | null;
    date: string;
    event_date: string;
    capacity: number | null;
    rsvp_deadline: string | null;
    waitlist_enabled: boolean | null;
  }>(
    `SELECT id, title, description, location, date, date AS event_date, capacity,
            rsvp_deadline, waitlist_enabled
     FROM events WHERE id = $1 AND deleted_at IS NULL`,
    [eventId],
  );
  if (!event) return res.status(404).json({ error: 'Event not found.' });

  const goingGuests = await getGoingGuestsTotal(db, eventId);
  const remainingCapacity =
    event.capacity === null ? null : Math.max(event.capacity - goingGuests, 0);

  // Public-facing meal options (#591) so the no-login RSVP page can render
  // a meal picker. Inactive options are hidden.
  const mealOptions = await listMealOptionsForEvent(eventId, true);

  // Deadline indicator drives the public form's read-only state (#585, #588).
  const deadline = await isDeadlinePassed(eventId);

  return res.json({
    event,
    remainingCapacity,
    mealOptions: mealOptions.map((o) => ({ id: o.id, name: o.name, description: o.description })),
    rsvpDeadline: event.rsvp_deadline,
    deadlinePassed: deadline.passed,
    waitlistEnabled: Boolean(event.waitlist_enabled),
  });
}

/** POST /api/events/:eventId/rsvps  (public — no auth) */
export async function createRsvp(req: Request, res: Response): Promise<Response> {
  const { eventId } = req.params;
  const body = (req.body ?? {}) as Record<string, unknown>;
  const name = body.name as string | undefined;
  const email = body.email as string | undefined;
  const status = body.status as string | undefined;
  const notes = body.notes as string | undefined;
  const guests = body.guests as number | string | undefined;
  const waitlist = body.waitlist as boolean | undefined;

  const normalizedStatus =
    status === undefined
      ? 'pending'
      : toCanonicalStatus(normalizeLegacyRsvpStatusInput(status) || 'Pending');
  if (status !== undefined && !normalizeLegacyRsvpStatusInput(status)) {
    return res.status(400).json({
      error: 'Invalid RSVP status.',
      allowed: RSVP_STATUS_INPUT_ALIAS_LIST,
    });
  }

  if (!name?.trim()) return res.status(400).json({ error: 'Name is required.' });
  if (!email?.trim()) return res.status(400).json({ error: 'Email is required.' });

  let guestCount: number;
  try {
    guestCount = parseGuests(guests);
  } catch (error) {
    return res
      .status(400)
      .json({ error: error instanceof Error ? error.message : 'Invalid guest count.' });
  }

  const db = getDatabase();
  const event = await db.get<{ id: number }>(
    'SELECT id FROM events WHERE id = $1 AND deleted_at IS NULL',
    [eventId],
  );
  if (!event) return res.status(404).json({ error: 'Event not found.' });

  // Deadline enforcement (#585) — public submissions are rejected after the
  // cutoff. Authenticated organizers retain the ability to add late RSVPs.
  const authReq = req as AuthRequest;
  if (!authReq.user) {
    const dl = await isDeadlinePassed(eventId);
    if (dl.passed) {
      return res.status(403).json({
        error: 'The RSVP deadline for this event has passed.',
        rsvp_deadline: dl.deadline,
      });
    }
  }

  // Per-guest rsvp_deadline override must be UTC-explicit so cross-TZ
  // submissions are unambiguous (#585).
  if (
    body.rsvp_deadline !== undefined &&
    body.rsvp_deadline !== null &&
    body.rsvp_deadline !== ''
  ) {
    if (!isUtcIso8601(body.rsvp_deadline)) {
      return res.status(400).json({
        error: 'rsvp_deadline must be a UTC ISO-8601 timestamp ending in "Z".',
      });
    }
  }

  // meal_choice must match an active meal option for the event (#591). Empty
  // submission is allowed — meals are optional.
  if (typeof body.meal_choice === 'string' && body.meal_choice.trim()) {
    const choice = body.meal_choice.trim();
    const active = await listMealOptionsForEvent(eventId, true);
    if (active.length > 0) {
      const allowed = active.map((o) => o.name);
      if (!allowed.includes(choice)) {
        return res.status(400).json({
          error: 'Unknown meal_choice for this event.',
          allowed,
        });
      }
    }
  }

  // Capacity handling (#442): when full, opt-in waitlisting puts the guest in
  // the queue with status preserved so promotion is a one-step move.
  const capacity = await getEventCapacity(db, eventId);
  let queueOnCreate = false;
  if (capacity !== null && normalizedStatus === 'confirmed') {
    const currentGoing = await getGoingGuestsTotal(db, eventId);
    if (currentGoing + guestCount > capacity) {
      if (waitlist === true) {
        queueOnCreate = true;
      } else {
        return res.status(409).json({ error: 'Event capacity exceeded.', waitlistAvailable: true });
      }
    }
  }

  // Determine source based on whether request is authenticated
  const source = authReq.user ? 'internal' : 'public';

  // Build the optional-field part of the insert dynamically so adding columns
  // does not require touching every code path.
  const profileValues: Record<ProfileField, unknown> = {
    phone: typeof body.phone === 'string' ? body.phone.trim() || null : null,
    dietary_restriction:
      typeof body.dietary_restriction === 'string'
        ? body.dietary_restriction.trim() || 'None'
        : 'None',
    accessibility_needs:
      typeof body.accessibility_needs === 'string' ? body.accessibility_needs.trim() || null : null,
    plus_one: Boolean(body.plus_one),
    plus_one_name:
      typeof body.plus_one_name === 'string' ? body.plus_one_name.trim() || null : null,
    guest_group: typeof body.guest_group === 'string' ? body.guest_group.trim() || null : null,
    rsvp_deadline:
      typeof body.rsvp_deadline === 'string' && body.rsvp_deadline ? body.rsvp_deadline : null,
    address_line1:
      typeof body.address_line1 === 'string' ? body.address_line1.trim() || null : null,
    address_line2:
      typeof body.address_line2 === 'string' ? body.address_line2.trim() || null : null,
    city: typeof body.city === 'string' ? body.city.trim() || null : null,
    state_region: typeof body.state_region === 'string' ? body.state_region.trim() || null : null,
    postal_code: typeof body.postal_code === 'string' ? body.postal_code.trim() || null : null,
    country: typeof body.country === 'string' ? body.country.trim() || null : null,
    company: typeof body.company === 'string' ? body.company.trim() || null : null,
    title: typeof body.title === 'string' ? body.title.trim() || null : null,
    relation_type:
      typeof body.relation_type === 'string' ? body.relation_type.trim() || null : null,
    age_group: typeof body.age_group === 'string' ? body.age_group.trim() || null : null,
    emergency_contact_name:
      typeof body.emergency_contact_name === 'string'
        ? body.emergency_contact_name.trim() || null
        : null,
    emergency_contact_phone:
      typeof body.emergency_contact_phone === 'string'
        ? body.emergency_contact_phone.trim() || null
        : null,
    meal_choice: typeof body.meal_choice === 'string' ? body.meal_choice.trim() || null : null,
  };

  const columns = [
    'event_id',
    'name',
    'email',
    'guests',
    'canonical_status',
    'notes',
    'source',
    ...PROFILE_FIELDS,
  ];
  const placeholders = columns.map(() => '?').join(', ');
  const values = [
    eventId,
    name.trim(),
    email.trim().toLowerCase(),
    guestCount,
    normalizedStatus || 'pending',
    notes?.trim() || null,
    source,
    ...PROFILE_FIELDS.map((f) => profileValues[f]),
  ];

  const result = await db.run(
    `INSERT INTO rsvps (${columns.join(', ')}) VALUES (${placeholders}) RETURNING id`,
    values,
  );

  if (queueOnCreate && result.lastID) {
    await addToWaitlist(db, result.lastID, Number(eventId));
  }
  if (result.lastID) {
    await recomputeCanonicalStatus(result.lastID, queueOnCreate ? 'waitlist' : undefined);
    await recomputeCompleteness(result.lastID);
  }

  const rsvp = await db.get<RsvpFull>('SELECT * FROM rsvps WHERE id = $1', [result.lastID]);
  if (rsvp?.id) {
    await captureEntityVersion(
      'rsvp',
      rsvp.id,
      rsvp as unknown as Record<string, unknown>,
      authReq.user?.id ?? null,
      'RSVP created',
    );
  }

  // Fire notification to event owner when a new RSVP is confirmed
  if ((normalizedStatus || 'pending') === 'confirmed' && !queueOnCreate) {
    const ev = await db.get<{ created_by: number }>('SELECT created_by FROM events WHERE id = $1', [
      eventId,
    ]);
    if (ev) {
      await createRsvpNotification(Number(eventId), ev.created_by, name.trim());
    }
  }

  if (rsvp) {
    // Public/no-auth surface: fall back to submitter email so the audit row
    // is attributable even when authReq.user is undefined.
    await logMutation(
      db,
      authReq,
      AUDIT_ACTIONS.RSVP_CREATE,
      'rsvp',
      rsvp.id,
      { eventId, waitlisted: queueOnCreate },
      email,
    );
  }
  return res.status(201).json({ rsvp, waitlisted: queueOnCreate });
}

/** PATCH /api/events/:eventId/rsvps/:id */
export async function updateRsvp(req: Request, res: Response): Promise<Response> {
  const authReq = req as AuthRequest;
  const db = getDatabase();
  const { id, eventId } = req.params;
  const event = await requireEventAccess(authReq, res, eventId, { allowMembers: true });
  if (!event) return res as Response;
  const rsvp = await db.get<RsvpRow>('SELECT * FROM rsvps WHERE id = $1 AND event_id = $2', [
    id,
    eventId,
  ]);
  if (!rsvp) return res.status(404).json({ error: 'RSVP not found.' });

  const body = (req.body ?? {}) as Record<string, unknown>;
  const fields: string[] = [];
  const params: (string | number | boolean | null)[] = [];

  let nextGuests = Number(rsvp.guests ?? 1);
  let nextStatus = rsvp.canonical_status;
  if (body.guests !== undefined) {
    const parsed = parseGuests(body.guests);
    nextGuests = parsed;
    fields.push('guests = ?');
    params.push(parsed);
  }
  if (body.status !== undefined) {
    const normalized = normalizeLegacyRsvpStatusInput(body.status);
    if (!normalized) {
      return res.status(400).json({
        error: 'Invalid RSVP status.',
        allowed: RSVP_STATUS_INPUT_ALIAS_LIST,
      });
    }
    const canonical = toCanonicalStatus(normalized);
    nextStatus = canonical;
    fields.push('canonical_status = ?');
    params.push(canonical);
  }

  if (isGoing(nextStatus)) {
    const capacity = await getEventCapacity(db, String(rsvp.event_id));
    if (capacity !== null) {
      const currentGoing = await getGoingGuestsTotal(db, String(rsvp.event_id), String(id));
      if (currentGoing + nextGuests > capacity) {
        return res.status(409).json({ error: 'Event capacity exceeded.' });
      }
    }
  }

  if (typeof body.name === 'string') {
    fields.push('name = ?');
    params.push(body.name.trim());
  }
  if (typeof body.email === 'string') {
    fields.push('email = ?');
    params.push(body.email.trim().toLowerCase());
  }
  if (body.notes !== undefined) {
    fields.push('notes = ?');
    params.push(typeof body.notes === 'string' && body.notes.trim() ? body.notes.trim() : null);
  }

  if (
    body.rsvp_deadline !== undefined &&
    body.rsvp_deadline !== null &&
    body.rsvp_deadline !== ''
  ) {
    if (!isUtcIso8601(body.rsvp_deadline)) {
      return res.status(400).json({
        error: 'rsvp_deadline must be a UTC ISO-8601 timestamp ending in "Z".',
      });
    }
  }

  if (typeof body.meal_choice === 'string' && body.meal_choice.trim()) {
    const choice = body.meal_choice.trim();
    const active = await listMealOptionsForEvent(String(rsvp.event_id), true);
    if (active.length > 0 && !active.some((o) => o.name === choice)) {
      return res.status(400).json({
        error: 'Unknown meal_choice for this event.',
        allowed: active.map((o) => o.name),
      });
    }
  }

  for (const field of PROFILE_FIELDS) {
    if (body[field] === undefined) continue;
    const raw = body[field];
    if (field === 'plus_one') {
      fields.push(`${field} = ?`);
      params.push(Boolean(raw));
      continue;
    }
    if (field === 'dietary_restriction') {
      fields.push(`${field} = ?`);
      params.push(typeof raw === 'string' && raw.trim() ? raw.trim() : 'None');
      continue;
    }
    fields.push(`${field} = ?`);
    if (raw === null) {
      params.push(null);
      continue;
    }
    params.push(typeof raw === 'string' ? raw.trim() || null : (raw as string));
  }

  if (fields.length === 0) return res.status(400).json({ error: 'No fields to update.' });

  fields.push('updated_at = CURRENT_TIMESTAMP');
  params.push(id);

  await db.run(`UPDATE rsvps SET ${fields.join(', ')} WHERE id = $1`, params);
  await recomputeCanonicalStatus(Number(id));
  await recomputeCompleteness(Number(id));
  const updated = await db.get<RsvpFull>('SELECT * FROM rsvps WHERE id = $1', [id]);
  if (updated?.id) {
    await captureEntityVersion(
      'rsvp',
      updated.id,
      updated as unknown as Record<string, unknown>,
      authReq.user?.id ?? null,
      'RSVP updated',
    );
  }

  if (nextStatus === 'confirmed') {
    await logActivity(
      rsvp.event_id,
      authReq.user?.id ?? null,
      'rsvp_confirmed',
      `${(updated as RsvpRow & { name?: string }).name ?? 'A guest'} confirmed attendance`,
      `/events/${rsvp.event_id}`,
    );
    // Notify event owner of the confirmed RSVP
    const ev = await db.get<{ created_by: number }>('SELECT created_by FROM events WHERE id = $1', [
      rsvp.event_id,
    ]);
    if (ev) {
      const guestName = (updated as RsvpRow & { name?: string }).name ?? 'A guest';
      await createRsvpNotification(rsvp.event_id, ev.created_by, String(guestName));
    }
  }

  await logMutation(db, authReq, AUDIT_ACTIONS.RSVP_UPDATE, 'rsvp', rsvp.id, { eventId });
  return res.json({ rsvp: updated });
}

/** DELETE /api/events/:eventId/rsvps/:id */
export async function deleteRsvp(req: Request, res: Response): Promise<Response> {
  const authReq = req as AuthRequest;
  const db = getDatabase();
  const { id, eventId } = req.params;
  const event = await requireEventAccess(authReq, res, eventId, { allowMembers: true });
  if (!event) return res as Response;
  const rsvp = await db.get<Pick<RsvpRow, 'id'>>(
    'SELECT id FROM rsvps WHERE id = $1 AND event_id = $2',
    [id, eventId],
  );
  if (!rsvp) return res.status(404).json({ error: 'RSVP not found.' });

  if (rsvp?.id) {
    await captureEntityVersion(
      'rsvp',
      rsvp.id,
      rsvp as Record<string, unknown>,
      authReq.user?.id ?? null,
      'RSVP deleted',
    );
  }
  await db.run('DELETE FROM rsvps WHERE id = $1', [id]);
  await logMutation(db, authReq, AUDIT_ACTIONS.RSVP_DELETE, 'rsvp', id, { eventId });
  // Free capacity may have opened a slot — promote the next waitlisted guest.
  void runPromotion(Number(eventId)).catch((err) =>
    console.error('Waitlist promotion failed after RSVP delete:', err),
  );
  return res.json({ message: 'RSVP deleted.' });
}

/** GET /api/events/:eventId/rsvps/export?format=csv */
export async function exportRsvpsCsv(req: Request, res: Response): Promise<Response> {
  const db = getDatabase();
  const { eventId } = req.params;
  const { format } = req.query as { format?: string };

  if (format && format !== 'csv') {
    return res.status(400).json({ error: 'Unsupported export format.' });
  }

  const authReq = req as AuthRequest;
  const event = await requireEventAccess(authReq, res, eventId, { ownerOnly: true });
  if (!event) return res as Response;

  const rows = await db.all<Record<string, unknown>>(
    `SELECT name, email, phone, canonical_status, guests, notes,
            dietary_restriction, accessibility_needs, meal_choice,
            plus_one, plus_one_name, guest_group,
            company, title, relation_type, age_group,
            address_line1, address_line2, city, state_region, postal_code, country,
            emergency_contact_name, emergency_contact_phone,
            checked_in, checked_in_at, late_arrival,
            profile_completeness, unsubscribed_at, created_at
     FROM rsvps WHERE event_id = $1 ORDER BY created_at DESC`,
    [eventId],
  );

  const columns = [
    'name',
    'email',
    'phone',
    'canonical_status',
    'guests',
    'notes',
    'dietary_restriction',
    'accessibility_needs',
    'meal_choice',
    'plus_one',
    'plus_one_name',
    'guest_group',
    'company',
    'title',
    'relation_type',
    'age_group',
    'address_line1',
    'address_line2',
    'city',
    'state_region',
    'postal_code',
    'country',
    'emergency_contact_name',
    'emergency_contact_phone',
    'checked_in',
    'checked_in_at',
    'late_arrival',
    'profile_completeness',
    'unsubscribed_at',
    'submitted_at',
  ];

  const csv = [
    columns.join(','),
    ...rows.map((row) =>
      columns
        .map((col) => {
          const key = col === 'submitted_at' ? 'created_at' : col;
          const v = row[key];
          if (v === null || v === undefined) return csvEscape('');
          if (typeof v === 'boolean') return csvEscape(v ? 'true' : 'false');
          return csvEscape(v);
        })
        .join(','),
    ),
  ].join('\n');

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="event-${eventId}-rsvps.csv"`);
  return res.send(csv);
}

/** GET /api/events/:eventId/rsvps/import/template.csv */
export async function exportRsvpsImportTemplateCsv(req: Request, res: Response): Promise<Response> {
  const authReq = req as AuthRequest;
  const { eventId } = req.params;
  const event = await requireEventAccess(authReq, res, eventId, { ownerOnly: true });
  if (!event) return res as Response;

  const csv = `${IMPORT_TEMPLATE_COLUMNS.join(',')}\n`;
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="event-${eventId}-rsvp-import-template.csv"`,
  );
  return res.send(csv);
}

/** PATCH /api/events/:eventId/rsvps/:id/checkin */
export async function checkInGuest(req: Request, res: Response): Promise<Response> {
  const authReq = req as AuthRequest;
  const db = getDatabase();
  const { id, eventId } = req.params;

  const event = await requireEventAccess(authReq, res, eventId, { allowMembers: true });
  if (!event) return res as Response;

  const rsvp = await db.get<RsvpRow & { checked_in: boolean; checked_in_at: string | null }>(
    'SELECT * FROM rsvps WHERE id = $1 AND event_id = $2',
    [id, eventId],
  );
  if (!rsvp) return res.status(404).json({ error: 'RSVP not found.' });

  // Idempotent: already checked in — return current state without writing
  if (rsvp.checked_in) {
    return res.json({ rsvp });
  }

  // Compute late-arrival flag against the event start (#594).
  const ev = await db.get<{ date: string | null }>(`SELECT date FROM events WHERE id = $1`, [
    eventId,
  ]);
  let isLate = false;
  let delayMin: number | null = null;
  if (ev?.date) {
    const start = new Date(ev.date).getTime();
    const now = Date.now();
    if (Number.isFinite(start) && now > start) {
      isLate = true;
      delayMin = Math.round((now - start) / 60000);
    }
  }

  await db.run(
    `UPDATE rsvps SET checked_in = TRUE, checked_in_at = CURRENT_TIMESTAMP,
                     canonical_status = 'checked_in',
                     late_arrival = $1, arrival_delay_minutes = $2,
                     updated_at = CURRENT_TIMESTAMP
     WHERE id = $3`,
    [isLate, delayMin, id],
  );

  const updated = await db.get<RsvpFull>('SELECT * FROM rsvps WHERE id = $1', [id]);
  if (updated?.id) {
    await captureEntityVersion(
      'rsvp',
      updated.id,
      updated as unknown as Record<string, unknown>,
      authReq.user?.id ?? null,
      'RSVP checked in',
    );
  }

  await db
    .run(
      `INSERT INTO attendance_events (event_id, rsvp_id, action, source, actor_id, metadata)
     VALUES ($1, $2, 'checked_in', 'manual', $3, $4::jsonb)`,
      [
        eventId,
        id,
        authReq.user?.id ?? null,
        JSON.stringify({ late: isLate, delay_minutes: delayMin }),
      ],
    )
    .catch(() => undefined);

  await logActivity(
    eventId,
    authReq.user?.id ?? null,
    'guest_checked_in',
    `${(updated as RsvpFull).name ?? 'A guest'} checked in${isLate ? ` (late by ${delayMin ?? '?'} min)` : ''}`,
    `/events/${eventId}`,
  );

  return res.json({ rsvp: updated });
}

/** POST /api/events/:eventId/rsvps/import — CSV or XLSX file upload via multer */
export async function importCsv(req: Request, res: Response): Promise<Response> {
  const authReq = req as AuthRequest;
  if (!authReq.user) return res.status(401).json({ error: 'Authentication required.' });

  const { eventId } = req.params;
  const file = (req as Request & { file?: Express.Multer.File }).file;
  if (!file) return res.status(400).json({ error: 'No file uploaded.' });

  const db = getDatabase();
  const event = await requireEventAccess(authReq, res, eventId, { ownerOnly: true });
  if (!event) return res as Response;

  const MAX_FILE_BYTES = 5 * 1024 * 1024; // 5 MB
  const MAX_CSV_LINE_CHARS = 10_000;
  const MAX_ROWS = 10_000;

  if (file.buffer.length > MAX_FILE_BYTES) {
    return res.status(400).json({ error: 'File exceeds maximum allowed size of 5 MB.' });
  }

  // ── Detect file type and normalise to string[][] ────────────────────────
  const lowerName = (file.originalname ?? '').toLowerCase();
  const isExcel =
    lowerName.endsWith('.xlsx') ||
    lowerName.endsWith('.xls') ||
    file.mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
    file.mimetype === 'application/vnd.ms-excel';

  let rawHeaders: string[] = [];
  let dataLines2d: string[][] = [];

  if (isExcel) {
    try {
      const workbook = new ExcelJS.Workbook();
      // exceljs's Buffer type clashes with @types/node v20+ generic Buffer; the
      // value is a real Buffer at runtime, so cast through unknown.
      await workbook.xlsx.load(file.buffer as unknown as Parameters<typeof workbook.xlsx.load>[0]);
      const worksheet = workbook.worksheets[0];
      if (!worksheet) return res.status(400).json({ error: 'Excel file has no sheets.' });

      // Collect all rows as string[][] (ExcelJS row.values[0] is always undefined)
      const allRows: string[][] = [];
      worksheet.eachRow({ includeEmpty: false }, (row) => {
        const values = (row.values as (string | number | boolean | null | undefined)[]).slice(1);
        allRows.push(values.map((c) => String(c ?? '')));
      });

      const nonEmpty = allRows.filter((r) => r.some((c) => c.trim() !== ''));
      if (nonEmpty.length < 2)
        return res.status(400).json({ error: 'Excel file has no data rows.' });
      if (nonEmpty.length > MAX_ROWS + 1) {
        return res
          .status(400)
          .json({ error: `Excel file exceeds maximum of ${MAX_ROWS} data rows.` });
      }
      rawHeaders = nonEmpty[0];
      dataLines2d = nonEmpty.slice(1);
    } catch {
      return res
        .status(400)
        .json({ error: 'Failed to parse Excel file. Please check the format.' });
    }
  } else {
    // ── CSV path ──────────────────────────────────────────────────────────
    const content = file.buffer.toString('utf8');
    const lines = content.split(/\r?\n/).filter((l) => l.trim().length > 0);
    if (lines.length < 2) return res.status(400).json({ error: 'CSV file has no data rows.' });
    if (lines.length > MAX_ROWS + 1) {
      return res.status(400).json({ error: `CSV file exceeds maximum of ${MAX_ROWS} data rows.` });
    }

    // Parse simple CSV (supports quoted fields)
    function parseCsvLine(line: string): string[] {
      const result: string[] = [];
      let current = '';
      let inQuotes = false;
      const safeLength = Math.min(line.length, MAX_CSV_LINE_CHARS);
      for (let i = 0; i < safeLength; i++) {
        const ch = line[i];
        if (ch === '"') {
          if (inQuotes && line[i + 1] === '"') {
            current += '"';
            i++;
          } else {
            inQuotes = !inQuotes;
          }
        } else if (ch === ',' && !inQuotes) {
          result.push(current.trim());
          current = '';
        } else {
          current += ch;
        }
      }
      result.push(current.trim());
      return result;
    }

    rawHeaders = parseCsvLine(lines[0]);
    dataLines2d = lines.slice(1).map((l) => parseCsvLine(l));
  } // end CSV path

  const normalizedHeaders = rawHeaders.map((h) => h.toLowerCase().replace(/\s+/g, '_'));

  // ── Apply field mapping from the frontend wizard (Story #664, Item 11) ────
  // column_map is sent as a JSON string form field: { csvHeader -> guestField }
  // The frontend only serialises explicit (non-empty) mappings, so unmapped
  // columns are simply absent from the map and fall back to their normalised
  // header name — preserving backward compatibility.

  // Whitelist of valid target field names prevents prototype-pollution attacks
  // via user-controlled column_map values (e.g. "__proto__", "constructor").
  const ALLOWED_GUEST_FIELDS = new Set([
    'name',
    'email',
    'phone',
    'guests',
    'canonical_status',
    'status', // kept for backward-compat: old CSVs may map a column to 'status'
    'notes',
    'dietary_restriction',
    'accessibility_needs',
    'plus_one',
    'plus_one_name',
    'guest_group',
    'company',
    'title',
    'relation_type',
    'age_group',
    'address_line1',
    'address_line2',
    'city',
    'state_region',
    'postal_code',
    'country',
    'emergency_contact_name',
    'emergency_contact_phone',
    'meal_choice',
  ]);

  // Use a null-prototype map to avoid prototype-chain reads on columnMap itself.
  const columnMap: Record<string, string> = Object.create(null) as Record<string, string>;
  const rawMapField = (req.body as Record<string, unknown>)?.column_map;
  if (typeof rawMapField === 'string' && rawMapField) {
    try {
      const parsed = JSON.parse(rawMapField) as unknown;
      if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
        // Only copy string values for own properties to prevent prototype pollution
        for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
          if (typeof v === 'string') columnMap[k] = v;
        }
      }
    } catch {
      /* ignore malformed column_map */
    }
  }

  let imported = 0;
  let skipped = 0;
  const failedRows: Array<{ rowNumber: number; data: Record<string, string>; reason: string }> = [];

  for (const [rowIndex, values] of dataLines2d.entries()) {
    // Null-prototype object prevents prototype-chain key collisions in row.
    const row: Record<string, string> = Object.create(null) as Record<string, string>;
    rawHeaders.forEach((rawHeader, i) => {
      if (Object.prototype.hasOwnProperty.call(columnMap, rawHeader)) {
        const guestField = columnMap[rawHeader];
        // Only store to whitelisted field names to prevent prototype pollution
        if (
          typeof guestField === 'string' &&
          guestField !== '' &&
          ALLOWED_GUEST_FIELDS.has(guestField)
        ) {
          row[guestField] = values[i] ?? '';
        }
        // guestField === '' or unknown name → skip this column entirely
      } else {
        // Not in the map: fall back to normalised column name
        row[normalizedHeaders[i]] = values[i] ?? '';
      }
    });

    const name = row['name']?.trim();
    const email = row['email']?.trim().toLowerCase();
    if (!name || !email) {
      skipped++;
      const reason =
        !name && !email ? 'Missing name and email' : !name ? 'Missing name' : 'Missing email';
      failedRows.push({ rowNumber: rowIndex + 1, data: { ...row }, reason });
      continue;
    }

    try {
      const result = await db.run(
        `INSERT INTO rsvps (event_id, name, email, guests, canonical_status, notes, source,
                            phone, dietary_restriction, accessibility_needs,
                            plus_one, plus_one_name, guest_group,
                            company, title, relation_type, age_group,
                            address_line1, city, postal_code, country,
                            emergency_contact_name, emergency_contact_phone,
                            meal_choice)
         VALUES ($1, $2, $3, $4, $5, $6, 'import', $7, $8, $9, $10, $11, $12,
                 $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23)
         ON CONFLICT (event_id, email) DO NOTHING
         RETURNING id`,
        [
          eventId,
          name,
          email,
          parseGuests(row['guests']),
          row['canonical_status'] || row['status'] /* legacy CSV compat */ || 'pending',
          row['notes'] || null,
          row['phone'] || null,
          row['dietary_restriction'] || 'None',
          row['accessibility_needs'] || null,
          row['plus_one'] === 'true' ? true : false,
          row['plus_one_name'] || null,
          row['guest_group'] || null,
          row['company'] || null,
          row['title'] || null,
          row['relation_type'] || null,
          row['age_group'] || null,
          row['address_line1'] || row['address'] || null,
          row['city'] || null,
          row['postal_code'] || row['zip'] || null,
          row['country'] || null,
          row['emergency_contact_name'] || null,
          row['emergency_contact_phone'] || null,
          row['meal_choice'] || null,
        ],
      );
      if ((result.changes ?? 0) > 0) {
        imported++;
        if (result.lastID) {
          await recomputeCanonicalStatus(result.lastID);
          await recomputeCompleteness(result.lastID);
        }
      } else {
        // ON CONFLICT DO NOTHING — duplicate email
        skipped++;
        failedRows.push({
          rowNumber: rowIndex + 1,
          data: { ...row },
          reason: 'Duplicate email — already exists for this event',
        });
      }
    } catch (dbErr: unknown) {
      skipped++;
      failedRows.push({
        rowNumber: rowIndex + 1,
        data: { ...row },
        reason: dbErr instanceof Error ? dbErr.message : 'Database error',
      });
    }
  }

  return res.json({ imported, skipped, failedRows });
}

/**
 * PATCH /api/events/:eventId/rsvps/:id/unsubscribe (#444)
 *
 * Planner-side unsubscribe toggle. Body: `{ unsubscribed: boolean }`.
 * Setting unsubscribed=true marks the RSVP with the current timestamp so
 * future bulk sends automatically skip this guest. Setting unsubscribed=false
 * clears the timestamp (re-opt-in). Requires event-owner or member access.
 */
export async function setUnsubscribed(req: Request, res: Response): Promise<Response> {
  const authReq = req as AuthRequest;
  const db = getDatabase();
  const { id, eventId } = req.params;

  const event = await requireEventAccess(authReq, res, eventId, { allowMembers: true });
  if (!event) return res as Response;

  const rsvp = await db.get<{ id: number; email: string; unsubscribed_at: string | null }>(
    'SELECT id, email, unsubscribed_at FROM rsvps WHERE id = ? AND event_id = ?',
    [id, eventId],
  );
  if (!rsvp) return res.status(404).json({ error: 'RSVP not found.' });

  const { unsubscribed } = (req.body ?? {}) as { unsubscribed?: boolean };
  if (typeof unsubscribed !== 'boolean') {
    return res.status(400).json({ error: 'Body must include `unsubscribed` (boolean).' });
  }

  if (unsubscribed) {
    await db.run(
      'UPDATE rsvps SET unsubscribed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [id],
    );
  } else {
    await db.run(
      'UPDATE rsvps SET unsubscribed_at = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [id],
    );
  }

  const updated = await db.get<{ id: number; email: string; unsubscribed_at: string | null }>(
    'SELECT id, email, unsubscribed_at FROM rsvps WHERE id = ?',
    [id],
  );
  return res.json({ rsvp: updated });
}
