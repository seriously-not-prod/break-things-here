/**
 * Unsubscribe tokens (#545, #590).
 *
 * Each guest gets a random opaque token stored in `rsvps.unsubscribe_token`
 * the first time they receive a marketing/RSVP email. The token is appended
 * to every outgoing bulk email as `?u=<token>` and lands on a public
 * unsubscribe endpoint that marks the guest as opted-out without requiring a
 * login. Tokens are not HMAC-signed because the side effect (flipping a
 * single `unsubscribed_at` timestamp on a row) is reversible by the
 * organizer; high-entropy random is enough to prevent enumeration.
 */
import { randomBytes } from 'crypto';
import type { DatabaseAdapter } from '../db/database.js';

const TOKEN_LENGTH_BYTES = 24;

function newToken(): string {
  return randomBytes(TOKEN_LENGTH_BYTES).toString('base64url');
}

/**
 * Returns the guest's unsubscribe token, creating one if needed. Idempotent.
 */
export async function ensureUnsubscribeToken(
  db: DatabaseAdapter,
  rsvpId: number,
): Promise<string> {
  const row = await db.get<{ unsubscribe_token: string | null }>(
    'SELECT unsubscribe_token FROM rsvps WHERE id = ?',
    [rsvpId],
  );
  if (row?.unsubscribe_token) return row.unsubscribe_token;

  // Retry once on collision (vanishingly unlikely with 24 random bytes).
  for (let attempt = 0; attempt < 2; attempt++) {
    const token = newToken();
    try {
      await db.run(
        `UPDATE rsvps SET unsubscribe_token = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND unsubscribe_token IS NULL`,
        [token, rsvpId],
      );
      const verify = await db.get<{ unsubscribe_token: string | null }>(
        'SELECT unsubscribe_token FROM rsvps WHERE id = ?',
        [rsvpId],
      );
      if (verify?.unsubscribe_token) return verify.unsubscribe_token;
    } catch {
      // Most likely unique-index collision; loop and try again.
    }
  }
  throw new Error('Failed to issue unsubscribe token.');
}

export function buildUnsubscribeUrl(baseUrl: string, token: string): string {
  return `${baseUrl.replace(/\/$/, '')}/api/public/unsubscribe/${encodeURIComponent(token)}`;
}
