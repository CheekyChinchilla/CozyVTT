module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.ts', '**/?(*.)+(spec|test).ts'],
  testPathIgnorePatterns: ['/node_modules/', '/__tests__/helpers/'],
  // Caps each Prisma pool, and disconnects every file's clients when it ends,
  // so a full run stays under PostgreSQL's connection ceiling; see the files.
  setupFiles: ['<rootDir>/src/__tests__/helpers/jest.setup.ts'],
  setupFilesAfterEnv: ['<rootDir>/src/__tests__/helpers/jest.afterEnv.ts'],
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
