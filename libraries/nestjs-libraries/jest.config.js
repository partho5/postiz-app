/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: '.',
  testMatch: ['<rootDir>/src/**/*.spec.ts'],
  moduleNameMapper: {
    '^@gitroom/autopilot/(.*)$': '<rootDir>/src/autopilot/$1',
    '^@gitroom/nestjs-libraries/(.*)$': '<rootDir>/src/$1',
    '^@gitroom/helpers/(.*)$': '<rootDir>/../helpers/src/$1',
  },
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.json' }],
  },
};
