// Provide a test-only JWT secret so tests never rely on a hardcoded fallback.
// This value is intentionally committed for CI use only (not a real secret).
process.env.JWT_SECRET = 'test-jwt-secret-for-ci-only-not-a-real-secret';
