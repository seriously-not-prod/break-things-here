/**
 * Guests Controller — Task #771
 *
 * CRUD management for the first-class `guests` table (TRD §4.2).
 * Guest profiles store identity information independently of RSVP status;
 * `rsvps.guest_id` links a response back to its guest record.
 *
 * Routes registered in api-routes.ts:
 *   GET    /api/events/:eventId/guest-records
 *   GET    /api/events/:eventId/guest-records/:id
 *   POST   /api/events/:eventId/guest-records
 *   PUT    /api/events/:eventId/guest-records/:id
 *   DELETE /api/events/:eventId/guest-records/:id
 */
import type { RequestHandler, Request, Response } from 'express';

import { getDatabase } from '../db/database.js';
import { logAuditEvent } from '../utils/audit-log.js';
import { requireEventAccess } from '../utils/event-access.js';

interface AuthRequest extends Request {
  user?: { id: number; email: string; role_id: number };
}

interface GuestRow {
  id: number;
  event_id: number;
  name: string;
  email: string;
  phone: string | null;
  dietary_restriction: string | null;
  accessibility_needs: string | null;
  created_at: string;
  created_by: number | null;
  updated_at: string;
  updated_by: number | null;
}

interface GuestWithRsvp extends GuestRow {
  rsvp_id: number | null;
  canonical_status: string | null;
}

function isValidEmailAddress(raw: string): boolean {
  const value = raw.trim();
  if (value.length < 3 || value.length > 254) return false;
  if (value.includes(' ')) return false;

  const atIndex = value.indexOf('@');
  if (atIndex <= 0 || atIndex !== value.lastIndexOf('@') || atIndex === value.length - 1) {
    return false;
  }

  const localPart = value.slice(0, atIndex);
  const domainPart = value.slice(atIndex + 1);
  if (!localPart || domainPart.length < 3) return false;
  if (domainPart.startsWith('.') || domainPart.endsWith('.')) return false;
  if (!domainPart.includes('.') || domainPart.includes('..')) return false;

  return true;
}

// ── GET /api/events/:eventId/guest-records ───────────────────────────────────
export const listGuests: RequestHandler = async (req: AuthRequest, res: Response) => {
  const eventId = Number(req.params.eventId);
  if (!eventId) {
    res.status(400).json({ error: 'Invalid eventId' });
    return;
  }

  const event = await requireEventAccess(
    req as { user?: { id: number; email: string; role_id: number } },
    res,
    String(eventId),
    { allowMembers: true },
  );
  if (!event) return;

  const db = getDatabase();
  const guests = await db.all<GuestWithRsvp>(
    `SELECT g.*,
            r.id   AS rsvp_id,
            r.canonical_status
       FROM guests g
       LEFT JOIN rsvps r ON r.guest_id = g.id AND r.event_id = g.event_id
      WHERE g.event_id = $1
      ORDER BY g.name, g.id`,
    [eventId],
  );
  res.json(guests);
};

// ── GET /api/events/:eventId/guest-records/:id ───────────────────────────────
export const getGuest: RequestHandler = async (req: AuthRequest, res: Response) => {
  const eventId = Number(req.params.eventId);
  const id = Number(req.params.id);
  if (!eventId || !id) {
    res.status(400).json({ error: 'Invalid eventId or id' });
    return;
  }

  const event = await requireEventAccess(
    req as { user?: { id: number; email: string; role_id: number } },
    res,
    String(eventId),
    { allowMembers: true },
  );
  if (!event) return;

  const db = getDatabase();
  const guest = await db.get<GuestWithRsvp>(
    `SELECT g.*,
            r.id   AS rsvp_id,
            r.canonical_status
       FROM guests g
       LEFT JOIN rsvps r ON r.guest_id = g.id AND r.event_id = g.event_id
      WHERE g.id = $1 AND g.event_id = $2`,
    [id, eventId],
  );
  if (!guest) {
    res.status(404).json({ error: 'Guest not found' });
    return;
  }
  res.json(guest);
};

// ── POST /api/events/:eventId/guest-records ──────────────────────────────────
export const createGuest: RequestHandler = async (req: AuthRequest, res: Response) => {
  const eventId = Number(req.params.eventId);
  if (!eventId) {
    res.status(400).json({ error: 'Invalid eventId' });
    return;
  }

  const event = await requireEventAccess(
    req as { user?: { id: number; email: string; role_id: number } },
    res,
    String(eventId),
    { allowMembers: true },
  );
  if (!event) return;

  const { name, email, phone, dietary_restriction, accessibility_needs } = req.body ?? {};

  if (!name?.trim()) {
    res.status(400).json({ error: 'name is required' });
    return;
  }
  if (!email?.trim()) {
    res.status(400).json({ error: 'email is required' });
    return;
  }
  if (!isValidEmailAddress(email)) {
    res.status(400).json({ error: 'email must be a valid email address' });
    return;
  }

  const db = getDatabase();

  // Prevent duplicate email within the same event
  const existing = await db.get<{ id: number }>(
    `SELECT id FROM guests WHERE event_id = $1 AND lower(email) = lower($2)`,
    [eventId, email.trim()],
  );
  if (existing) {
    res.status(409).json({
      error: 'A guest with this email already exists for this event',
      existing_id: existing.id,
    });
    return;
  }

  const row = await db.get<GuestRow>(
    `INSERT INTO guests (event_id, name, email, phone, dietary_restriction, accessibility_needs, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [
      eventId,
      name.trim(),
      email.trim().toLowerCase(),
      phone?.trim() || null,
      dietary_restriction?.trim() || 'None',
      accessibility_needs?.trim() || null,
      req.user?.id ?? null,
    ],
  );

  await logAuditEvent({
    db,
    userId: req.user?.id ?? 0,
    email: req.user?.email ?? '',
    action: 'create_guest',
    description: JSON.stringify({ eventId, guestId: row?.id }),
    ipAddress: undefined,
  });

  res.status(201).json(row);
};

// ── PUT /api/events/:eventId/guest-records/:id ───────────────────────────────
export const updateGuest: RequestHandler = async (req: AuthRequest, res: Response) => {
  const eventId = Number(req.params.eventId);
  const id = Number(req.params.id);
  if (!eventId || !id) {
    res.status(400).json({ error: 'Invalid eventId or id' });
    return;
  }

  const event = await requireEventAccess(
    req as { user?: { id: number; email: string; role_id: number } },
    res,
    String(eventId),
    { allowMembers: true },
  );
  if (!event) return;

  const { name, email, phone, dietary_restriction, accessibility_needs } = req.body ?? {};

  if (!name?.trim()) {
    res.status(400).json({ error: 'name is required' });
    return;
  }
  if (!email?.trim()) {
    res.status(400).json({ error: 'email is required' });
    return;
  }
  if (!isValidEmailAddress(email)) {
    res.status(400).json({ error: 'email must be a valid email address' });
    return;
  }

  const db = getDatabase();

  // Prevent email collision with another guest in the same event
  const collision = await db.get<{ id: number }>(
    `SELECT id FROM guests WHERE event_id = $1 AND lower(email) = lower($2) AND id <> $3`,
    [eventId, email.trim(), id],
  );
  if (collision) {
    res.status(409).json({
      error: 'Another guest with this email already exists for this event',
      existing_id: collision.id,
    });
    return;
  }

  const row = await db.get<GuestRow>(
    `UPDATE guests
        SET name                = $1,
            email               = $2,
            phone               = $3,
            dietary_restriction = $4,
            accessibility_needs = $5,
            updated_at          = NOW(),
            updated_by          = $6
      WHERE id = $7 AND event_id = $8
      RETURNING *`,
    [
      name.trim(),
      email.trim().toLowerCase(),
      phone?.trim() || null,
      dietary_restriction?.trim() || 'None',
      accessibility_needs?.trim() || null,
      req.user?.id ?? null,
      id,
      eventId,
    ],
  );
  if (!row) {
    res.status(404).json({ error: 'Guest not found' });
    return;
  }

  await logAuditEvent({
    db,
    userId: req.user?.id ?? 0,
    email: req.user?.email ?? '',
    action: 'update_guest',
    description: JSON.stringify({ eventId, guestId: id }),
    ipAddress: undefined,
  });

  res.json(row);
};

// ── DELETE /api/events/:eventId/guest-records/:id ────────────────────────────
// Deletes the guest profile; rsvps.guest_id is set to NULL (ON DELETE SET NULL)
// so no RSVPs become orphaned.
export const deleteGuest: RequestHandler = async (req: AuthRequest, res: Response) => {
  const eventId = Number(req.params.eventId);
  const id = Number(req.params.id);
  if (!eventId || !id) {
    res.status(400).json({ error: 'Invalid eventId or id' });
    return;
  }

  const event = await requireEventAccess(
    req as { user?: { id: number; email: string; role_id: number } },
    res,
    String(eventId),
    { allowMembers: true },
  );
  if (!event) return;

  const db = getDatabase();
  const existing = await db.get<{ id: number }>(
    `SELECT id FROM guests WHERE id = $1 AND event_id = $2`,
    [id, eventId],
  );
  if (!existing) {
    res.status(404).json({ error: 'Guest not found' });
    return;
  }

  await db.run(`DELETE FROM guests WHERE id = $1 AND event_id = $2`, [id, eventId]);

  await logAuditEvent({
    db,
    userId: req.user?.id ?? 0,
    email: req.user?.email ?? '',
    action: 'delete_guest',
    description: JSON.stringify({ eventId, guestId: id }),
    ipAddress: undefined,
  });

  res.status(204).send();
};
