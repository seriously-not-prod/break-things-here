import {
  validateEmail,
  submitForgotPasswordRequest,
  createInitialState,
  GENERIC_SUCCESS_MESSAGE,
  ARIA_LABELS,
} from '../forgot-password-form';

describe('forgot-password-form', () => {
  describe('createInitialState', () => {
    it('should return an initial state with empty fields', () => {
      const state = createInitialState();
      expect(state.email).toBe('');
      expect(state.isLoading).toBe(false);
      expect(state.successMessage).toBeNull();
      expect(state.errorMessage).toBeNull();
    });
  });

  describe('validateEmail', () => {
    it('should return null for a valid email', () => {
      expect(validateEmail('user@example.com')).toBeNull();
    });

    it('should return an error for an empty string', () => {
      expect(validateEmail('')).toBe('Email address is required');
    });

    it('should return an error for a whitespace-only string', () => {
      expect(validateEmail('   ')).toBe('Email address is required');
    });

    it('should return an error for an email missing @', () => {
      expect(validateEmail('notanemail')).toBe('Please enter a valid email address');
    });

    it('should return an error for an email missing domain', () => {
      expect(validateEmail('user@')).toBe('Please enter a valid email address');
    });

    it('should accept emails with subdomains', () => {
      expect(validateEmail('user@mail.example.com')).toBeNull();
    });
  });

  describe('submitForgotPasswordRequest', () => {
    it('should return an error result for an invalid email', async () => {
      const result = await submitForgotPasswordRequest('bad-email', jest.fn());
      expect(result.success).toBe(false);
      expect(result.message).toBe('Please enter a valid email address');
    });

    it('should return a generic success message for a valid email', async () => {
      const mockRequest = jest.fn().mockResolvedValue(undefined);
      const result = await submitForgotPasswordRequest('user@example.com', mockRequest);
      expect(result.success).toBe(true);
      expect(result.message).toBe(GENERIC_SUCCESS_MESSAGE);
    });

    it('should call onRequest with trimmed lowercased email', async () => {
      const mockRequest = jest.fn().mockResolvedValue(undefined);
      await submitForgotPasswordRequest('  USER@Example.COM  ', mockRequest);
      expect(mockRequest).toHaveBeenCalledWith('user@example.com');
    });

    it('should return generic success even when onRequest throws (prevents enumeration)', async () => {
      const mockRequest = jest.fn().mockRejectedValue(new Error('Email not found'));
      const result = await submitForgotPasswordRequest('user@example.com', mockRequest);
      expect(result.success).toBe(true);
      expect(result.message).toBe(GENERIC_SUCCESS_MESSAGE);
    });

    it('should not call onRequest when email is invalid', async () => {
      const mockRequest = jest.fn();
      await submitForgotPasswordRequest('', mockRequest);
      expect(mockRequest).not.toHaveBeenCalled();
    });
  });

  describe('ARIA_LABELS', () => {
    it('should define labels for all interactive elements', () => {
      expect(ARIA_LABELS.emailInput).toBeDefined();
      expect(ARIA_LABELS.submitButton).toBeDefined();
      expect(ARIA_LABELS.successAlert).toBeDefined();
      expect(ARIA_LABELS.errorAlert).toBeDefined();
    });
  });
});
