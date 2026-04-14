import bcrypt from 'bcryptjs';
import { 
  hashPassword, 
  verifyPassword, 
  getSaltRounds,
  PasswordHashError 
} from '../password-hash';

describe('Password Hashing Utility', () => {
  describe('hashPassword', () => {
    it('should hash a plain-text password', async () => {
      const plainPassword = 'mySecurePassword123';
      const hashed = await hashPassword(plainPassword);
      
      expect(hashed).toBeDefined();
      expect(typeof hashed).toBe('string');
      expect(hashed.length).toBeGreaterThan(0);
    });

    it('should produce different hash than input (never store plain-text)', async () => {
      const plainPassword = 'mySecurePassword123';
      const hashed = await hashPassword(plainPassword);
      
      // CRITICAL: Verify stored value is NOT equal to input password
      expect(hashed).not.toBe(plainPassword);
      expect(hashed).not.toContain(plainPassword);
    });

    it('should start with bcrypt hash identifier ($2b$ or $2a$)', async () => {
      const plainPassword = 'testPassword456';
      const hashed = await hashPassword(plainPassword);
      
      // Verify bcrypt is being used
      expect(hashed).toMatch(/^\$2[ab]\$/);
    });

    it('should use work factor >= 12', async () => {
      const plainPassword = 'testPassword789';
      const hashed = await hashPassword(plainPassword);
      
      // Extract work factor from hash: $2b$12$...
      const workFactorMatch = hashed.match(/^\$2[ab]\$(\d+)\$/);
      expect(workFactorMatch).not.toBeNull();
      
      const workFactor = parseInt(workFactorMatch![1], 10);
      expect(workFactor).toBeGreaterThanOrEqual(12);
      expect(getSaltRounds()).toBeGreaterThanOrEqual(12);
    });

    it('should produce unique hashes for same password (due to salt)', async () => {
      const plainPassword = 'samePassword';
      const hash1 = await hashPassword(plainPassword);
      const hash2 = await hashPassword(plainPassword);
      
      // Different salts should produce different hashes
      expect(hash1).not.toBe(hash2);
    });

    it('should throw error for empty password', async () => {
      await expect(hashPassword('')).rejects.toThrow(PasswordHashError);
      await expect(hashPassword('')).rejects.toThrow('Password cannot be empty');
    });

    it('should throw error for non-string password', async () => {
      await expect(hashPassword(null as unknown as string)).rejects.toThrow(PasswordHashError);
      await expect(hashPassword(undefined as unknown as string)).rejects.toThrow(PasswordHashError);
      await expect(hashPassword(123 as unknown as string)).rejects.toThrow('Password must be a string');
    });

    it('should handle long passwords', async () => {
      const longPassword = 'a'.repeat(100);
      const hashed = await hashPassword(longPassword);
      
      expect(hashed).toBeDefined();
      expect(hashed).not.toBe(longPassword);
    });

    it('should handle special characters', async () => {
      const specialPassword = 'P@ssw0rd!#$%^&*()_+-=[]{}|;:,.<>?/~`';
      const hashed = await hashPassword(specialPassword);
      
      expect(hashed).toBeDefined();
      expect(hashed).not.toBe(specialPassword);
    });
  });

  describe('verifyPassword', () => {
    it('should verify correct password against hash', async () => {
      const plainPassword = 'correctPassword123';
      const hashed = await hashPassword(plainPassword);
      
      const isValid = await verifyPassword(plainPassword, hashed);
      expect(isValid).toBe(true);
    });

    it('should reject incorrect password', async () => {
      const plainPassword = 'correctPassword123';
      const wrongPassword = 'wrongPassword456';
      const hashed = await hashPassword(plainPassword);
      
      const isValid = await verifyPassword(wrongPassword, hashed);
      expect(isValid).toBe(false);
    });

    it('should reject plain-text password when compared to itself', async () => {
      const plainPassword = 'password123';
      
      // Attempting to verify plain-text against itself should return false - it is not a valid hash
      const result = await verifyPassword(plainPassword, plainPassword);
      expect(result).toBe(false);
    });

    it('should handle case-sensitive password verification', async () => {
      const plainPassword = 'CaseSensitive';
      const hashed = await hashPassword(plainPassword);
      
      const validExact = await verifyPassword('CaseSensitive', hashed);
      const invalidLower = await verifyPassword('casesensitive', hashed);
      const invalidUpper = await verifyPassword('CASESENSITIVE', hashed);
      
      expect(validExact).toBe(true);
      expect(invalidLower).toBe(false);
      expect(invalidUpper).toBe(false);
    });

    it('should throw error when password is empty', async () => {
      const hashed = await hashPassword('testPassword');
      
      await expect(verifyPassword('', hashed)).rejects.toThrow(PasswordHashError);
    });

    it('should throw error when hash is empty', async () => {
      await expect(verifyPassword('testPassword', '')).rejects.toThrow(PasswordHashError);
    });

    it('should throw error for non-string inputs', async () => {
      const hashed = await hashPassword('testPassword');
      
      await expect(verifyPassword(null as unknown as string, hashed)).rejects.toThrow(PasswordHashError);
      await expect(verifyPassword('test', null as unknown as string)).rejects.toThrow(PasswordHashError);
    });

    it('should return false for invalid hash format (bcryptjs handles gracefully)', async () => {
      const result = await verifyPassword('testPassword', 'not-a-valid-bcrypt-hash');
      expect(result).toBe(false);
    });
  });

  describe('Integration: Hash and Verify Flow', () => {
    it('should correctly hash and verify in a complete flow', async () => {
      // Simulating user registration
      const userPassword = 'userRegistration123!';
      const hashedForStorage = await hashPassword(userPassword);
      
      // Verify hash is not plain-text
      expect(hashedForStorage).not.toBe(userPassword);
      
      // Simulating user login - correct password
      const loginAttemptCorrect = await verifyPassword(userPassword, hashedForStorage);
      expect(loginAttemptCorrect).toBe(true);
      
      // Simulating user login - incorrect password
      const loginAttemptWrong = await verifyPassword('wrongPassword', hashedForStorage);
      expect(loginAttemptWrong).toBe(false);
    });

    it('should handle multiple users with same password', async () => {
      const sharedPassword = 'commonPassword';
      
      const user1Hash = await hashPassword(sharedPassword);
      const user2Hash = await hashPassword(sharedPassword);
      
      // Hashes should be different (different salts)
      expect(user1Hash).not.toBe(user2Hash);
      
      // Both should verify correctly
      expect(await verifyPassword(sharedPassword, user1Hash)).toBe(true);
      expect(await verifyPassword(sharedPassword, user2Hash)).toBe(true);
    });
  });

  describe('Security: Plain-text Password Never Stored', () => {
    it('should never return or log plain-text password in errors', async () => {
      const sensitivePassword = 'superSecret123';

      // Force bcrypt to throw internally so we can assert the error message is sanitized
      const spy = vi.spyOn(bcrypt, 'hash').mockRejectedValueOnce(new Error('bcrypt internal failure') as never);

      try {
        await hashPassword(sensitivePassword);
        throw new Error('Expected hashPassword to throw');
      } catch (error) {
        expect(error).toBeInstanceOf(PasswordHashError);
        if (error instanceof Error) {
          expect(error.message).not.toContain(sensitivePassword);
        }
      } finally {
        spy.mockRestore();
      }
    });

    it('should maintain hash integrity without exposing plain-text', async () => {
      const password = 'testPassword';
      const hash = await hashPassword(password);
      
      // Hash should be a valid bcrypt hash
      expect(hash).toMatch(/^\$2[ab]\$\d{2}\$.{53}$/);
      
      // Hash should not contain password substring
      expect(hash).not.toContain(password);
    });
  });

  describe('PasswordHashError', () => {
    it('should create error with message and name', () => {
      const error = new PasswordHashError('Test error');
      
      expect(error.message).toBe('Test error');
      expect(error.name).toBe('PasswordHashError');
      expect(error instanceof Error).toBe(true);
      expect(error instanceof PasswordHashError).toBe(true);
    });

    it('should preserve cause when provided', () => {
      const originalError = new Error('Original error');
      const wrappedError = new PasswordHashError('Wrapped error', originalError);
      
      expect(wrappedError.cause).toBe(originalError);
    });
  });

  describe('getSaltRounds', () => {
    it('should return salt rounds >= 12', () => {
      const saltRounds = getSaltRounds();
      
      expect(typeof saltRounds).toBe('number');
      expect(saltRounds).toBeGreaterThanOrEqual(12);
    });
  });
});
