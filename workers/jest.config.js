export default {
  testEnvironment: 'node',
  transform: {
    '^.+\\.js$': 'babel-jest'
  },
  transformIgnorePatterns: [
    'node_modules/(?!(p-retry|p-queue|uuid|@anthropic-ai/sdk|axios)/)'
  ],
  testMatch: [
    '**/?(*.)+(spec|test).js'
  ],
  testTimeout: 30000,
  verbose: true
};