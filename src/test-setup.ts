import '@testing-library/jest-dom';

// Set test environment variables required by auth utilities
process.env.JWT_SECRET = 'test-jwt-secret-for-ci-only-not-a-real-secret';
