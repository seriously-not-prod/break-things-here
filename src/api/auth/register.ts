import { scryptSync, randomBytes } from 'crypto';
import { ApiRequest, ApiResponse } from '../../types/api';
import { createUser, findUserByEmail } from '../../data/user-store';

/**
 * Accepted fields in the registration request body.
 * The role field is intentionally excluded — all new users get Attendee.
 */
interface RegisterBody {
  email?: string;
  displayName?: string;
  password?: string;
}

/**
 * POST /api/auth/register
 *
 * Registers a new user. Role is always set to Attendee and cannot
 * be specified by the caller.
 *
 * Request body: { email, displayName, password }
 * Responses:
 *   201 — User created (returns public user data)
 *   400 — Missing required fields
 */
export function handleRegister(req: ApiRequest, res: ApiResponse): void {
  const body = req.body;

  if (!body || typeof body !== 'object') {
    res.status(400).json({ error: 'Invalid request body' });
    return;
  }

  const { email, displayName, password } = body as RegisterBody;

  if (
    typeof email !== 'string' ||
    typeof displayName !== 'string' ||
    typeof password !== 'string' ||
    !email.trim() ||
    !displayName.trim() ||
    !password
  ) {
    res.status(400).json({ error: 'email, displayName, and password are required' });
    return;
  }

  // Validate email format
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    res.status(400).json({ error: 'Invalid email format' });
    return;
  }

  // Check for duplicate email
  if (findUserByEmail(email)) {
    res.status(409).json({ error: 'Email already registered' });
    return;
  }

  // Sanitize displayName to prevent XSS
  const sanitizedDisplayName = displayName
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // Hash password with scrypt (secure, built-in, synchronous)
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, 64).toString('hex');
  const passwordHash = `${salt}:${hash}`;

  // Role is NOT accepted from the request — always defaults to Attendee.
  const user = createUser({
    email,
    displayName: sanitizedDisplayName,
    passwordHash,
  });

  res.status(201).json(user);
}
