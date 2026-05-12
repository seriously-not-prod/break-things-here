import { defineConfig } from 'vitest/config';
import { resolveTestDatabaseUrl } from './test-database-url.js';

const testDatabaseUrl = resolveTestDatabaseUrl();

process.env.TEST_DATABASE_URL = testDatabaseUrl;
process.env.DATABASE_URL = testDatabaseUrl;

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
      // Backend tests run against an explicit PostgreSQL database URL when one
      // is supplied; otherwise default to the dedicated local test database.
      TEST_DATABASE_URL: testDatabaseUrl,
      DATABASE_URL: testDatabaseUrl,
    },
  },
});
