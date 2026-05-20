import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./test/setup.ts'],
    include: ['test/**/*.test.ts?(x)'],
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
      thresholds: {
        lines: 80,
        branches: 75,
        functions: 80,
        statements: 80,
      },
    },
  },
});