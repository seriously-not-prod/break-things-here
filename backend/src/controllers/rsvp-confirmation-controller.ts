/**
 * RSVP confirmation emails with ICS calendar attachment (#411, #436).
 *
 * Triggered manually from the planner UI after an RSVP is created/updated, or
 * from automation (waitlist promotion, custom-question replies). The endpoint
 * is small on purpose — building the ICS payload lives in `utils/ics.ts` and
 * is independently unit-tested.
 */

import type { Request, Response } from 'express';
import { getDatabase } from '../db/database.js';
import { requireEventAccess } from '../utils/event-access.js';
import { buildIcsEvent } from '../utils/ics.js';
import { renderQrSvg } from '../utils/qr.js';
import { ensureRsvpAccessToken } from './rsvp-token-controller.js';

interface AuthRequest extends Request {
  user?: { id: number; email: string; role_id: number };
}

interface EventRow {
  id: number;
  title: string;
  description: string | null;
  location: string | null;
  date: string;
  end_date: string | null;
}

interface RsvpRow {
  id: number;
  name: string;
  email: string;
  status: string;
  guests: number;
}

function publicBaseUrl(): string | null {
  const v = process.env.PUBLIC_BASE_URL?.trim();
  return v ? v.replace(/\/$/, '') : null;
}

function parseEventDates(event: EventRow): { start: Date; end?: Date } {
  // `date` is stored as TEXT — accept both YYYY-MM-DD and ISO timestamps. If a
  // bare date is given, treat it as starting at 00:00 UTC and lasting until
  // end_date (if set) or +2h.
  const startCandidate = new Date(event.date);
  let start = isNaN(startCandidate.getTime())
    ? new Date(`${event.date}T00:00:00Z`)
    : startCandidate;
  if (isNaN(start.getTime())) start = new Date();

  let end: Date | undefined;
  if (event.end_date) {
    const endCandidate = new Date(event.end_date);
    if (!isNaN(endCandidate.getTime())) end = endCandidate;
    else {
      const fallback = new Date(`${event.end_date}T00:00:00Z`);
      if (!isNaN(fallback.getTime())) end = fallback;
    }
  }
  return { start, end };
}

function buildRsvpInviteIcs(event: EventRow, rsvp: RsvpRow, organizerEmail: string | null): string {
  const { start, end } = parseEventDates(event);
  const base = publicBaseUrl();
  return buildIcsEvent({
    uid: `event-${event.id}-rsvp-${rsvp.id}@festival-planner`,
    start,
    end,
    durationMinutes: end ? undefined : 120,
    summary: event.title,
    description: event.description,
    location: event.location,
    url: base ? `${base}/events/${event.id}` : null,
    organizerEmail,
    attendeeEmail: rsvp.email,
    attendeeName: rsvp.name,
  });
}

export { buildRsvpInviteIcs, parseEventDates };

async function createMailTransport() {
  const nodemailer = await import('nodemailer');
  return nodemailer.default.createTransport({
    host: process.env.SMTP_HOST || 'localhost',
    port: Number(process.env.SMTP_PORT) || 587,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
}

/** POST /api/events/:eventId/rsvps/:id/send-confirmation */
export async function sendRsvpConfirmation(req: Request, res: Response): Promise<Response> {
  const authReq = req as AuthRequest;
  const { eventId, id } = req.params;
  const event = await requireEventAccess(authReq, res, eventId, { ownerOnly: true });
  if (!event) return res as Response;

  const db = getDatabase();
  const eventRow = await db.get<EventRow>(
    'SELECT id, title, description, location, date, end_date FROM events WHERE id = $1 AND deleted_at IS NULL',
    [eventId],
  );
  if (!eventRow) return res.status(404).json({ error: 'Event not found.' });

  const rsvp = await db.get<RsvpRow>(
    'SELECT id, name, email, canonical_status AS status, guests FROM rsvps WHERE id = $1 AND event_id = $2',
    [id, eventId],
  );
  if (!rsvp) return res.status(404).json({ error: 'RSVP not found.' });
  if (!rsvp.email) return res.status(400).json({ error: 'RSVP has no email address.' });

  const ownerEmail = await db.get<{ email: string }>(
    'SELECT u.email FROM events e JOIN users u ON u.id = e.created_by WHERE e.id = $1',
    [eventId],
  );

  const ics = buildRsvpInviteIcs(eventRow, rsvp, ownerEmail?.email ?? null);
  const accessToken = await ensureRsvpAccessToken(db, rsvp.id);
  const base = publicBaseUrl();
  const rsvpLink = base
    ? `${base}/rsvp/${accessToken}`
    : `https://example.invalid/rsvp/${accessToken}`;

  const subject = `RSVP confirmed: ${eventRow.title}`;
  const text =
    `Hi ${rsvp.name},\n\n` +
    `Your RSVP for "${eventRow.title}" is confirmed (${rsvp.guests} guest${
      rsvp.guests === 1 ? '' : 's'
    }).\n` +
    (eventRow.location ? `Location: ${eventRow.location}\n` : '') +
    `Date: ${eventRow.date}\n\n` +
    `Manage your RSVP: ${rsvpLink}\n\n` +
    `A calendar invite is attached.\n`;

  // Log the message before send so analytics counts a confirmed attempt.
  const logResult = await db.run(
    `INSERT INTO communication_log (event_id, guest_email, communication_type, subject, content, status, sent_by, sent_at)
     VALUES ($1, $2, 'rsvp_confirmation', $3, $4, 'pending', $5, CURRENT_TIMESTAMP) RETURNING id`,
    [eventId, rsvp.email, subject, text, authReq.user?.id ?? null],
  );

  try {
    const transport = await createMailTransport();
    const fromAddress =
      process.env.SMTP_FROM || process.env.SMTP_USER || 'noreply@festival-planner.local';
    await transport.sendMail({
      from: fromAddress,
      to: rsvp.email,
      subject,
      text,
      attachments: [
        {
          filename: 'invite.ics',
          content: ics,
          contentType: 'text/calendar; charset=utf-8; method=REQUEST',
        },
      ],
    });
    if (logResult.lastID) {
      await db.run('UPDATE communication_log SET status = $1 WHERE id = $2', [
        'sent',
        logResult.lastID,
      ]);
    }
    return res.json({ sent: true, accessToken, rsvpLink });
  } catch (err) {
    if (logResult.lastID) {
      await db
        .run('UPDATE communication_log SET status = $1 WHERE id = $2', ['failed', logResult.lastID])
        .catch(() => undefined);
    }
    console.error('sendRsvpConfirmation failed:', err);
    return res.status(502).json({ error: 'Email send failed.' });
  }
}

/** GET /api/events/:eventId/rsvps/:id/ics — preview/download just the calendar payload */
export async function downloadRsvpIcs(req: Request, res: Response): Promise<Response> {
  const authReq = req as AuthRequest;
  const { eventId, id } = req.params;
  const event = await requireEventAccess(authReq, res, eventId, { allowMembers: true });
  if (!event) return res as Response;

  const db = getDatabase();
  const eventRow = await db.get<EventRow>(
    'SELECT id, title, description, location, date, end_date FROM events WHERE id = $1 AND deleted_at IS NULL',
    [eventId],
  );
  const rsvp = await db.get<RsvpRow>(
    'SELECT id, name, email, canonical_status AS status, guests FROM rsvps WHERE id = $1 AND event_id = $2',
    [id, eventId],
  );
  if (!eventRow || !rsvp) return res.status(404).json({ error: 'Not found.' });

  const ownerEmail = await db.get<{ email: string }>(
    'SELECT u.email FROM events e JOIN users u ON u.id = e.created_by WHERE e.id = $1',
    [eventId],
  );
  const ics = buildRsvpInviteIcs(eventRow, rsvp, ownerEmail?.email ?? null);
  res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="event-${eventId}.ics"`);
  return res.send(ics);
}

/**
 * GET /api/events/:eventId/rsvps/:id/qr.svg
 * Returns an inline SVG QR code that links to the public RSVP page.
 */
export async function getRsvpQr(req: Request, res: Response): Promise<Response> {
  const authReq = req as AuthRequest;
  const { eventId, id } = req.params;
  const event = await requireEventAccess(authReq, res, eventId, { allowMembers: true });
  if (!event) return res as Response;

  const db = getDatabase();
  const rsvp = await db.get<{ id: number }>(
    'SELECT id FROM rsvps WHERE id = $1 AND event_id = $2',
    [id, eventId],
  );
  if (!rsvp) return res.status(404).json({ error: 'RSVP not found.' });

  const token = await ensureRsvpAccessToken(db, rsvp.id);
  const base = publicBaseUrl() ?? 'https://example.invalid';
  const url = `${base}/rsvp/${token}`;
  const svg = renderQrSvg(url, { scale: 6, quietZone: 4 });
  res.setHeader('Content-Type', 'image/svg+xml; charset=utf-8');
  res.setHeader('Cache-Control', 'private, max-age=300');
  return res.send(svg);
}
