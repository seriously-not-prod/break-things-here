/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        tsconfig: {
          esModuleInterop: true,
          module: 'commonjs',
          moduleResolution: 'node',
        },
      },
    ],
  },
  // Provide a test-only JWT secret so tests never rely on a hardcoded fallback.
  // This value is NOT a secret — it is committed intentionally for CI use only.
  setupFiles: ['<rootDir>/src/test-env-setup.ts'],
};
