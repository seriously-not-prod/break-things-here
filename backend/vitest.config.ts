import { defineConfig } from 'vitest/config';

const testDatabaseUrl = process.env.DATABASE_URL;

if (!testDatabaseUrl) {
  throw new Error('DATABASE_URL must be set for backend tests.');
}

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    fileParallelism: false,
    minWorkers: 1,
    maxWorkers: 1,
    testTimeout: 30000,
    include: ['__tests__/**/*.test.ts'],
    // Provide deterministic secrets for tests so no hardcoded literals are needed
    // in source or test files (satisfies CodeQL js/hardcoded-credentials rule).
    env: {
      JWT_SECRET: 'test-jwt-secret-vitest-only-not-for-production-use',
      TOKEN_HASH_SECRET: 'test-token-hash-secret-vitest-only',
      REFRESH_TOKEN_ENC_KEY: Buffer.from('test-refresh-enc-key-32bytes!!xx').toString('base64'),
      // Backend tests run against an explicit PostgreSQL database URL supplied
      // by the npm scripts locally and by CI in GitHub Actions.
      DATABASE_URL: testDatabaseUrl,
    },
  },
});
