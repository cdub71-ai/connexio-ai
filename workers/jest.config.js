export default {
  testEnvironment: 'node',
  transform: {
    '^.+\\.js$': 'babel-jest'
  },
  transformIgnorePatterns: [
    'node_modules/(?!(p-retry|p-queue)/)'
  ],
  testMatch: [
    '**/?(*.)+(spec|test).js'
  ],
  testTimeout: 30000,
  verbose: true
};