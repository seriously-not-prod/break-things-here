/**
 * Email Service Abstraction
 *
 * Validates email configuration on startup and provides a sendEmail function
 * that gracefully falls back to logging when SMTP is not configured.
 *
 * Addresses: #245 (Story)
 */

import nodemailer, { Transporter } from 'nodemailer';
import logger from './logger.js';

interface EmailOptions {
  to: string;
  subject: string;
  text?: string;
  html?: string;
}

interface EmailConfig {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  from: string;
}

let transporter: Transporter | null = null;
let emailConfigured = false;

/**
 * Reads SMTP environment variables and returns the config if all required
 * values are present, or null otherwise.
 */
function loadEmailConfig(): EmailConfig | null {
  const host = process.env.SMTP_HOST;
  const port = parseInt(process.env.SMTP_PORT || '587', 10);
  const secure = process.env.SMTP_SECURE === 'true';
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const from = process.env.SMTP_FROM || '';

  if (!host || !user || !pass) {
    return null;
  }

  return { host, port, secure, user, pass, from };
}

/**
 * Validates email configuration on startup.
 * Logs a clear warning if env vars are missing and enables log-only fallback.
 * Should be called once during server initialization.
 */
export function validateEmailConfig(): boolean {
  const config = loadEmailConfig();

  if (!config) {
    logger.warn(
      { missing: getMissingVars() },
      'Email SMTP not configured — emails will be logged but not sent. ' +
      'Set SMTP_HOST, SMTP_USER, SMTP_PASS in environment to enable.',
    );
    emailConfigured = false;
    return false;
  }

  transporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: { user: config.user, pass: config.pass },
  });

  emailConfigured = true;
  logger.info({ host: config.host, port: config.port }, 'Email SMTP configured successfully');
  return true;
}

/**
 * Returns a list of required SMTP env vars that are missing.
 */
function getMissingVars(): string[] {
  const required = ['SMTP_HOST', 'SMTP_USER', 'SMTP_PASS'];
  return required.filter((key) => !process.env[key]);
}

/**
 * Returns whether the email provider is fully configured and ready to send.
 */
export function isEmailConfigured(): boolean {
  return emailConfigured;
}

/**
 * Sends an email or logs it if SMTP is not configured (log-only fallback).
 *
 * @param options - Email recipient, subject, and body
 * @returns true if sent (or logged in fallback mode)
 */
export async function sendEmail(options: EmailOptions): Promise<boolean> {
  if (!emailConfigured || !transporter) {
    // Fallback: log the email content for development/testing visibility
    logger.info(
      { to: options.to, subject: options.subject, fallback: true },
      `[EMAIL FALLBACK] To: ${options.to} | Subject: ${options.subject}`,
    );
    return true;
  }

  const config = loadEmailConfig()!;
  try {
    await transporter.sendMail({
      from: config.from,
      to: options.to,
      subject: options.subject,
      text: options.text,
      html: options.html,
    });
    logger.info({ to: options.to, subject: options.subject }, 'Email sent successfully');
    return true;
  } catch (err) {
    logger.error({ err, to: options.to, subject: options.subject }, 'Failed to send email');
    return false;
  }
}
