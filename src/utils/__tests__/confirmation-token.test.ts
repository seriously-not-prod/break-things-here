import {
  generateConfirmationToken,
  verifyConfirmationToken,
  consumeConfirmationToken,
  isTokenValid,
  clearTokenStore,
  TokenError,
} from '../../utils/confirmation-token';

describe('Confirmation Token Utility', () => {
  beforeEach(() => {
    clearTokenStore();
  });

  // ── Token generation ───────────────────────────────────────────────────────

  describe('generateConfirmationToken', () => {
    it('should return a 64-character hex string (32 bytes)', () => {
      const token = generateConfirmationToken('user@example.com');
      expect(token).toMatch(/^[0-9a-f]{64}$/);
    });

    it('should generate unique tokens on each call', () => {
      const t1 = generateConfirmationToken('a@example.com');
      const t2 = generateConfirmationToken('a@example.com');
      expect(t1).not.toBe(t2);
    });

    it('should throw TokenError when email is empty', () => {
      expect(() => generateConfirmationToken('')).toThrow(TokenError);
    });

    it('should throw TokenError when email is not a string', () => {
      expect(() => generateConfirmationToken(null as unknown as string)).toThrow(TokenError);
    });
  });

  // ── Token verification ─────────────────────────────────────────────────────

  describe('verifyConfirmationToken', () => {
    it('should return the associated email for a valid token', () => {
      const email = 'verify@example.com';
      const token = generateConfirmationToken(email);
      expect(verifyConfirmationToken(token)).toBe(email);
    });

    it('should throw TokenError for an unknown token', () => {
      expect(() => verifyConfirmationToken('00'.repeat(32))).toThrow(TokenError);
    });

    it('should throw TokenError for an expired token', () => {
      vi.useFakeTimers();

      const token = generateConfirmationToken('exp@example.com');

      // Advance time past the 24-hour expiry
      vi.advanceTimersByTime(25 * 60 * 60 * 1000);

      expect(() => verifyConfirmationToken(token)).toThrow(TokenError);

      vi.useRealTimers();
    });

    it('should throw TokenError for an already-used token', () => {
      const token = generateConfirmationToken('used@example.com');
      consumeConfirmationToken(token);
      expect(() => verifyConfirmationToken(token)).toThrow(TokenError);
    });

    it('should throw TokenError when token is empty', () => {
      expect(() => verifyConfirmationToken('')).toThrow(TokenError);
    });
  });

  // ── Token consumption ──────────────────────────────────────────────────────

  describe('consumeConfirmationToken', () => {
    it('should return the email and mark the token as used', () => {
      const email = 'consume@example.com';
      const token = generateConfirmationToken(email);

      const result = consumeConfirmationToken(token);
      expect(result).toBe(email);

      // Token should now be invalid
      expect(() => verifyConfirmationToken(token)).toThrow(TokenError);
    });

    it('should not allow a token to be consumed twice', () => {
      const token = generateConfirmationToken('double@example.com');
      consumeConfirmationToken(token);
      expect(() => consumeConfirmationToken(token)).toThrow(TokenError);
    });
  });

  // ── isTokenValid ───────────────────────────────────────────────────────────

  describe('isTokenValid', () => {
    it('should return true for a fresh token', () => {
      const token = generateConfirmationToken('check@example.com');
      expect(isTokenValid(token)).toBe(true);
    });

    it('should return false for an unknown token', () => {
      expect(isTokenValid('ab'.repeat(32))).toBe(false);
    });

    it('should return false for an expired token', () => {
      vi.useFakeTimers();

      const token = generateConfirmationToken('timeout@example.com');
      vi.advanceTimersByTime(25 * 60 * 60 * 1000);

      expect(isTokenValid(token)).toBe(false);

      vi.useRealTimers();
    });

    it('should return false for a used token', () => {
      const token = generateConfirmationToken('spent@example.com');
      consumeConfirmationToken(token);
      expect(isTokenValid(token)).toBe(false);
    });
  });

  // ── Token expiry stored correctly ──────────────────────────────────────────

  describe('Token expiry boundary', () => {
    it('should still be valid just before the 24-hour mark', () => {
      vi.useFakeTimers();

      const token = generateConfirmationToken('boundary@example.com');
      vi.advanceTimersByTime(24 * 60 * 60 * 1000 - 1000); // 1 second before expiry

      expect(isTokenValid(token)).toBe(true);

      vi.useRealTimers();
    });
  });
});
