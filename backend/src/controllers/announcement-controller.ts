/**
 * Announcement controller — send email to all Going RSVPs in one action (#671).
 *
 * POST /api/events/:eventId/announcements
 *
 * Also handles email bounce webhook for provider feedback:
 * POST /webhooks/email/bounce
 */
import { Request, Response } from 'express';
import { getDatabase } from '../db/database.js';
import { requireEventAccess } from '../utils/event-access.js';
import { logger } from '../utils/logger.js';
import { sendMail } from '../utils/mailer.js';

interface AuthRequest extends Request {
  user?: { id: number; email: string; role_id: number };
}

/**
 * POST /api/events/:eventId/announcements
 * Sends an announcement email to all Going (non-waitlisted) RSVPs.
 */
export async function sendAnnouncement(req: AuthRequest, res: Response): Promise<Response> {
  if (!req.user) return res.status(401).json({ error: 'Authentication required.' });

  const { eventId } = req.params;
  const { subject, body } = req.body as { subject?: string; body?: string };

  if (!subject || !body) {
    return res.status(400).json({ error: 'subject and body are required.' });
  }

  const db = getDatabase();

  const access = await requireEventAccess(req, res, eventId);
  if (!access) return res as Response;

  const event = await db.get<{ id: number; title: string }>(
    'SELECT id, title FROM events WHERE id = $1 AND deleted_at IS NULL',
    [eventId],
  );
  if (!event) return res.status(404).json({ error: 'Event not found.' });

  // Get all Going RSVPs with valid email
  const recipients = await db.all<{ user_id: number | null; email: string; display_name: string }>(
    `SELECT r.user_id, COALESCE(u.email, r.guest_email) AS email,
            COALESCE(u.display_name, r.guest_name) AS display_name
     FROM rsvps r
     LEFT JOIN users u ON u.id = r.user_id
     WHERE r.event_id = $1
       AND r.status = 'Going'
       AND r.waitlist_position IS NULL
       AND COALESCE(u.deleted_at, r.deleted_at) IS NULL`,
    [eventId],
  );

  if (recipients.length === 0) {
    return res.status(200).json({ message: 'No Going RSVPs to notify.', sent: 0 });
  }

  // Log announcement entry, batch process in groups of 50
  const BATCH_SIZE = 50;
  let successCount = 0;
  let failCount = 0;

  for (let i = 0; i < recipients.length; i += BATCH_SIZE) {
    const batch = recipients.slice(i, i + BATCH_SIZE);
    for (const recipient of batch) {
      if (!recipient.email) continue;
      let status: 'sent' | 'failed' | 'queued' = 'sent';
      try {
        // Attempt the actual send first; sendMail falls back to console.info
        // when SMTP_HOST is unset, so dev/test paths still flow through here.
        await sendMail({ to: recipient.email, subject, text: body });
      } catch (err) {
        status = 'failed';
        logger.warn('[Announcement] sendMail failed', {
          recipient: recipient.email,
          error: String(err),
        });
      }
      try {
        await db.run(
          `INSERT INTO communication_log
             (event_id, user_id, channel, subject, body, status, sent_at)
           VALUES ($1, $2, 'email', $3, $4, $5, CURRENT_TIMESTAMP)`,
          [eventId, recipient.user_id ?? null, subject, body, status],
        );
        if (status === 'sent') successCount++;
        else failCount++;
      } catch (err) {
        failCount++;
        logger.warn('[Announcement] Failed to log communication_log row', {
          recipient: recipient.email,
          error: String(err),
        });
      }
    }
  }

  logger.info(`[Announcement] Dispatched announcement for event ${eventId}`, {
    total: recipients.length,
    sent: successCount,
    failed: failCount,
  });

  return res.json({
    message: 'Announcement dispatched.',
    total: recipients.length,
    sent: successCount,
    failed: failCount,
  });
}

/**
 * POST /webhooks/email/bounce
 * Processes email provider bounce/complaint webhooks.
 * Marks hard-bounced addresses as unsubscribed in communication_log and users table.
 */
export async function handleEmailBounce(req: Request, res: Response): Promise<Response> {
  // Validate provider webhook signature header (provider-specific)
  // For now we process the payload structure common to SendGrid/Mailgun/Postmark
  const events = Array.isArray(req.body) ? req.body : [req.body];
  const db = getDatabase();

  let processed = 0;
  for (const event of events) {
    const email: string | undefined = event.email ?? event.recipient ?? event.To;
    const eventType: string | undefined = event.event ?? event.type ?? event['event-data']?.event;
    if (!email) continue;

    if (eventType === 'bounce' || eventType === 'hard_bounce' || eventType === 'failed') {
      const normalizedEmail = email.trim().toLowerCase();
      // Mark user as unsubscribed
      await db.run(
        `UPDATE users SET email_unsubscribed = true, updated_at = CURRENT_TIMESTAMP
         WHERE LOWER(email) = $1`,
        [normalizedEmail],
      );
      // Log the bounce
      await db.run(
        `UPDATE communication_log SET status = 'bounced', updated_at = CURRENT_TIMESTAMP
         WHERE LOWER(recipient_email) = $1 AND status = 'sent'`,
        [normalizedEmail],
      );
      logger.info('[Bounce] Hard bounce processed', { email: normalizedEmail, type: eventType });
      processed++;
    } else if (eventType === 'open') {
      // Track email opens
      const messageId: string | undefined =
        event.sg_message_id ?? event['message-id'] ?? event.MessageID;
      if (messageId) {
        await db.run(
          `UPDATE communication_log SET opened = true, opened_at = CURRENT_TIMESTAMP
           WHERE email_provider_message_id = $1`,
          [messageId],
        );
      }
    }
  }

  return res.status(200).json({ processed });
}

/**
 * GET /api/events/:eventId/communication/stats
 * Returns delivery statistics for an event's communication history.
 */
export async function getCommunicationStats(req: AuthRequest, res: Response): Promise<Response> {
  if (!req.user) return res.status(401).json({ error: 'Authentication required.' });

  const { eventId } = req.params;
  const db = getDatabase();

  const stats = await db.get(
    `SELECT
       COUNT(*) AS total,
       COUNT(*) FILTER (WHERE status = 'sent')    AS sent,
       COUNT(*) FILTER (WHERE status = 'queued')  AS queued,
       COUNT(*) FILTER (WHERE status = 'failed')  AS failed,
       COUNT(*) FILTER (WHERE status = 'bounced') AS bounced,
       COUNT(*) FILTER (WHERE opened = true)      AS opened
     FROM communication_log
     WHERE event_id = $1`,
    [eventId],
  );

  return res.json(stats ?? { total: 0, sent: 0, queued: 0, failed: 0, bounced: 0, opened: 0 });
}
