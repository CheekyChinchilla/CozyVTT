module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.ts', '**/?(*.)+(spec|test).ts'],
  testPathIgnorePatterns: ['/node_modules/', '/__tests__/helpers/'],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
  // file-type is ESM-only (no CJS build) and cannot be resolved by ts-jest's
  // CommonJS transform. Map it to a loud-failing stub — no automated test
  // exercises real magic-byte sniffing; see the mock for details.
  moduleNameMapper: {
    '^file-type$': '<rootDir>/src/__tests__/helpers/file-type-mock.ts',
  },
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/**/*.test.ts',
    '!src/**/*.spec.ts',
  ],
  coverageDirectory: 'coverage',
  verbose: true,
};
