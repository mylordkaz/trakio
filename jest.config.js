module.exports = {
  preset: 'jest-expo',
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
  },
  // Only *.test.ts run as suites; shared fixtures in __tests__ stay plain modules.
  testMatch: ['**/*.test.ts'],
};
