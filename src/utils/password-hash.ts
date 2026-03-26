import bcrypt from 'bcryptjs';

/**
 * Configuration for password hashing
 */
const SALT_ROUNDS = 12; // Work factor >= 12 as per requirements

/**
 * Custom error class for password hashing operations
 */
export class PasswordHashError extends Error {
  constructor(message: string, public readonly cause?: Error) {
    super(message);
    this.name = 'PasswordHashError';
    
    // Maintain proper stack trace
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, PasswordHashError);
    }
  }
}

/**
 * Hash a plain-text password using bcrypt
 * 
 * @param plainPassword - The plain-text password to hash
 * @returns Promise<string> - The hashed password
 * @throws {PasswordHashError} If hashing fails or input is invalid
 * 
 * @example
 * ```typescript
 * const hashed = await hashPassword('mySecurePassword123');
 * console.log(hashed); // $2b$12$...
 * ```
 */
export async function hashPassword(plainPassword: string): Promise<string> {
  // Input validation
  if (!plainPassword) {
    throw new PasswordHashError('Password cannot be empty');
  }

  if (typeof plainPassword !== 'string') {
    throw new PasswordHashError('Password must be a string');
  }

  // Prevent logging of plain-text password by not including it in error messages
  try {
    const hash = await bcrypt.hash(plainPassword, SALT_ROUNDS);
    
    if (!hash) {
      throw new PasswordHashError('Failed to generate password hash');
    }
    
    return hash;
  } catch (error) {
    if (error instanceof PasswordHashError) {
      throw error;
    }
    
    // Wrap bcrypt errors without exposing sensitive info
    throw new PasswordHashError(
      'An error occurred during password hashing',
      error instanceof Error ? error : undefined
    );
  }
}

/**
 * Verify a plain-text password against a hashed password
 * 
 * @param plainPassword - The plain-text password to verify
 * @param hashedPassword - The hashed password to compare against
 * @returns Promise<boolean> - True if password matches, false otherwise
 * @throws {PasswordHashError} If verification fails due to invalid input
 * 
 * @example
 * ```typescript
 * const isValid = await verifyPassword('mySecurePassword123', hashedPassword);
 * if (isValid) {
 *   console.log('Password is correct');
 * }
 * ```
 */
export async function verifyPassword(
  plainPassword: string,
  hashedPassword: string
): Promise<boolean> {
  // Input validation
  if (!plainPassword || !hashedPassword) {
    throw new PasswordHashError('Both password and hash are required for verification');
  }

  if (typeof plainPassword !== 'string' || typeof hashedPassword !== 'string') {
    throw new PasswordHashError('Password and hash must be strings');
  }

  // Validate hash format before passing to bcrypt to ensure we throw on invalid input
  if (!/^\$2[ab]\$\d{2}\$.{53}$/.test(hashedPassword)) {
    throw new PasswordHashError('Invalid hash format');
  }

  try {
    const isValid = await bcrypt.compare(plainPassword, hashedPassword);
    return isValid;
  } catch (error) {
    // If the hash is invalid format, bcrypt.compare may throw
    // We should handle this gracefully by returning false or throwing
    // Throwing is safer to detect implementation issues
    throw new PasswordHashError(
      'An error occurred during password verification',
      error instanceof Error ? error : undefined
    );
  }
}

/**
 * Get the current salt rounds configuration
 * Useful for testing and verification
 */
export function getSaltRounds(): number {
  return SALT_ROUNDS;
}
