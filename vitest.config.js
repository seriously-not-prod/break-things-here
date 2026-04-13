const { defineConfig } = require('vitest/config');

module.exports = defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/setupTests.ts'],
    include: ['src/**/*.test.{ts,tsx,js}'],
    exclude: ['node_modules', 'backend/**', 'frontend/**'],
    coverage: {
      provider: 'istanbul',
    },
  },
});
