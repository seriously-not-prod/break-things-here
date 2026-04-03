import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { inMemoryUserStore, UserStore } from './userStore';
import { issueToken, revokeToken } from '../../utils/session';
import {
  isLockedOut,
  recordFailedAttempt,
  resetAttempts,
} from '../../utils/login-attempt-tracker';

/**
 * Generic error message returned for any credential failure.
 * Using a single message prevents user enumeration (username harvesting).
 */
const INVALID_CREDENTIALS = { error: 'Invalid email or password.' };

/**
 * Creates the POST /login and POST /logout routes.
 *
 * Login:
 *   - Validates presence of email and password.
 *   - Enforces brute-force protection (locks account after 5 failures for 15 min).
 *   - Returns a generic error for any credential mismatch (prevents enumeration).
 *   - Requires email confirmation before allowing login.
 *   - Issues a JWT in the response body and as an httpOnly cookie.
 *
 * Logout:
 *   - Revokes the bearer token (deny-list).
 *   - Clears the session cookie.
 *
 * @param userStore - Injectable user store (defaults to in-memory; swap for DB in production).
 */
export function createLoginRouter(userStore: UserStore = inMemoryUserStore): Router {
  const router = Router();

  router.post('/login', async (req: Request, res: Response): Promise<void> => {
    const { email, password, rememberMe } = req.body as {
      email?: string;
      password?: string;
      rememberMe?: boolean;
    };

    if (!email || typeof email !== 'string' || !password || typeof password !== 'string') {
      res.status(400).json({ error: 'Email and password are required.' });
      return;
    }

    const normalizedEmail = email.toLowerCase();

    // Brute-force check before touching the database
    if (isLockedOut(normalizedEmail)) {
      res.status(429).json({
        error: 'Account temporarily locked due to too many failed attempts. Please try again later.',
      });
      return;
    }

    const user = await userStore.findByEmail(normalizedEmail);

    // Use generic error to avoid leaking whether the email exists
    if (!user) {
      recordFailedAttempt(normalizedEmail);
      res.status(401).json(INVALID_CREDENTIALS);
      return;
    }

    const passwordValid = await bcrypt.compare(password, user.passwordHash);
    if (!passwordValid) {
      recordFailedAttempt(normalizedEmail);
      res.status(401).json(INVALID_CREDENTIALS);
      return;
    }

    if (!user.emailConfirmed) {
      res.status(403).json({
        error: 'Please confirm your email address before logging in.',
      });
      return;
    }

    // Successful authentication — reset the attempt counter
    resetAttempts(normalizedEmail);

    const token = issueToken(
      { userId: user.id, email: normalizedEmail, role: 'Attendee' },
      Boolean(rememberMe),
    );

    // httpOnly cookie for browser clients (prevents XSS token theft)
    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: rememberMe ? 7 * 24 * 60 * 60 * 1000 : 60 * 60 * 1000,
    });

    res.status(200).json({ token });
  });

  router.post('/logout', (req: Request, res: Response): void => {
    const authHeader = req.headers['authorization'];
    const bearerToken =
      authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

    if (bearerToken) {
      revokeToken(bearerToken);
    }

    // Clear the session cookie regardless of bearer token presence
    res.clearCookie('token');
    res.status(200).json({ message: 'Logged out successfully.' });
  });

  return router;
}
