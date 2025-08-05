// Jest setup file for enhanced Claude worker tests

// Mock console to reduce test output noise
global.console = {
  ...console,
  warn: jest.fn(),
  error: jest.fn(),
  log: jest.fn(),
  info: jest.fn(),
  debug: jest.fn()
};