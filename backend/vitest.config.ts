import { defineConfig } from 'vitest/config';

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
      // Use DATABASE_URL from the environment if set (CI supplies a real Postgres
      // service), otherwise fall back to a local Postgres instance started via
      // `docker compose up -d db`.
      DATABASE_URL: process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5432/festival_planner_test',
    },
  },
});
