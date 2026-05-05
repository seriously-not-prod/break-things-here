import { Request, Response } from 'express';
import { getDatabase } from '../db/database.js';

interface AuthRequest extends Request {
  user?: { id: number; email: string; role_id: number };
}

interface RsvpRow {
  id: number;
  name: string;
  email: string;
  status: string;
}

async function createMailTransport() {
  const nodemailer = await import('nodemailer');
  return nodemailer.default.createTransport({
    host: process.env.SMTP_HOST || 'localhost',
    port: Number(process.env.SMTP_PORT) || 587,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
}

/** POST /api/events/:eventId/communication/invite */
export async function bulkSendInvitation(req: Request, res: Response): Promise<Response> {
  return bulkSend(req, res, 'invitation');
}

/** POST /api/events/:eventId/communication/reminder */
export async function sendReminder(req: Request, res: Response): Promise<Response> {
  return bulkSend(req, res, 'reminder');
}

async function bulkSend(
  req: Request,
  res: Response,
  type: 'invitation' | 'reminder',
): Promise<Response> {
  const authReq = req as AuthRequest;
  if (!authReq.user) return res.status(401).json({ error: 'Authentication required.' });

  const { eventId } = req.params;
  const { rsvpIds, subject, body } = req.body as {
    rsvpIds?: number[];
    subject?: string;
    body?: string;
  };

  if (!subject?.trim()) return res.status(400).json({ error: 'Subject is required.' });
  if (!body?.trim()) return res.status(400).json({ error: 'Body is required.' });

  const db = getDatabase();

  const event = await db.get<{ id: number; title: string }>(
    'SELECT id, title FROM events WHERE id = ? AND deleted_at IS NULL',
    [eventId],
  );
  if (!event) return res.status(404).json({ error: 'Event not found.' });

  // Resolve recipients
  let recipients: RsvpRow[];
  if (rsvpIds && rsvpIds.length > 0) {
    // Build paramterised list — passed as separate params after eventId
    const placeholders = rsvpIds.map(() => '?').join(', ');
    recipients = await db.all<RsvpRow>(
      `SELECT id, name, email, status FROM rsvps WHERE event_id = ? AND id IN (${placeholders})`,
      [eventId, ...rsvpIds],
    );
  } else {
    // Default: confirmed + pending
    recipients = await db.all<RsvpRow>(
      `SELECT id, name, email, status FROM rsvps
       WHERE event_id = ? AND status IN ('Going', 'Pending')`,
      [eventId],
    );
  }

  let sent = 0;
  let failed = 0;

  const transport = await createMailTransport();
  const fromAddress =
    process.env.SMTP_FROM || process.env.SMTP_USER || 'noreply@festival-planner.local';

  for (const rsvp of recipients) {
    const personalised = body
      .replace(/\{name\}/gi, rsvp.name)
      .replace(/\{event\}/gi, event.title);

    try {
      await transport.sendMail({
        from: fromAddress,
        to: rsvp.email,
        subject: subject.replace(/\{event\}/gi, event.title),
        text: personalised,
      });

      await db.run(
        `INSERT INTO communication_log (event_id, rsvp_id, type, subject, body, sent_by)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [eventId, rsvp.id, type, subject, body, authReq.user.id],
      );

      sent++;
    } catch {
      failed++;
    }
  }

  return res.json({ sent, failed });
}

/** GET /api/events/:eventId/communication */
export async function listCommunicationLog(req: Request, res: Response): Promise<Response> {
  const authReq = req as AuthRequest;
  if (!authReq.user) return res.status(401).json({ error: 'Authentication required.' });

  const { eventId } = req.params;
  const db = getDatabase();

  const event = await db.get<{ id: number }>(
    'SELECT id FROM events WHERE id = ? AND deleted_at IS NULL',
    [eventId],
  );
  if (!event) return res.status(404).json({ error: 'Event not found.' });

  const log = await db.all(
    `SELECT
       cl.id,
       cl.event_id,
       cl.rsvp_id,
       cl.type,
       cl.subject,
       cl.body,
       cl.sent_by,
       u.display_name AS sent_by_name,
       cl.sent_at
     FROM communication_log cl
     LEFT JOIN users u ON u.id = cl.sent_by
     WHERE cl.event_id = ?
     ORDER BY cl.sent_at DESC`,
    [eventId],
  );

  return res.json({ log });
}
