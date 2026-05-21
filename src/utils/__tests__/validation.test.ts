import { validateEmail, validatePassword, validateConfirmPassword } from '../validation';

describe('validateEmail', () => {
  it('returns error when email is empty', () => {
    expect(validateEmail('')).toBe('Email address is required.');
  });

  it('returns error when email is only whitespace', () => {
    expect(validateEmail('   ')).toBe('Email address is required.');
  });

  it('returns error for missing @ symbol', () => {
    expect(validateEmail('userexample.com')).toBe(
      'Please enter a valid email address (e.g. user@example.com).',
    );
  });

  it('returns error for missing domain', () => {
    expect(validateEmail('user@')).toBe(
      'Please enter a valid email address (e.g. user@example.com).',
    );
  });

  it('returns error for missing TLD', () => {
    expect(validateEmail('user@example')).toBe(
      'Please enter a valid email address (e.g. user@example.com).',
    );
  });

  it('returns null for a valid email', () => {
    expect(validateEmail('user@example.com')).toBeNull();
  });

  it('returns null for email with subdomain', () => {
    expect(validateEmail('user@mail.example.co.uk')).toBeNull();
  });

  it('returns null for email with plus alias', () => {
    expect(validateEmail('user+tag@example.com')).toBeNull();
  });
});

describe('validatePassword', () => {
  it('returns error when password is empty', () => {
    expect(validatePassword('')).toBe('Password is required.');
  });

  it('returns error when password is shorter than 8 characters', () => {
    expect(validatePassword('Ab1!')).toBe('Password must be at least 8 characters long.');
  });

  it('returns error when password has no uppercase letter', () => {
    expect(validatePassword('abcdef1!')).toBe(
      'Password must contain at least one uppercase letter.',
    );
  });

  it('returns error when password has no number', () => {
    expect(validatePassword('Abcdefg!')).toBe('Password must contain at least one number.');
  });

  it('returns error when password has no special character', () => {
    expect(validatePassword('Abcdef12')).toBe(
      'Password must contain at least one special character (e.g. !@#$%).',
    );
  });

  it('returns null for a valid password meeting all criteria', () => {
    expect(validatePassword('Secure1!')).toBeNull();
  });

  it('returns null for password with multiple special characters', () => {
    expect(validatePassword('P@$$w0rd!!')).toBeNull();
  });

  it('returns null for password exactly 8 characters long', () => {
    expect(validatePassword('Abcde1!x')).toBeNull();
  });
});

describe('validateConfirmPassword', () => {
  it('returns error when confirmPassword is empty', () => {
    expect(validateConfirmPassword('Secure1!', '')).toBe('Please confirm your password.');
  });

  it('returns error when passwords do not match', () => {
    expect(validateConfirmPassword('Secure1!', 'Different1!')).toBe('Passwords do not match.');
  });

  it('returns null when passwords match', () => {
    expect(validateConfirmPassword('Secure1!', 'Secure1!')).toBeNull();
  });

  it('returns error when confirmPassword differs by case', () => {
    expect(validateConfirmPassword('Secure1!', 'secure1!')).toBe('Passwords do not match.');
  });
});
