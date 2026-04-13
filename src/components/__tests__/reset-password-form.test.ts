import {
  extractTokenFromQueryString,
  validatePasswordMatch,
  checkPasswordStrength,
  submitPasswordReset,
  createInitialState,
  ARIA_LABELS,
} from '../reset-password-form';

describe('reset-password-form', () => {
  describe('createInitialState', () => {
    it('should return an initial state with empty fields', () => {
      const state = createInitialState();
      expect(state.newPassword).toBe('');
      expect(state.confirmPassword).toBe('');
      expect(state.resetToken).toBe('');
      expect(state.isLoading).toBe(false);
      expect(state.successMessage).toBeNull();
      expect(state.errorMessage).toBeNull();
    });
  });

  describe('extractTokenFromQueryString', () => {
    it('should extract the token from a query string', () => {
      expect(extractTokenFromQueryString('?token=abc123')).toBe('abc123');
    });

    it('should return null when token parameter is absent', () => {
      expect(extractTokenFromQueryString('?foo=bar')).toBeNull();
    });

    it('should return null for an empty query string', () => {
      expect(extractTokenFromQueryString('')).toBeNull();
    });

    it('should return null for a whitespace-only token', () => {
      expect(extractTokenFromQueryString('?token=   ')).toBeNull();
    });

    it('should trim whitespace from the token', () => {
      expect(extractTokenFromQueryString('?token=  abc123  ')).toBe('abc123');
    });
  });

  describe('validatePasswordMatch', () => {
    it('should return null when passwords match', () => {
      expect(validatePasswordMatch('Password1', 'Password1')).toBeNull();
    });

    it('should return an error message when passwords do not match', () => {
      expect(validatePasswordMatch('Password1', 'Different1')).toBe('Passwords do not match');
    });

    it('should be case-sensitive', () => {
      expect(validatePasswordMatch('Password1', 'password1')).toBe('Passwords do not match');
    });
  });

  describe('checkPasswordStrength', () => {
    it('should return isValid true for a strong password', () => {
      const result = checkPasswordStrength('StrongPass1');
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should fail for a password shorter than 8 characters', () => {
      const result = checkPasswordStrength('Ab1');
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Password must be at least 8 characters long');
    });

    it('should fail for a password with no uppercase letter', () => {
      const result = checkPasswordStrength('lowercase1');
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Password must contain at least one uppercase letter');
    });

    it('should fail for a password with no number', () => {
      const result = checkPasswordStrength('NoNumbers');
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Password must contain at least one number');
    });

    it('should accumulate multiple errors', () => {
      const result = checkPasswordStrength('weak');
      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(1);
    });
  });

  describe('submitPasswordReset', () => {
    const mockReset = jest.fn().mockResolvedValue(undefined);

    beforeEach(() => {
      mockReset.mockClear();
    });

    it('should return a success result on valid input', async () => {
      const result = await submitPasswordReset('valid-token', 'NewPass123', 'NewPass123', mockReset);
      expect(result.success).toBe(true);
      expect(result.message).toContain('successfully');
    });

    it('should call onReset with trimmed token and new password', async () => {
      await submitPasswordReset('  token123  ', 'NewPass123', 'NewPass123', mockReset);
      expect(mockReset).toHaveBeenCalledWith('token123', 'NewPass123');
    });

    it('should return an error when the token is missing', async () => {
      const result = await submitPasswordReset('', 'NewPass123', 'NewPass123', mockReset);
      expect(result.success).toBe(false);
      expect(result.message).toContain('token');
      expect(mockReset).not.toHaveBeenCalled();
    });

    it('should return an error when passwords do not match', async () => {
      const result = await submitPasswordReset('token', 'NewPass123', 'Different4', mockReset);
      expect(result.success).toBe(false);
      expect(result.message).toBe('Passwords do not match');
      expect(mockReset).not.toHaveBeenCalled();
    });

    it('should return an error for a weak password', async () => {
      const result = await submitPasswordReset('token', 'weak', 'weak', mockReset);
      expect(result.success).toBe(false);
      expect(mockReset).not.toHaveBeenCalled();
    });

    it('should return the error message when onReset throws', async () => {
      const failingReset = jest.fn().mockRejectedValue(new Error('Token expired'));
      const result = await submitPasswordReset('token', 'NewPass123', 'NewPass123', failingReset);
      expect(result.success).toBe(false);
      expect(result.message).toBe('Token expired');
    });

    it('should handle a non-Error throw from onReset gracefully', async () => {
      const failingReset = jest.fn().mockRejectedValue('unexpected');
      const result = await submitPasswordReset('token', 'NewPass123', 'NewPass123', failingReset);
      expect(result.success).toBe(false);
      expect(result.message).toBeDefined();
    });
  });

  describe('ARIA_LABELS', () => {
    it('should define labels for all interactive elements', () => {
      expect(ARIA_LABELS.newPasswordInput).toBeDefined();
      expect(ARIA_LABELS.confirmPasswordInput).toBeDefined();
      expect(ARIA_LABELS.submitButton).toBeDefined();
      expect(ARIA_LABELS.successAlert).toBeDefined();
      expect(ARIA_LABELS.errorAlert).toBeDefined();
      expect(ARIA_LABELS.strengthIndicator).toBeDefined();
    });
  });
});
