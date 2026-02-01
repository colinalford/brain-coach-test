export default {
  testEnvironment: 'node',
  transform: {},
  moduleFileExtensions: ['js', 'mjs'],
  verbose: true,
  bail: 1,
  testTimeout: 10000,
  projects: [
    {
      displayName: 'unit',
      testMatch: ['**/src/tests/unit/**/*.test.js'],
    },
    {
      displayName: 'system',
      testMatch: ['**/src/tests/bdd/system/**/*.test.js'],
    },
    {
      displayName: 'e2e',
      testMatch: ['**/src/tests/bdd/e2e/**/*.test.js'],
    },
  ],
  collectCoverageFrom: [
    'src/**/*.js',
    '!src/worker/**',
    '!src/tests/**',
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov'],
};
