import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { inMemoryUserStore } from './userStore';

/**
 * Safe linear-time email validator — avoids ReDoS from polynomial backtracking.
 * Checks: single @, non-empty local, non-empty domain with at least one dot.
 */
function isValidEmail(email: string): boolean {
  const atIndex = email.indexOf('@');
  if (atIndex <= 0 || atIndex !== email.lastIndexOf('@')) return false;
  const local = email.slice(0, atIndex);
  const domain = email.slice(atIndex + 1);
  if (!local || !domain) return false;
  const dotIndex = domain.lastIndexOf('.');
  if (dotIndex <= 0 || dotIndex === domain.length - 1) return false;
  return !local.includes(' ') && !domain.includes(' ');
}

interface RegisterBody {
  name?: string;
  email?: string;
  password?: string;
}

interface FieldError {
  field: string;
  message: string;
}

function validateRegisterBody(body: RegisterBody): FieldError[] {
  const errors: FieldError[] = [];

  if (!body.name || !body.name.trim()) {
    errors.push({ field: 'name', message: 'Name is required' });
  }

  if (!body.email) {
    errors.push({ field: 'email', message: 'Email is required' });
  } else if (!isValidEmail(body.email)) {
    errors.push({ field: 'email', message: 'Email must be a valid email address' });
  }

  if (!body.password) {
    errors.push({ field: 'password', message: 'Password is required' });
  } else if (body.password.length < 8) {
    errors.push({ field: 'password', message: 'Password must be at least 8 characters' });
  }

  return errors;
}

/**
 * POST /api/auth/register
 *
 * Registers a new user account.
 * Accepts { name, email, password }. Returns 201 on success.
 */
export async function handleRegister(req: Request, res: Response): Promise<void> {
  const body = req.body as RegisterBody;
  const errors = validateRegisterBody(body);

  if (errors.length > 0) {
    res.status(400).json({ errors });
    return;
  }

  const normalizedEmail = body.email!.toLowerCase();

  const existing = await inMemoryUserStore.findByEmail(normalizedEmail);
  if (existing) {
    res.status(409).json({
      errors: [{ field: 'email', message: 'This email address cannot be used' }],
    });
    return;
  }

  const passwordHash = await bcrypt.hash(body.password!, 12);

  await inMemoryUserStore.create({
    name: body.name!.trim(),
    email: normalizedEmail,
    passwordHash,
  });

  res.status(201).json({ message: 'Registration successful' });
}

/**
 * Creates an Express router for the registration endpoint.
 */
export function createRegisterRouter(): Router {
  const router = Router();
  router.post('/register', handleRegister);
  return router;
}
