// Global test setup
import { jest } from "@jest/globals";

// Mock console methods to reduce noise in tests
global.console = {
  ...console,
  log: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn(),
  debug: jest.fn(),
};

// Set test environment variables
process.env.NODE_ENV = "test";
process.env.VERTICA_HOST = "localhost";
process.env.VERTICA_PORT = "5433";
process.env.VERTICA_DATABASE = "test_db";
process.env.VERTICA_USER = "test_user";
process.env.VERTICA_PASSWORD = "test_password";
process.env.VERTICA_DEFAULT_SCHEMA = "public";

// Mock vertica-nodejs module globally
jest.mock("vertica-nodejs", () => ({
  __esModule: true,
  default: {
    Client: jest.fn(),
    Pool: jest.fn(),
    defaults: {},
    types: {},
    DatabaseError: class DatabaseError extends Error {},
    version: "1.1.4",
  },
}));
