import { requireAuth } from '../../middleware/rbac';
import { ApiRequest, ApiResponse } from '../../types/api';
import { createUser } from '../../data/user-store';

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
  const { email, displayName, password } = req.body as RegisterBody;

  if (!email || !displayName || !password) {
    res.status(400).json({ error: 'email, displayName, and password are required' });
    return;
  }

  // In production, hash the password with bcrypt (Task #23).
  // Role is NOT accepted from the request — always defaults to Attendee.
  const user = createUser({
    email,
    displayName,
    passwordHash: `hashed:${password}`, // placeholder
  });

  res.status(201).json(user);
}
