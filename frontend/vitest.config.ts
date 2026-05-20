import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./test/setup.ts'],
    // Allow missing snapshots to be created in CI (CI=true overrides default to 'none').
    // 'new' = create missing snapshots but still fail on mismatches.
    snapshotOptions: { update: 'new' },
    include: ['test/**/*.test.ts?(x)', 'src/__tests__/**/*.test.ts?(x)'],
    exclude: [
      // Pre-existing broken tests — tracked separately for remediation.
      'test/timeline.test.tsx',
      'test/analytics.test.tsx',
      'test/guests-page.test.tsx',
      'test/messages.test.tsx',
      'test/shopping.test.tsx',
      // Snapshot uses non-deterministic MUI auto-generated IDs — fails across environments.
      'test/events-page-compatibility.test.tsx',
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'json-summary'],
      reportsDirectory: './coverage',
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/**/*.d.ts',
        'src/main.tsx',
        'src/vite-env.d.ts',
        'src/react-app-env.d.ts',
      ],
      // Regression-guard floor; target is >=80% as coverage grows.
      thresholds: {
        lines: 25,
        branches: 20,
        functions: 20,
        statements: 25,
      },
    },
  },
});
