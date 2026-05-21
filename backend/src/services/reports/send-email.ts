/**
 * Scheduled-report email delivery service (#814).
 *
 * Encapsulates the full lifecycle:
 *   1. Build report payload via renderPayload
 *   2. Send email with unsubscribe link to each recipient
 *   3. Retry failed sends with exponential backoff (3 attempts)
 *   4. Record delivery row in scheduled_report_deliveries
 */
import { getDatabase } from '../../db/database.js';
import { sendMail } from '../../utils/mailer.js';
import { logger } from '../../utils/logger.js';
import { renderPayload } from '../../controllers/reports-controller.js';

const MAX_ATTEMPTS = 3;
const BASE_DELAY_MS = 1000; // 1s, 2s, 4s exponential backoff

interface ScheduledReport {
  id: number;
  report_type: string;
  recipients: unknown;
  event_id: number | null;
}

/**
 * Sleep helper for exponential backoff between retries.
 */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Build the unsubscribe URL for a given report.
 * Uses APP_BASE_URL env var or falls back to localhost.
 */
function buildUnsubscribeUrl(reportId: number): string {
  const base = process.env.APP_BASE_URL ?? 'http://localhost:3000';
  return `${base}/api/reports/${reportId}/unsubscribe`;
}

/**
 * Attempt to send an email with exponential backoff retry.
 * Returns true on success, throws on exhausted retries.
 */
async function sendWithRetry(
  to: string,
  subject: string,
  text: string,
  html: string,
): Promise<void> {
  let lastError: unknown;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    try {
      await sendMail({ to, subject, text, html });
      return;
    } catch (err: unknown) {
      lastError = err;
      if (attempt < MAX_ATTEMPTS - 1) {
        const backoff = BASE_DELAY_MS * Math.pow(2, attempt);
        logger.warn(
          `[ReportEmail] Attempt ${attempt + 1} failed for ${to}, retrying in ${backoff}ms`,
        );
        await delay(backoff);
      }
    }
  }
  throw lastError;
}

/**
 * Send a scheduled report email to all recipients.
 *
 * Called by dispatchScheduledReports() for each due report.
 * Creates a delivery row in scheduled_report_deliveries with
 * status 'sent' or 'failed'.
 */
export async function sendReportEmail(report: ScheduledReport): Promise<void> {
  const db = getDatabase();
  const eventId = report.event_id ? String(report.event_id) : null;

  if (!eventId) {
    logger.warn(`[ReportEmail] Skipping report ${report.id}: no event_id`);
    return;
  }

  // Build email content from report payload
  let emailText: string;
  let emailHtml: string;
  let deliveryStatus: 'success' | 'failed' = 'success';
  let deliveryError: string | null = null;

  const unsubscribeUrl = buildUnsubscribeUrl(report.id);

  try {
    const payload = await renderPayload(eventId, report.report_type);
    emailText = [
      `Scheduled report: ${report.report_type}`,
      `Generated: ${new Date().toUTCString()}`,
      '',
      JSON.stringify(payload, null, 2),
      '',
      `To unsubscribe from this report: ${unsubscribeUrl}`,
    ].join('\n');
    emailHtml = [
      `<h2>Scheduled Report: ${report.report_type}</h2>`,
      `<p>Generated: ${new Date().toUTCString()}</p>`,
      `<pre>${JSON.stringify(payload, null, 2)}</pre>`,
      `<hr/>`,
      `<p><a href="${unsubscribeUrl}">Unsubscribe</a> from this scheduled report.</p>`,
    ].join('\n');
  } catch (payloadErr: unknown) {
    deliveryStatus = 'failed';
    deliveryError = payloadErr instanceof Error ? payloadErr.message : String(payloadErr);
    emailText = `Report generation failed: ${deliveryError}`;
    emailHtml = `<p>Report generation failed: ${deliveryError}</p>`;
    logger.error(`[ReportEmail] Failed to render payload for report ${report.id}`, {
      error: deliveryError,
    });
  }

  // Parse recipients — stored as a JSON array in the DB.
  let recipientList: string[] = [];
  try {
    const parsed: unknown =
      typeof report.recipients === 'string'
        ? (JSON.parse(report.recipients) as unknown)
        : report.recipients;
    if (Array.isArray(parsed)) {
      recipientList = parsed.filter((r): r is string => typeof r === 'string');
    }
  } catch {
    logger.warn(`[ReportEmail] Could not parse recipients for report ${report.id}`);
  }

  // Send to each recipient with retry; track per-recipient failures.
  for (const recipient of recipientList) {
    try {
      await sendWithRetry(
        recipient,
        `Scheduled Report: ${report.report_type}`,
        emailText,
        emailHtml,
      );
      logger.info(`[ReportEmail] Sent report ${report.id} to ${recipient}`);
    } catch (mailErr: unknown) {
      deliveryStatus = 'failed';
      deliveryError = mailErr instanceof Error ? mailErr.message : String(mailErr);
      logger.error(
        `[ReportEmail] Failed to send report ${report.id} to ${recipient} after ${MAX_ATTEMPTS} attempts`,
        {
          error: deliveryError,
        },
      );
    }
  }

  // Record delivery attempt for audit trail.
  try {
    await db.run(
      `INSERT INTO scheduled_report_deliveries (report_id, recipients, status, error_message)
       VALUES ($1, $2::jsonb, $3, $4)`,
      [
        report.id,
        JSON.stringify(recipientList),
        deliveryStatus === 'success' ? 'success' : 'failed',
        deliveryError,
      ],
    );
  } catch (auditErr: unknown) {
    logger.error(`[ReportEmail] Failed to record delivery for report ${report.id}`, {
      error: String(auditErr),
    });
  }
}
