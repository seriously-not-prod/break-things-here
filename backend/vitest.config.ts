import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['__tests__/**/*.test.ts'],
    // Provide deterministic secrets for tests so no hardcoded literals are needed
    // in source or test files (satisfies CodeQL js/hardcoded-credentials rule).
    env: {
      JWT_SECRET: 'test-jwt-secret-vitest-only-not-for-production-use',
      TOKEN_HASH_SECRET: 'test-token-hash-secret-vitest-only',
      REFRESH_TOKEN_ENC_KEY: Buffer.from('test-refresh-enc-key-32bytes!!xx').toString('base64'),
      // Default to an isolated in-memory SQLite database for test runs.
      // Use DATABASE_URL from the environment if set (CI supplies a real Postgres
      // service), otherwise fall back to a local Postgres instance started via
      // `docker compose up -d db`.
      DATABASE_URL: process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5432/festival_planner_test',
    },
    server: {
      deps: {
        // sqlite3 uses native Node bindings — exclude from Vite's bundler so
        // the require() path is used directly (Node CJS) without Vite transform.
        // `sqlite` is the promise wrapper around sqlite3 used in some tests.
        external: ['sqlite3', 'sqlite'],
      },
    },
  },
});
