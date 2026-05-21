import nodemailer, { type Transporter } from 'nodemailer';

/**
 * Thin wrapper around nodemailer that:
 *   1. Reads SMTP_HOST / SMTP_PORT / SMTP_USER / SMTP_PASS / SMTP_FROM /
 *      SMTP_SECURE from the environment. The names map cleanly onto AWS SES
 *      SMTP credentials (host = email-smtp.<region>.amazonaws.com, port 587,
 *      STARTTLS) but the same shape works for any SMTP provider — SendGrid,
 *      Mailgun, Postmark, a self-hosted MTA, etc.
 *   2. **Fails open into a no-network fallback** when SMTP_HOST is unset: the
 *      message is `console.info`'d so dev/test environments don't need real
 *      credentials and existing behaviour is preserved.
 *   3. Caches the transporter so we don't reopen the SMTP connection per
 *      message under load. Re-reads env on the first call only — restart the
 *      process to pick up rotated credentials.
 *
 * Public surface is the two `send*` helpers; controllers should not import
 * nodemailer directly so we have a single place to swap providers later.
 */

let cachedTransporter: Transporter | null = null;
let cachedFrom: string | null = null;

function getTransporter(): Transporter | null {
  if (cachedTransporter !== null) return cachedTransporter;

  const host = process.env.SMTP_HOST;
  if (!host) return null;

  const port = Number(process.env.SMTP_PORT || '587');
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const secure = (process.env.SMTP_SECURE ?? '').toLowerCase() === 'true' || port === 465;

  cachedTransporter = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: user && pass ? { user, pass } : undefined,
  });
  cachedFrom = process.env.SMTP_FROM ?? user ?? 'no-reply@localhost';
  return cachedTransporter;
}

export interface SendOptions {
  to: string;
  subject: string;
  text?: string;
  html?: string;
}

/**
 * Send a transactional email. When SMTP is not configured this falls back to
 * a structured console.info so dev/test paths continue to work and the
 * sequence is still observable in logs.
 *
 * Throws only on transport-level failures when SMTP *is* configured —
 * callers should usually await without catching: a failed verification email
 * is itself a security event worth surfacing in the request response.
 */
export async function sendMail(options: SendOptions): Promise<void> {
  const transporter = getTransporter();
  if (!transporter) {
    // No SMTP wired — mirror the previous console.info fallback so tests and
    // local dev keep working without external credentials.
    console.info(
      `[mailer] (no SMTP_HOST set) would send to ${options.to} — subject: ${options.subject}`,
    );
    return;
  }

  await transporter.sendMail({
    from: cachedFrom ?? undefined,
    to: options.to,
    subject: options.subject,
    text: options.text,
    html: options.html,
  });
}

/** Convenience: render a verification link email (used by register + resend-verification). */
export async function sendVerificationEmail(toEmail: string, token: string): Promise<void> {
  const baseUrl = process.env.APP_BASE_URL ?? 'http://localhost:5173';
  const link = `${baseUrl.replace(/\/$/, '')}/verify-email?token=${encodeURIComponent(token)}`;
  await sendMail({
    to: toEmail,
    subject: 'Verify your email',
    text: `Confirm your email address by visiting: ${link}\n\nIf you did not create an account, you can ignore this message.`,
    html: `<p>Confirm your email address by visiting <a href="${link}">${link}</a>.</p>
<p>If you did not create an account, you can ignore this message.</p>`,
  });
}

/** Reset the cached transporter — exposed for tests. */
export function __resetMailerCacheForTests(): void {
  cachedTransporter = null;
  cachedFrom = null;
}
