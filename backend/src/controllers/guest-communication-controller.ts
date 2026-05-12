import { Request, Response } from 'express';
import { getDatabase } from '../db/database.js';
import { requireEventAccess } from '../utils/event-access.js';
import { embedTracking } from '../utils/embed-tracking.js';
import { personalize, buildGuestTokens } from '../utils/template-personalization.js';
import { ensureUnsubscribeToken, buildUnsubscribeUrl } from '../utils/unsubscribe-token.js';

function getTrackingBaseUrl(): string | null {
  const explicit = process.env.PUBLIC_BASE_URL?.trim();
  if (explicit) return explicit.replace(/\/$/, '');
  return null;
}

interface AuthRequest extends Request {
  user?: { id: number; email: string; role_id: number };
}

interface RsvpRow {
  id: number;
  name: string;
  email: string;
  status: string;
  unsubscribed_at: string | null;
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
  const { eventId } = req.params;

  const authorizedEvent = await requireEventAccess(authReq, res, eventId, { ownerOnly: true });
  if (!authorizedEvent) return res as Response;
  const senderUserId = authReq.user!.id;

  const { rsvpIds, subject, body, templateId, ignoreUnsubscribed } = req.body as {
    rsvpIds?: number[];
    subject?: string;
    body?: string;
    templateId?: number;
    ignoreUnsubscribed?: boolean;
  };

  const db = getDatabase();

  // If templateId is supplied, hydrate subject + body from the saved template.
  let effectiveSubject = subject ?? '';
  let effectiveBody = body ?? '';
  if (templateId) {
    const tpl = await db.get<{ subject: string; body: string }>(
      `SELECT subject, body FROM communication_templates WHERE id = ?
       AND (event_id = ? OR event_id IS NULL)`,
      [templateId, eventId],
    );
    if (!tpl) return res.status(404).json({ error: 'Template not found.' });
    effectiveSubject = effectiveSubject || tpl.subject;
    effectiveBody = effectiveBody || tpl.body;
  }

  if (!effectiveSubject.trim()) return res.status(400).json({ error: 'Subject is required.' });
  if (!effectiveBody.trim()) return res.status(400).json({ error: 'Body is required.' });

  const event = await db.get<{ id: number; title: string; date: string | null; location: string | null }>(
    'SELECT id, title, date, location FROM events WHERE id = ? AND deleted_at IS NULL',
    [eventId],
  );
  if (!event) return res.status(404).json({ error: 'Event not found.' });

  // Resolve recipients
  let recipients: RsvpRow[];
  if (rsvpIds && rsvpIds.length > 0) {
    const placeholders = rsvpIds.map(() => '?').join(', ');
    recipients = await db.all<RsvpRow>(
      `SELECT id, name, email, status, unsubscribed_at FROM rsvps WHERE event_id = ? AND id IN (${placeholders})`,
      [eventId, ...rsvpIds],
    );
  } else {
    recipients = await db.all<RsvpRow>(
      `SELECT id, name, email, status, unsubscribed_at FROM rsvps
       WHERE event_id = ? AND status IN ('Going', 'Pending')`,
      [eventId],
    );
  }

  // Suppress unsubscribed recipients unless the admin explicitly overrides —
  // this is the bulk-send protection required by #545/#590.
  const suppressed: RsvpRow[] = [];
  if (!ignoreUnsubscribed) {
    const kept: RsvpRow[] = [];
    for (const r of recipients) {
      if (r.unsubscribed_at) suppressed.push(r);
      else kept.push(r);
    }
    recipients = kept;
  }

  let sent = 0;
  let failed = 0;

  const transport = await createMailTransport();
  const fromAddress =
    process.env.SMTP_FROM || process.env.SMTP_USER || 'noreply@festival-planner.local';

  const trackingBaseUrl = getTrackingBaseUrl();

  for (const rsvp of recipients) {
    const unsubToken = trackingBaseUrl
      ? await ensureUnsubscribeToken(db, rsvp.id).catch(() => null)
      : null;
    const unsubscribeUrl = trackingBaseUrl && unsubToken
      ? buildUnsubscribeUrl(trackingBaseUrl, unsubToken)
      : '';

    const tokens = buildGuestTokens({
      name: rsvp.name,
      email: rsvp.email,
      eventTitle: event.title,
      eventDate: event.date,
      eventLocation: event.location,
      unsubscribeUrl,
      status: rsvp.status,
    });

    const personalised = personalize(effectiveBody, tokens);
    const personalisedSubject = personalize(effectiveSubject, tokens);
    // Append a plain-text unsubscribe footer to every bulk send (#545) — the
    // tracker injects an HTML version too.
    const finalText = unsubscribeUrl
      ? `${personalised}\n\n---\nTo stop receiving these messages: ${unsubscribeUrl}`
      : personalised;

    let logId: number | undefined;
    try {
      const logResult = await db.run(
        `INSERT INTO communication_log (event_id, guest_email, communication_type, subject, content, status, sent_by, sent_at)
         VALUES (?, ?, ?, ?, ?, 'pending', ?, CURRENT_TIMESTAMP) RETURNING id`,
        [eventId, rsvp.email, type, personalisedSubject, finalText, senderUserId],
      );
      logId = logResult.lastID;
    } catch {
      failed++;
      continue;
    }

    const htmlBody = trackingBaseUrl && logId
      ? embedTracking(
          unsubscribeUrl
            ? `${personalised}<hr><p style="font-size:12px;color:#6b7280">Don't want these emails? <a href="${unsubscribeUrl}">Unsubscribe</a>.</p>`
            : personalised,
          trackingBaseUrl,
          logId,
        )
      : null;

    try {
      await transport.sendMail({
        from: fromAddress,
        to: rsvp.email,
        subject: personalisedSubject,
        text: finalText,
        ...(htmlBody ? { html: htmlBody } : {}),
      });
      sent++;
      if (logId) {
        try {
          await db.run('UPDATE communication_log SET status = ? WHERE id = ?', ['sent', logId]);
        } catch {
          /* swallow — best-effort, send already succeeded */
        }
      }
    } catch {
      if (logId) {
        try {
          await db.run('UPDATE communication_log SET status = ? WHERE id = ?', ['failed', logId]);
        } catch {
          /* swallow — original failure already counted */
        }
      }
      failed++;
    }
  }

  return res.json({
    sent,
    failed,
    suppressed: suppressed.length,
    suppressedEmails: suppressed.map((s) => s.email),
  });
}

/** GET /api/events/:eventId/communication */
export async function listCommunicationLog(req: Request, res: Response): Promise<Response> {
  const authReq = req as AuthRequest;
  const { eventId } = req.params;

  const event = await requireEventAccess(authReq, res, eventId, { allowMembers: true });
  if (!event) return res as Response;

  const db = getDatabase();

  const log = await db.all(
    `SELECT
       cl.id,
       cl.event_id,
       cl.guest_email,
       cl.communication_type,
       cl.subject,
       cl.content,
       cl.status,
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
