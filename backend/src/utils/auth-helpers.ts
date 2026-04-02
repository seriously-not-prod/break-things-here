import bcrypt from 'bcrypt';
import crypto from 'crypto';

const SALT_ROUNDS = 12;

export function validateEmailFormat(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

export async function verifyPassword(
  password: string,
  hash: string,
): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function generateVerificationToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

export async function sendVerificationEmail(
  email: string,
  token: string,
  baseUrl: string,
): Promise<void> {
  const confirmUrl = `${baseUrl}/verify-email?token=${encodeURIComponent(token)}`;

  try {
    const nodemailer = await import('nodemailer');
    const transport = nodemailer.default.createTransport({
      host: process.env.SMTP_HOST || 'localhost',
      port: Number(process.env.SMTP_PORT) || 587,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });

    await transport.sendMail({
      from: process.env.FROM_EMAIL || 'noreply@festival-planner.local',
      to: email,
      subject: 'Verify your email address',
      text: `Please verify your email by clicking the following link: ${confirmUrl}`,
    });
  } catch (err) {
    console.error('Failed to send verification email:', err);
    throw err;
  }
}
