import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { inMemoryUserStore, UserStore } from './userStore';
import { generateConfirmationToken } from '../../utils/confirmation-token';

const SALT_ROUNDS = 12;
const PASSWORD_MIN_LENGTH = 8;

/** RFC 5321 max lengths */
const MAX_EMAIL_LENGTH = 254;
const MAX_LOCAL_LENGTH = 64;

/**
 * Validate an email address without using a regex that can catastrophically
 * backtrack on adversarial input (ReDoS / CWE-1333).
 *
 * Uses a structural split-and-check approach:
 *   1. Enforce RFC 5321 maximum total length (254 chars).
 *   2. Require exactly one '@' that is neither first nor last character.
 *   3. Enforce RFC 5321 local-part maximum length (64 chars).
 *   4. Require the domain to contain a '.' with content on both sides.
 *   5. Reject any whitespace anywhere in the address.
 *
 * This runs in O(n) time with no risk of polynomial backtracking.
 */
function isValidEmailFormat(email: string): boolean {
  if (email.length > MAX_EMAIL_LENGTH) return false;
  if (/\s/.test(email)) return false;           // single-pass whitespace check

  const atIndex = email.indexOf('@');
  // Must have exactly one '@', not at position 0, not at the last position
  if (atIndex <= 0 || atIndex !== email.lastIndexOf('@')) return false;

  const local = email.slice(0, atIndex);
  const domain = email.slice(atIndex + 1);

  if (local.length > MAX_LOCAL_LENGTH || domain.length < 3) return false;

  // Domain must have a '.' with at least one character on each side
  const lastDot = domain.lastIndexOf('.');
  if (lastDot <= 0 || lastDot >= domain.length - 1) return false;

  return true;
}

interface ValidationError {
  field: string;
  message: string;
}

/**
 * Validate the registration request body.
 * Returns a list of field-level errors; empty array means valid.
 */
function validateRegistration(body: unknown): ValidationError[] {
  const errors: ValidationError[] = [];
  const data = body as Record<string, unknown>;

  if (!data['name'] || typeof data['name'] !== 'string' || !data['name'].trim()) {
    errors.push({ field: 'name', message: 'Name is required.' });
  }

  if (
    !data['email'] ||
    typeof data['email'] !== 'string' ||
    !isValidEmailFormat(data['email'])
  ) {
    errors.push({ field: 'email', message: 'A valid email address is required.' });
  }

  if (
    !data['password'] ||
    typeof data['password'] !== 'string' ||
    data['password'].length < PASSWORD_MIN_LENGTH
  ) {
    errors.push({
      field: 'password',
      message: `Password must be at least ${PASSWORD_MIN_LENGTH} characters long.`,
    });
  }

  return errors;
}

/**
 * Creates the POST /register route.
 *
 * - Validates name, email, and password strength.
 * - Normalises email to lower-case before storage.
 * - Hashes the password with bcrypt (12 rounds).
 * - Rejects duplicate emails with a generic 409 message (no user enumeration).
 * - Generates an email confirmation token on success.
 *
 * @param userStore - Injectable user store (defaults to in-memory; swap for DB in production)
 */
export function createRegisterRouter(userStore: UserStore = inMemoryUserStore): Router {
  const router = Router();

  router.post('/register', async (req: Request, res: Response): Promise<void> => {
    const errors = validateRegistration(req.body);
    if (errors.length > 0) {
      res.status(400).json({ errors });
      return;
    }

    const { name, email, password } = req.body as {
      name: string;
      email: string;
      password: string;
    };

    const normalizedEmail = email.toLowerCase();

    // Duplicate detection — generic message prevents user enumeration
    const existing = await userStore.findByEmail(normalizedEmail);
    if (existing) {
      res.status(409).json({
        errors: [{ field: 'email', message: 'This email address cannot be used.' }],
      });
      return;
    }

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

    await userStore.create({
      name: name.trim(),
      email: normalizedEmail,
      passwordHash,
    });

    // Generate email confirmation token (fire-and-forget in this demo).
    // In production, pass the token to sendConfirmationEmail().
    generateConfirmationToken(normalizedEmail);

    res.status(201).json({ message: 'Registration successful' });
  });

  return router;
}

