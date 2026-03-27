import nodemailer, { Transporter } from 'nodemailer';

/** SMTP configuration sourced entirely from environment variables */
const SMTP_HOST = process.env.SMTP_HOST ?? 'localhost';
const SMTP_PORT = parseInt(process.env.SMTP_PORT ?? '587', 10);
const SMTP_SECURE = process.env.SMTP_SECURE === 'true';
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;
const EMAIL_FROM = process.env.EMAIL_FROM ?? 'no-reply@example.com';
const APP_BASE_URL = process.env.APP_BASE_URL ?? 'http://localhost:3000';

export class EmailError extends Error {
  constructor(message: string, public readonly cause?: Error) {
    super(message);
    this.name = 'EmailError';
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, EmailError);
    }
  }
}

/** Allow injecting a custom transporter in tests */
let _transporter: Transporter | null = null;

function getTransporter(): Transporter {
  if (_transporter) return _transporter;

  return nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_SECURE,
    ...(SMTP_USER && SMTP_PASS
      ? { auth: { user: SMTP_USER, pass: SMTP_PASS } }
      : {}),
  });
}

/**
 * Override the nodemailer transporter — used in tests to inject a mock.
 * Pass `null` to reset to the default SMTP transporter.
 */
export function setTransporter(transporter: Transporter | null): void {
  _transporter = transporter;
}

/**
 * Send a confirmation email with a one-click verification link.
 *
 * The link contains only the token — no user ID or email is embedded.
 *
 * @param email - Recipient email address
 * @param token - The confirmation token (hex string)
 */
export async function sendConfirmationEmail(email: string, token: string): Promise<void> {
  if (!email || typeof email !== 'string') {
    throw new EmailError('A valid recipient email is required');
  }
  if (!token || typeof token !== 'string') {
    throw new EmailError('A valid confirmation token is required');
  }

  // Only the token appears in the URL — no sensitive user data
  const confirmationUrl = `${APP_BASE_URL}/api/auth/confirm?token=${encodeURIComponent(token)}`;

  const transporter = getTransporter();

  try {
    await transporter.sendMail({
      from: EMAIL_FROM,
      to: email,
      subject: 'Confirm your email address',
      text: [
        'Thank you for registering.',
        '',
        'Please confirm your email address by clicking the link below:',
        confirmationUrl,
        '',
        'This link expires in 24 hours.',
        '',
        'If you did not create an account, you can safely ignore this email.',
      ].join('\n'),
      html: `
        <p>Thank you for registering.</p>
        <p>Please confirm your email address by clicking the link below:</p>
        <p><a href="${confirmationUrl}">Confirm my email</a></p>
        <p>This link expires in 24 hours.</p>
        <p>If you did not create an account, you can safely ignore this email.</p>
      `,
    });
  } catch (error) {
    // Never expose SMTP credentials or internals in error messages
    throw new EmailError(
      'Failed to send confirmation email',
      error instanceof Error ? error : undefined,
    );
  }
}
