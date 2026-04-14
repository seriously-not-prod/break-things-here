import {
  generateResetToken,
  verifyResetToken,
  resetPassword,
  validatePasswordStrength,
  validateEmail,
  invalidateUserSessions,
  addSession,
  getActiveSessions,
  getStoredPassword,
  isRateLimited,
  PasswordResetError,
  _clearAllStores,
  _getTokenEntry,
} from '../password-reset';

// ─── Helper ──────────────────────────────────────────────────────────────────

/** Force a stored token to appear expired */
function expireToken(token: string): void {
  const entry = _getTokenEntry(token);
  if (entry) {
    (entry as { expiresAt: number }).expiresAt = Date.now() - 1000;
  }
}

// ─── Setup ───────────────────────────────────────────────────────────────────

beforeEach(() => {
  _clearAllStores();
});

// ─── Email Validation ────────────────────────────────────────────────────────

describe('validateEmail', () => {
  it('should accept a valid email and return it lowercased and trimmed', () => {
    expect(validateEmail('  USER@Example.COM  ')).toBe('user@example.com');
  });

  it('should throw INVALID_EMAIL for an empty string', () => {
    expect(() => validateEmail('')).toThrow(PasswordResetError);
    try {
      validateEmail('');
    } catch (err) {
      expect((err as PasswordResetError).code).toBe('INVALID_EMAIL');
    }
  });

  it('should throw INVALID_EMAIL for a missing @ symbol', () => {
    expect(() => validateEmail('notanemail')).toThrow(PasswordResetError);
  });

  it('should throw INVALID_EMAIL for a missing domain', () => {
    expect(() => validateEmail('user@')).toThrow(PasswordResetError);
  });
});

// ─── Rate Limiting ───────────────────────────────────────────────────────────

describe('isRateLimited', () => {
  it('should return false for a new email', () => {
    expect(isRateLimited('new@example.com')).toBe(false);
  });

  it('should return false before the limit is reached', () => {
    generateResetToken('user@example.com');
    generateResetToken('user@example.com');
    expect(isRateLimited('user@example.com')).toBe(false);
  });

  it('should return true after the rate limit is reached', () => {
    generateResetToken('user@example.com');
    generateResetToken('user@example.com');
    generateResetToken('user@example.com');
    expect(isRateLimited('user@example.com')).toBe(true);
  });

  it('should not affect other email addresses', () => {
    generateResetToken('user1@example.com');
    generateResetToken('user1@example.com');
    generateResetToken('user1@example.com');
    expect(isRateLimited('user2@example.com')).toBe(false);
  });
});

// ─── Token Generation ────────────────────────────────────────────────────────

describe('generateResetToken', () => {
  it('should generate a token for a valid email', () => {
    const token = generateResetToken('user@example.com');
    expect(typeof token).toBe('string');
    expect(token.length).toBeGreaterThan(0);
  });

  it('should generate a 64-character hex token (32 random bytes)', () => {
    const token = generateResetToken('user@example.com');
    expect(token).toMatch(/^[0-9a-f]{64}$/);
  });

  it('should generate unique tokens for each request', () => {
    const token1 = generateResetToken('user1@example.com');
    const token2 = generateResetToken('user2@example.com');
    expect(token1).not.toBe(token2);
  });

  it('should generate unique tokens for the same email on successive calls', () => {
    const token1 = generateResetToken('user@example.com');
    const token2 = generateResetToken('user@example.com');
    expect(token1).not.toBe(token2);
  });

  it('should store the token with a 1-hour expiration', () => {
    const before = Date.now();
    const token = generateResetToken('user@example.com');
    const after = Date.now();
    const entry = _getTokenEntry(token);

    expect(entry).toBeDefined();
    expect(entry!.expiresAt).toBeGreaterThanOrEqual(before + 60 * 60 * 1000);
    expect(entry!.expiresAt).toBeLessThanOrEqual(after + 60 * 60 * 1000);
  });

  it('should store the token as unused initially', () => {
    const token = generateResetToken('user@example.com');
    expect(_getTokenEntry(token)!.used).toBe(false);
  });

  it('should throw RATE_LIMIT_EXCEEDED after 3 requests for the same email', () => {
    generateResetToken('user@example.com');
    generateResetToken('user@example.com');
    generateResetToken('user@example.com');

    expect.assertions(2);
    try {
      generateResetToken('user@example.com');
    } catch (err) {
      expect(err).toBeInstanceOf(PasswordResetError);
      expect((err as PasswordResetError).code).toBe('RATE_LIMIT_EXCEEDED');
    }
  });

  it('should throw INVALID_EMAIL for an invalid email address', () => {
    expect.assertions(2);
    try {
      generateResetToken('not-an-email');
    } catch (err) {
      expect(err).toBeInstanceOf(PasswordResetError);
      expect((err as PasswordResetError).code).toBe('INVALID_EMAIL');
    }
  });
});

// ─── Token Verification ──────────────────────────────────────────────────────

describe('verifyResetToken', () => {
  it('should verify a valid unused unexpired token', () => {
    const token = generateResetToken('user@example.com');
    const entry = verifyResetToken(token);
    expect(entry).toBeDefined();
    expect(entry.email).toBe('user@example.com');
    expect(entry.used).toBe(false);
  });

  it('should throw INVALID_TOKEN for a non-existent token', () => {
    expect.assertions(2);
    try {
      verifyResetToken('does-not-exist');
    } catch (err) {
      expect(err).toBeInstanceOf(PasswordResetError);
      expect((err as PasswordResetError).code).toBe('INVALID_TOKEN');
    }
  });

  it('should throw TOKEN_ALREADY_USED for a consumed token', () => {
    const token = generateResetToken('user@example.com');
    _getTokenEntry(token)!.used = true;

    expect.assertions(2);
    try {
      verifyResetToken(token);
    } catch (err) {
      expect(err).toBeInstanceOf(PasswordResetError);
      expect((err as PasswordResetError).code).toBe('TOKEN_ALREADY_USED');
    }
  });

  it('should throw TOKEN_EXPIRED for an expired token', () => {
    const token = generateResetToken('user@example.com');
    expireToken(token);

    expect.assertions(2);
    try {
      verifyResetToken(token);
    } catch (err) {
      expect(err).toBeInstanceOf(PasswordResetError);
      expect((err as PasswordResetError).code).toBe('TOKEN_EXPIRED');
    }
  });
});

// ─── Password Strength Validation ────────────────────────────────────────────

describe('validatePasswordStrength', () => {
  it('should accept a strong password', () => {
    expect(() => validatePasswordStrength('StrongPass1')).not.toThrow();
  });

  it('should reject a password shorter than 8 characters', () => {
    expect.assertions(2);
    try {
      validatePasswordStrength('Ab1');
    } catch (err) {
      expect(err).toBeInstanceOf(PasswordResetError);
      expect((err as PasswordResetError).code).toBe('PASSWORD_TOO_SHORT');
    }
  });

  it('should reject a password with no uppercase letter', () => {
    expect.assertions(2);
    try {
      validatePasswordStrength('lowercase123');
    } catch (err) {
      expect(err).toBeInstanceOf(PasswordResetError);
      expect((err as PasswordResetError).code).toBe('PASSWORD_NO_UPPERCASE');
    }
  });

  it('should reject a password with no number', () => {
    expect.assertions(2);
    try {
      validatePasswordStrength('NoNumbers');
    } catch (err) {
      expect(err).toBeInstanceOf(PasswordResetError);
      expect((err as PasswordResetError).code).toBe('PASSWORD_NO_NUMBER');
    }
  });

  it('should reject an empty password', () => {
    expect(() => validatePasswordStrength('')).toThrow(PasswordResetError);
  });
});

// ─── Password Reset ──────────────────────────────────────────────────────────

describe('resetPassword', () => {
  it('should successfully reset password with valid token and strong password', async () => {
    const token = generateResetToken('user@example.com');
    await expect(resetPassword(token, 'NewPass123')).resolves.toBeUndefined();
  });

  it('should hash and store the new password', async () => {
    const token = generateResetToken('user@example.com');
    await resetPassword(token, 'NewPass123');
    const stored = getStoredPassword('user@example.com');
    expect(stored).toBeDefined();
    expect(stored).not.toBe('NewPass123');
    expect(stored).toMatch(/^\$2[ab]\$/);
  });

  it('should mark the token as used after a successful reset', async () => {
    const token = generateResetToken('user@example.com');
    await resetPassword(token, 'NewPass123');
    expect(_getTokenEntry(token)!.used).toBe(true);
  });

  it('should reject reuse of a consumed token', async () => {
    const token = generateResetToken('user@example.com');
    await resetPassword(token, 'NewPass123');
    await expect(resetPassword(token, 'AnotherPass4')).rejects.toThrow(PasswordResetError);
  });

  it('should reject a weak password', async () => {
    const token = generateResetToken('user@example.com');
    await expect(resetPassword(token, 'weak')).rejects.toThrow(PasswordResetError);
  });

  it('should reject an invalid token', async () => {
    await expect(resetPassword('bad-token', 'NewPass123')).rejects.toThrow(PasswordResetError);
  });

  it('should reject an expired token', async () => {
    const token = generateResetToken('user@example.com');
    expireToken(token);
    await expect(resetPassword(token, 'NewPass123')).rejects.toThrow(PasswordResetError);
  });
});

// ─── Session Management ──────────────────────────────────────────────────────

describe('Session management', () => {
  it('should add and retrieve active sessions', () => {
    addSession('user@example.com', 'session-1');
    addSession('user@example.com', 'session-2');
    const sessions = getActiveSessions('user@example.com');
    expect(sessions.has('session-1')).toBe(true);
    expect(sessions.has('session-2')).toBe(true);
  });

  it('should invalidate all sessions for a user', () => {
    addSession('user@example.com', 'session-1');
    addSession('user@example.com', 'session-2');
    invalidateUserSessions('user@example.com');
    expect(getActiveSessions('user@example.com').size).toBe(0);
  });

  it('should not affect other users when invalidating', () => {
    addSession('alice@example.com', 'session-A');
    addSession('bob@example.com', 'session-B');
    invalidateUserSessions('alice@example.com');
    expect(getActiveSessions('alice@example.com').size).toBe(0);
    expect(getActiveSessions('bob@example.com').has('session-B')).toBe(true);
  });

  it('should invalidate sessions after successful password reset', async () => {
    addSession('user@example.com', 'session-1');
    addSession('user@example.com', 'session-2');
    const token = generateResetToken('user@example.com');
    await resetPassword(token, 'NewPass123');
    expect(getActiveSessions('user@example.com').size).toBe(0);
  });
});

// ─── User Enumeration Prevention ─────────────────────────────────────────────

describe('User enumeration prevention', () => {
  it('should generate a token regardless of whether the email is registered', () => {
    // The service does not check a user database — it generates a token for any
    // valid email. Enumeration prevention is enforced at the API layer through
    // identical generic responses.
    const token = generateResetToken('unknown@example.com');
    expect(typeof token).toBe('string');
    expect(token.length).toBeGreaterThan(0);
  });

  it('should return INVALID_TOKEN (not an email-specific error) for unknown tokens', () => {
    expect.assertions(2);
    try {
      verifyResetToken('random-token-for-unknown-user');
    } catch (err) {
      expect(err).toBeInstanceOf(PasswordResetError);
      // INVALID_TOKEN — not "email not found" or any user-identifiable error
      expect((err as PasswordResetError).code).toBe('INVALID_TOKEN');
    }
  });
});

// ─── Integration: Full Password Reset Flow ────────────────────────────────────

describe('Integration: Full password reset flow', () => {
  it('should complete the flow: request → verify → reset → prevent reuse', async () => {
    const email = 'alice@example.com';

    // Step 1: Request a token
    const token = generateResetToken(email);
    expect(token).toMatch(/^[0-9a-f]{64}$/);

    // Step 2: Verify the token is valid
    const tokenEntry = verifyResetToken(token);
    expect(tokenEntry.email).toBe(email);
    expect(tokenEntry.used).toBe(false);

    // Step 3: Reset the password
    await resetPassword(token, 'SecureNewPass1');
    const stored = getStoredPassword(email);
    expect(stored).toBeDefined();
    expect(stored).toMatch(/^\$2[ab]\$/);

    // Step 4: Token is now consumed
    expect(_getTokenEntry(token)!.used).toBe(true);

    // Step 5: Token cannot be reused
    await expect(resetPassword(token, 'AnotherPass2')).rejects.toThrow(PasswordResetError);
  });

  it('should invalidate all sessions as part of the reset flow', async () => {
    const email = 'bob@example.com';
    addSession(email, 'sess-1');
    addSession(email, 'sess-2');
    expect(getActiveSessions(email).size).toBe(2);

    const token = generateResetToken(email);
    await resetPassword(token, 'SecureNewPass1');

    expect(getActiveSessions(email).size).toBe(0);
  });

  it('should enforce rate limiting within the full flow', () => {
    const email = 'charlie@example.com';
    generateResetToken(email);
    generateResetToken(email);
    generateResetToken(email);

    expect(() => generateResetToken(email)).toThrow(PasswordResetError);
    expect(isRateLimited(email)).toBe(true);
  });

  it('should handle an expired token gracefully in the full flow', async () => {
    const email = 'dave@example.com';
    const token = generateResetToken(email);

    // Simulate time passing — token expires
    expireToken(token);

    await expect(resetPassword(token, 'SecureNewPass1')).rejects.toThrow(PasswordResetError);
    // Password should NOT have been updated
    expect(getStoredPassword(email)).toBeUndefined();
  });
});
