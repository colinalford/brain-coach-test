export default {
  testEnvironment: 'node',
  transform: {},
  moduleFileExtensions: ['js', 'mjs'],
  verbose: true,
  bail: 1,
  testTimeout: 10000,
  projects: [
    {
      displayName: 'bdd-system',
      testMatch: ['**/src/tests/bdd/system/**/*.test.js'],
    },
    {
      displayName: 'bdd-e2e',
      testMatch: ['**/src/tests/bdd/e2e/**/*.test.js'],
    },
  ],
};
