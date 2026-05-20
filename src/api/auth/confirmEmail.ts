import { Router, Request, Response } from 'express';
import { consumeConfirmationToken, TokenError } from '../../utils/confirmation-token';
import { inMemoryUserStore, UserStore } from './userStore';

/**
 * Creates the GET /confirm-email route handler.
 *
 * Validates the token, marks the user account as confirmed, and invalidates the token.
 *
 * @param userStore - Injectable user store (defaults to in-memory; swap for DB in production)
 */
export function createConfirmEmailRouter(userStore: UserStore = inMemoryUserStore): Router {
  const router = Router();

  router.get('/confirm-email', async (req: Request, res: Response): Promise<void> => {
    const token = req.query['token'];

    if (!token || typeof token !== 'string') {
      res.status(400).json({ error: 'Token is required' });
      return;
    }

    let email: string;
    try {
      email = consumeConfirmationToken(token);
    } catch (err) {
      if (err instanceof TokenError) {
        res.status(400).json({ error: err.message });
        return;
      }
      throw err;
    }

    let newlyConfirmed: boolean;
    try {
      newlyConfirmed = await userStore.confirmEmail(email);
    } catch {
      // User associated with the token doesn't exist — treat as invalid
      res.status(400).json({ error: 'Invalid or unknown token' });
      return;
    }

    if (newlyConfirmed) {
      res
        .status(200)
        .json({ message: 'Email confirmed successfully. Your account is now active.' });
    } else {
      res.status(200).json({ message: 'Email address has already been confirmed.' });
    }
  });

  return router;
}
