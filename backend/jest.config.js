/**
 * Jest configuration for the backend unit/integration suite.
 *
 * `npm test` runs this. Specs live beside the code they cover (`src/**\/*.spec.ts`)
 * and shared fixtures live under `test/`. `tsconfig.build.json` excludes
 * `*.spec.ts`, so nothing here reaches the production image.
 */
module.exports = {
  rootDir: __dirname,
  roots: ['<rootDir>/src', '<rootDir>/test'],
  testEnvironment: 'node',
  testRegex: '\\.spec\\.ts$',
  moduleFileExtensions: ['ts', 'js', 'json'],
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.json' }],
  },
  collectCoverageFrom: ['src/**/*.ts', '!src/**/*.spec.ts', '!src/main.ts'],
  clearMocks: true,
  testTimeout: 20000,
};
