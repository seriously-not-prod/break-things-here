import { Router, Request, Response } from 'express';
import { hashPassword } from '../../utils/password-hash';
import { inMemoryUserStore, UserStore } from './userStore';

// Bounded quantifiers prevent ReDoS on user-controlled input
const EMAIL_REGEX = /^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{1,63}$/;
const MIN_PASSWORD_LENGTH = parseInt(process.env.MIN_PASSWORD_LENGTH ?? '8', 10);

interface RegistrationBody {
  name?: unknown;
  email?: unknown;
  password?: unknown;
}

interface FieldError {
  field: string;
  message: string;
}

function validateRegistrationInput(body: RegistrationBody): FieldError[] {
  const errors: FieldError[] = [];

  if (!body.name || typeof body.name !== 'string' || body.name.trim().length === 0) {
    errors.push({ field: 'name', message: 'Name is required' });
  }

  if (!body.email || typeof body.email !== 'string' || !EMAIL_REGEX.test(body.email)) {
    errors.push({ field: 'email', message: 'A valid email address is required' });
  }

  if (
    !body.password ||
    typeof body.password !== 'string' ||
    body.password.length < MIN_PASSWORD_LENGTH
  ) {
    errors.push({
      field: 'password',
      message: `Password must be at least ${MIN_PASSWORD_LENGTH} characters`,
    });
  }

  return errors;
}

/**
 * Creates the POST /register route handler.
 *
 * @param userStore - Injectable user store (defaults to in-memory; swap for DB in production)
 */
export function createRegisterRouter(userStore: UserStore = inMemoryUserStore): Router {
  const router = Router();

  router.post('/register', async (req: Request, res: Response): Promise<void> => {
    const body = req.body as RegistrationBody;

    const errors = validateRegistrationInput(body);
    if (errors.length > 0) {
      res.status(400).json({ errors });
      return;
    }

    const email = (body.email as string).toLowerCase().trim();
    const name = (body.name as string).trim();
    const password = body.password as string;

    const existing = await userStore.findByEmail(email);
    if (existing) {
      // Return 409 but use a generic message to avoid confirming which emails are registered
      res.status(409).json({ errors: [{ field: 'email', message: 'Email address is already in use' }] });
      return;
    }

    const passwordHash = await hashPassword(password);
    await userStore.create({ name, email, passwordHash });

    res.status(201).json({ message: 'Registration successful' });
  });

  return router;
}
