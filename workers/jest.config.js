export default {
  testEnvironment: 'node',
  transform: {
    '^.+\\.js$': 'babel-jest'
  },
  testMatch: [
    '**/?(*.)+(spec|test).js'
  ],
  testTimeout: 30000,
  verbose: true
};