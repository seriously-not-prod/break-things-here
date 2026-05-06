import { Request, Response } from 'express';
import { getDatabase } from '../db/database.js';
import { createRsvpNotification } from './notifications-controller.js';
import { logActivity } from './activity-feed-controller.js';
import { requireEventAccess } from '../utils/event-access.js';

interface RsvpRow {
  id: number;
  event_id: number;
  status: string;
  guests: number;
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
  return status === 'Going';
}

async function getEventCapacity(db: ReturnType<typeof getDatabase>, eventId: string): Promise<number | null> {
  const event = await db.get<{ capacity: number | null }>('SELECT capacity FROM events WHERE id = ? AND deleted_at IS NULL', [eventId]);
  return event?.capacity ?? null;
}

async function getGoingGuestsTotal(db: ReturnType<typeof getDatabase>, eventId: string, excludeRsvpId?: string): Promise<number> {
  const rows = await db.all<{ total_guests: number }>(
    `SELECT COALESCE(SUM(guests), 0) AS total_guests
     FROM rsvps
     WHERE event_id = ? AND status = 'Going'${excludeRsvpId ? ' AND id <> ?' : ''}`,
    excludeRsvpId ? [eventId, excludeRsvpId] : [eventId],
  );
  return rows[0]?.total_guests ?? 0;
}

function csvEscape(value: unknown): string {
  const text = String(value ?? '');
  return `"${text.replace(/"/g, '""')}"`;
}

/** GET /api/events/:eventId/rsvps */
export async function listRsvps(req: Request, res: Response): Promise<Response> {
  const authReq = req as AuthRequest;
  const db = getDatabase();
  const { eventId } = req.params;
  const event = await requireEventAccess(authReq, res, eventId, { allowMembers: true });
  if (!event) return res as Response;
  const rows = await db.all(
    'SELECT * FROM rsvps WHERE event_id = ? ORDER BY created_at DESC',
    [eventId],
  );
  return res.json({ rsvps: rows });
}

/** GET /api/public/events/:eventId */
export async function getPublicRsvpContext(req: Request, res: Response): Promise<Response> {
  const db = getDatabase();
  const { eventId } = req.params;
  const event = await db.get<{ id: number; title: string; description: string | null; location: string | null; date: string; event_date: string; capacity: number | null }>(
    'SELECT id, title, description, location, date, date AS event_date, capacity FROM events WHERE id = ? AND deleted_at IS NULL',
    [eventId],
  );
  if (!event) return res.status(404).json({ error: 'Event not found.' });

  const goingGuests = await getGoingGuestsTotal(db, eventId);
  const remainingCapacity = event.capacity === null ? null : Math.max(event.capacity - goingGuests, 0);

  return res.json({ event, remainingCapacity });
}

/** POST /api/events/:eventId/rsvps  (public — no auth) */
export async function createRsvp(req: Request, res: Response): Promise<Response> {
  const { eventId } = req.params;
  const {
    name,
    email,
    status,
    notes,
    guests,
    phone,
    dietary_restriction,
    accessibility_needs,
    plus_one,
    plus_one_name,
    guest_group,
    rsvp_deadline,
  } = req.body as {
    name?: string;
    email?: string;
    status?: string;
    notes?: string;
    guests?: number | string;
    phone?: string;
    dietary_restriction?: string;
    accessibility_needs?: string;
    plus_one?: boolean;
    plus_one_name?: string;
    guest_group?: string;
    rsvp_deadline?: string;
  };

  if (!name?.trim()) return res.status(400).json({ error: 'Name is required.' });
  if (!email?.trim()) return res.status(400).json({ error: 'Email is required.' });

  let guestCount: number;
  try {
    guestCount = parseGuests(guests);
  } catch (error) {
    return res.status(400).json({ error: error instanceof Error ? error.message : 'Invalid guest count.' });
  }

  const db = getDatabase();
  const event = await db.get<{ id: number }>('SELECT id FROM events WHERE id = ? AND deleted_at IS NULL', [eventId]);
  if (!event) return res.status(404).json({ error: 'Event not found.' });

  const capacity = await getEventCapacity(db, eventId);
  if (capacity !== null && isGoing(status || 'Pending')) {
    const currentGoing = await getGoingGuestsTotal(db, eventId);
    if (currentGoing + guestCount > capacity) {
      return res.status(409).json({ error: 'Event capacity exceeded.' });
    }
  }

  // Determine source based on whether request is authenticated
  const authReq = req as AuthRequest;
  const source = authReq.user ? 'internal' : 'public';

  const result = await db.run(
    `INSERT INTO rsvps (
       event_id, name, email, guests, status, notes, source,
       phone, dietary_restriction, accessibility_needs,
       plus_one, plus_one_name, guest_group, rsvp_deadline
     )
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     RETURNING id`,
    [
      eventId,
      name.trim(),
      email.trim().toLowerCase(),
      guestCount,
      status || 'Pending',
      notes?.trim() || null,
      source,
      phone?.trim() || null,
      dietary_restriction?.trim() || 'None',
      accessibility_needs?.trim() || null,
      Boolean(plus_one),
      plus_one_name?.trim() || null,
      guest_group?.trim() || null,
      rsvp_deadline || null,
    ],
  );

  const rsvp = await db.get<RsvpRow>('SELECT * FROM rsvps WHERE id = ?', [result.lastID]);

  // Fire notification to event owner when a new RSVP is confirmed
  if ((status || 'Pending') === 'Going') {
    const ev = await db.get<{ created_by: number }>(
      'SELECT created_by FROM events WHERE id = ?',
      [eventId],
    );
    if (ev) {
      await createRsvpNotification(Number(eventId), ev.created_by, name.trim());
    }
  }

  return res.status(201).json({ rsvp });
}

/** PATCH /api/events/:eventId/rsvps/:id */
export async function updateRsvp(req: Request, res: Response): Promise<Response> {
  const authReq = req as AuthRequest;
  const db = getDatabase();
  const { id, eventId } = req.params;
  const event = await requireEventAccess(authReq, res, eventId, { allowMembers: true });
  if (!event) return res as Response;
  const rsvp = await db.get<RsvpRow>('SELECT * FROM rsvps WHERE id = ? AND event_id = ?', [id, eventId]);
  if (!rsvp) return res.status(404).json({ error: 'RSVP not found.' });

  const {
    name,
    email,
    status,
    notes,
    guests,
    phone,
    dietary_restriction,
    accessibility_needs,
    plus_one,
    plus_one_name,
    guest_group,
    rsvp_deadline,
  } = req.body as Record<string, string | boolean>;
  const fields: string[] = [];
  const params: (string | number | null)[] = [];

  let nextGuests = Number(rsvp.guests ?? 1);
  let nextStatus = rsvp.status;
  if (guests !== undefined) {
    const parsed = parseGuests(guests);
    nextGuests = parsed;
    fields.push('guests = ?');
    params.push(parsed);
  }
  if (status !== undefined) {
    nextStatus = String(status);
    fields.push('status = ?');
    params.push(String(status));
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

  if (name !== undefined) { fields.push('name = ?'); params.push(String(name).trim()); }
  if (email !== undefined) { fields.push('email = ?'); params.push(String(email).trim().toLowerCase()); }
  if (notes !== undefined) { fields.push('notes = ?'); params.push(String(notes).trim() || null); }
  if (phone !== undefined) { fields.push('phone = ?'); params.push(String(phone).trim() || null); }
  if (dietary_restriction !== undefined) {
    fields.push('dietary_restriction = ?');
    params.push(String(dietary_restriction).trim() || 'None');
  }
  if (accessibility_needs !== undefined) {
    fields.push('accessibility_needs = ?');
    params.push(String(accessibility_needs).trim() || null);
  }
  if (plus_one !== undefined) { fields.push('plus_one = ?'); params.push(plus_one ? 1 : 0); }
  if (plus_one_name !== undefined) {
    fields.push('plus_one_name = ?');
    params.push(String(plus_one_name).trim() || null);
  }
  if (guest_group !== undefined) { fields.push('guest_group = ?'); params.push(String(guest_group).trim() || null); }
  if (rsvp_deadline !== undefined) { fields.push('rsvp_deadline = ?'); params.push(String(rsvp_deadline).trim() || null); }

  if (fields.length === 0) return res.status(400).json({ error: 'No fields to update.' });

  fields.push('updated_at = CURRENT_TIMESTAMP');
  params.push(id);

  await db.run(`UPDATE rsvps SET ${fields.join(', ')} WHERE id = ?`, params);
  const updated = await db.get<RsvpRow>('SELECT * FROM rsvps WHERE id = ?', [id]);

  if (nextStatus === 'Going') {
    await logActivity(
      rsvp.event_id,
      authReq.user?.id ?? null,
      'rsvp_confirmed',
      `${(updated as RsvpRow & { name?: string }).name ?? 'A guest'} confirmed attendance`,
      `/events/${rsvp.event_id}`,
    );
    // Notify event owner of the confirmed RSVP
    const ev = await db.get<{ created_by: number }>(
      'SELECT created_by FROM events WHERE id = ?',
      [rsvp.event_id],
    );
    if (ev) {
      const guestName = (updated as RsvpRow & { name?: string }).name ?? 'A guest';
      await createRsvpNotification(rsvp.event_id, ev.created_by, String(guestName));
    }
  }

  return res.json({ rsvp: updated });
}

/** DELETE /api/events/:eventId/rsvps/:id */
export async function deleteRsvp(req: Request, res: Response): Promise<Response> {
  const authReq = req as AuthRequest;
  const db = getDatabase();
  const { id, eventId } = req.params;
  const event = await requireEventAccess(authReq, res, eventId, { allowMembers: true });
  if (!event) return res as Response;
  const rsvp = await db.get<Pick<RsvpRow, 'id'>>('SELECT id FROM rsvps WHERE id = ? AND event_id = ?', [id, eventId]);
  if (!rsvp) return res.status(404).json({ error: 'RSVP not found.' });

  await db.run('DELETE FROM rsvps WHERE id = ?', [id]);
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

  const rows = await db.all<{
    name: string;
    email: string;
    phone: string | null;
    status: string;
    guests: number;
    notes: string | null;
    dietary_restriction: string | null;
    accessibility_needs: string | null;
    plus_one: boolean;
    plus_one_name: string | null;
    guest_group: string | null;
    checked_in: boolean;
    created_at: string;
  }>(
    `SELECT name, email, phone, status, guests, notes,
            dietary_restriction, accessibility_needs,
            plus_one, plus_one_name, guest_group, checked_in, created_at
     FROM rsvps WHERE event_id = ? ORDER BY created_at DESC`,
    [eventId],
  );

  const csv = [
    [
      'name', 'email', 'phone', 'status', 'guests', 'notes',
      'dietary_restriction', 'accessibility_needs',
      'plus_one', 'plus_one_name', 'guest_group', 'checked_in', 'submitted_at',
    ].join(','),
    ...rows.map((row) => [
      csvEscape(row.name),
      csvEscape(row.email),
      csvEscape(row.phone ?? ''),
      csvEscape(row.status),
      csvEscape(row.guests),
      csvEscape(row.notes ?? ''),
      csvEscape(row.dietary_restriction ?? 'None'),
      csvEscape(row.accessibility_needs ?? ''),
      csvEscape(row.plus_one ? 'true' : 'false'),
      csvEscape(row.plus_one_name ?? ''),
      csvEscape(row.guest_group ?? ''),
      csvEscape(row.checked_in ? 'true' : 'false'),
      csvEscape(row.created_at),
    ].join(',')),
  ].join('\n');

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="event-${eventId}-rsvps.csv"`);
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
    'SELECT * FROM rsvps WHERE id = ? AND event_id = ?',
    [id, eventId],
  );
  if (!rsvp) return res.status(404).json({ error: 'RSVP not found.' });

  // Idempotent: already checked in — return current state without writing
  if (rsvp.checked_in) {
    return res.json({ rsvp });
  }

  await db.run(
    'UPDATE rsvps SET checked_in = TRUE, checked_in_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
    [id],
  );

  const updated = await db.get<RsvpRow & { name?: string }>('SELECT * FROM rsvps WHERE id = ?', [id]);

  await logActivity(
    eventId,
    authReq.user?.id ?? null,
    'guest_checked_in',
    `${updated?.name ?? 'A guest'} checked in`,
    `/events/${eventId}`,
  );

  return res.json({ rsvp: updated });
}

/** POST /api/events/:eventId/rsvps/import — CSV file upload via multer */
export async function importCsv(req: Request, res: Response): Promise<Response> {
  const authReq = req as AuthRequest;
  if (!authReq.user) return res.status(401).json({ error: 'Authentication required.' });

  const { eventId } = req.params;
  const file = (req as Request & { file?: Express.Multer.File }).file;
  if (!file) return res.status(400).json({ error: 'No CSV file uploaded.' });

  const db = getDatabase();
  const event = await requireEventAccess(authReq, res, eventId, { ownerOnly: true });
  if (!event) return res as Response;

  const MAX_CSV_FILE_BYTES = 5 * 1024 * 1024; // 5 MB
  const MAX_CSV_LINE_CHARS = 10_000;
  const MAX_CSV_ROWS = 10_000;

  if (file.buffer.length > MAX_CSV_FILE_BYTES) {
    return res.status(400).json({ error: 'CSV file exceeds maximum allowed size of 5 MB.' });
  }

  const content = file.buffer.toString('utf8');
  const lines = content.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return res.status(400).json({ error: 'CSV file has no data rows.' });
  if (lines.length > MAX_CSV_ROWS + 1) {
    return res.status(400).json({ error: `CSV file exceeds maximum of ${MAX_CSV_ROWS} data rows.` });
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

  const headers = parseCsvLine(lines[0]).map((h) => h.toLowerCase().replace(/\s+/g, '_'));
  const dataLines = lines.slice(1);

  let imported = 0;
  let skipped = 0;

  for (const line of dataLines) {
    const values = parseCsvLine(line);
    const row: Record<string, string> = {};
    headers.forEach((h, i) => { row[h] = values[i] ?? ''; });

    const name = row['name']?.trim();
    const email = row['email']?.trim().toLowerCase();
    if (!name || !email) { skipped++; continue; }

    try {
      const result = await db.run(
        `INSERT INTO rsvps (event_id, name, email, guests, status, notes, source,
                            phone, dietary_restriction, accessibility_needs,
                            plus_one, plus_one_name, guest_group)
         VALUES (?, ?, ?, ?, ?, ?, 'import', ?, ?, ?, ?, ?, ?)
         ON CONFLICT (event_id, email) DO NOTHING`,
        [
          eventId,
          name,
          email,
          parseGuests(row['guests']),
          row['status'] || 'Pending',
          row['notes'] || null,
          row['phone'] || null,
          row['dietary_restriction'] || 'None',
          row['accessibility_needs'] || null,
          row['plus_one'] === 'true' ? true : false,
          row['plus_one_name'] || null,
          row['guest_group'] || null,
        ],
      );
      if ((result.changes ?? 0) > 0) {
        imported++;
      } else {
        skipped++;
      }
    } catch {
      skipped++;
    }
  }

  return res.json({ imported, skipped });
}
