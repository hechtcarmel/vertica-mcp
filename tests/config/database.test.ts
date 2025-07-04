import { describe, it, expect, beforeEach, afterEach } from "@jest/globals";
import {
  loadDatabaseConfig,
  validateRequiredEnvVars,
  getDatabaseConfig,
} from "../../src/config/database.js";

describe("database config", () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    // Store original environment
    originalEnv = { ...process.env };
    // Clear Vertica-related env vars for clean testing
    delete process.env.VERTICA_HOST;
    delete process.env.VERTICA_PORT;
    delete process.env.VERTICA_DATABASE;
    delete process.env.VERTICA_USER;
    delete process.env.VERTICA_PASSWORD;
    delete process.env.VERTICA_CONNECTION_LIMIT;
    delete process.env.VERTICA_QUERY_TIMEOUT;
    delete process.env.VERTICA_SSL;
    delete process.env.VERTICA_SSL_REJECT_UNAUTHORIZED;
    delete process.env.VERTICA_DEFAULT_SCHEMA;
    delete process.env.VERTICA_READONLY_MODE;
  });

  afterEach(() => {
    // Restore original environment
    process.env = originalEnv;
  });

  describe("loadDatabaseConfig", () => {
    it("should load valid configuration with all fields", () => {
      process.env.VERTICA_HOST = "localhost";
      process.env.VERTICA_PORT = "5433";
      process.env.VERTICA_DATABASE = "testdb";
      process.env.VERTICA_USER = "testuser";
      process.env.VERTICA_PASSWORD = "testpass";
      process.env.VERTICA_CONNECTION_LIMIT = "20";
      process.env.VERTICA_QUERY_TIMEOUT = "30000";
      process.env.VERTICA_SSL = "true";
      process.env.VERTICA_SSL_REJECT_UNAUTHORIZED = "false";
      process.env.VERTICA_DEFAULT_SCHEMA = "custom";
      process.env.VERTICA_READONLY_MODE = "false";

      const config = loadDatabaseConfig();

      expect(config).toEqual({
        host: "localhost",
        port: 5433,
        database: "testdb",
        user: "testuser",
        password: "testpass",
        connectionLimit: 20,
        queryTimeout: 30000,
        ssl: true,
        sslRejectUnauthorized: true,
        defaultSchema: "custom",
        readonlyMode: false,
      });
    });

    it("should use default values for optional fields", () => {
      process.env.VERTICA_HOST = "localhost";
      process.env.VERTICA_DATABASE = "testdb";
      process.env.VERTICA_USER = "testuser";

      const config = loadDatabaseConfig();

      expect(config.port).toBe(5433); // default
      expect(config.connectionLimit).toBe(10); // default
      expect(config.queryTimeout).toBe(60000); // default
      expect(config.ssl).toBe(false); // default
      expect(config.sslRejectUnauthorized).toBe(true); // default
      expect(config.defaultSchema).toBe("public"); // default
      expect(config.readonlyMode).toBe(true); // default
    });

    it("should handle boolean string values (any string becomes true)", () => {
      process.env.VERTICA_HOST = "localhost";
      process.env.VERTICA_DATABASE = "testdb";
      process.env.VERTICA_USER = "testuser";
      process.env.VERTICA_SSL = "true";
      process.env.VERTICA_SSL_REJECT_UNAUTHORIZED = "false"; // Note: "false" string becomes true

      const config = loadDatabaseConfig();

      expect(config.ssl).toBe(true);
      expect(config.sslRejectUnauthorized).toBe(true); // "false" string coerced to true
    });

    it("should handle numeric string values", () => {
      process.env.VERTICA_HOST = "localhost";
      process.env.VERTICA_DATABASE = "testdb";
      process.env.VERTICA_USER = "testuser";
      process.env.VERTICA_PORT = "5555";
      process.env.VERTICA_CONNECTION_LIMIT = "15";
      process.env.VERTICA_QUERY_TIMEOUT = "45000";

      const config = loadDatabaseConfig();

      expect(config.port).toBe(5555);
      expect(config.connectionLimit).toBe(15);
      expect(config.queryTimeout).toBe(45000);
    });

    it("should throw error for missing required host", () => {
      process.env.VERTICA_DATABASE = "testdb";
      process.env.VERTICA_USER = "testuser";

      expect(() => loadDatabaseConfig()).toThrow(
        "Invalid database configuration: host: Required"
      );
    });

    it("should throw error for missing required database", () => {
      process.env.VERTICA_HOST = "localhost";
      process.env.VERTICA_USER = "testuser";

      expect(() => loadDatabaseConfig()).toThrow(
        "Invalid database configuration: database: Required"
      );
    });

    it("should throw error for missing required user", () => {
      process.env.VERTICA_HOST = "localhost";
      process.env.VERTICA_DATABASE = "testdb";

      expect(() => loadDatabaseConfig()).toThrow(
        "Invalid database configuration: user: Required"
      );
    });

    it("should throw error for invalid port range", () => {
      process.env.VERTICA_HOST = "localhost";
      process.env.VERTICA_DATABASE = "testdb";
      process.env.VERTICA_USER = "testuser";
      process.env.VERTICA_PORT = "70000"; // invalid port

      expect(() => loadDatabaseConfig()).toThrow(
        "Invalid database configuration"
      );
    });

    it("should throw error for invalid connection limit", () => {
      process.env.VERTICA_HOST = "localhost";
      process.env.VERTICA_DATABASE = "testdb";
      process.env.VERTICA_USER = "testuser";
      process.env.VERTICA_CONNECTION_LIMIT = "0"; // invalid

      expect(() => loadDatabaseConfig()).toThrow(
        "Invalid database configuration"
      );
    });

    it("should throw error for invalid query timeout", () => {
      process.env.VERTICA_HOST = "localhost";
      process.env.VERTICA_DATABASE = "testdb";
      process.env.VERTICA_USER = "testuser";
      process.env.VERTICA_QUERY_TIMEOUT = "500"; // too low

      expect(() => loadDatabaseConfig()).toThrow(
        "Invalid database configuration"
      );
    });

    it("should handle empty strings as missing values", () => {
      process.env.VERTICA_HOST = "";
      process.env.VERTICA_DATABASE = "testdb";
      process.env.VERTICA_USER = "testuser";

      expect(() => loadDatabaseConfig()).toThrow(
        "Invalid database configuration: host: VERTICA_HOST is required"
      );
    });

    it("should handle readonly mode configuration", () => {
      process.env.VERTICA_HOST = "localhost";
      process.env.VERTICA_DATABASE = "testdb";
      process.env.VERTICA_USER = "testuser";

      // Test default (should be true)
      const defaultConfig = loadDatabaseConfig();
      expect(defaultConfig.readonlyMode).toBe(true);

      // Test explicit true
      process.env.VERTICA_READONLY_MODE = "true";
      const trueConfig = loadDatabaseConfig();
      expect(trueConfig.readonlyMode).toBe(true);

      // Test explicit false
      process.env.VERTICA_READONLY_MODE = "false";
      const falseConfig = loadDatabaseConfig();
      expect(falseConfig.readonlyMode).toBe(false);

      // Test case insensitive
      process.env.VERTICA_READONLY_MODE = "FALSE";
      const falseUpperConfig = loadDatabaseConfig();
      expect(falseUpperConfig.readonlyMode).toBe(false);

      process.env.VERTICA_READONLY_MODE = "TRUE";
      const trueUpperConfig = loadDatabaseConfig();
      expect(trueUpperConfig.readonlyMode).toBe(true);

      // Test numeric values
      process.env.VERTICA_READONLY_MODE = "1";
      const oneConfig = loadDatabaseConfig();
      expect(oneConfig.readonlyMode).toBe(true);

      process.env.VERTICA_READONLY_MODE = "0";
      const zeroConfig = loadDatabaseConfig();
      expect(zeroConfig.readonlyMode).toBe(false);
    });

    it("should reject invalid readonly mode values", () => {
      process.env.VERTICA_HOST = "localhost";
      process.env.VERTICA_DATABASE = "testdb";
      process.env.VERTICA_USER = "testuser";
      process.env.VERTICA_READONLY_MODE = "invalid";

      expect(() => loadDatabaseConfig()).toThrow(
        "Invalid boolean value: invalid"
      );
    });
  });

  describe("validateRequiredEnvVars", () => {
    it("should pass when all required vars are present", () => {
      process.env.VERTICA_HOST = "localhost";
      process.env.VERTICA_DATABASE = "testdb";
      process.env.VERTICA_USER = "testuser";

      expect(() => validateRequiredEnvVars()).not.toThrow();
    });

    it("should throw when VERTICA_HOST is missing", () => {
      delete process.env.VERTICA_HOST;
      process.env.VERTICA_DATABASE = "testdb";
      process.env.VERTICA_USER = "testuser";

      expect(() => validateRequiredEnvVars()).toThrow(
        "Missing required environment variables: VERTICA_HOST"
      );
    });

    it("should throw when VERTICA_DATABASE is missing", () => {
      process.env.VERTICA_HOST = "localhost";
      delete process.env.VERTICA_DATABASE;
      process.env.VERTICA_USER = "testuser";

      expect(() => validateRequiredEnvVars()).toThrow(
        "Missing required environment variables: VERTICA_DATABASE"
      );
    });

    it("should throw when VERTICA_USER is missing", () => {
      process.env.VERTICA_HOST = "localhost";
      process.env.VERTICA_DATABASE = "testdb";
      delete process.env.VERTICA_USER;

      expect(() => validateRequiredEnvVars()).toThrow(
        "Missing required environment variables: VERTICA_USER"
      );
    });

    it("should throw with multiple missing vars", () => {
      delete process.env.VERTICA_HOST;
      delete process.env.VERTICA_DATABASE;
      process.env.VERTICA_USER = "testuser";

      expect(() => validateRequiredEnvVars()).toThrow(
        "Missing required environment variables: VERTICA_HOST, VERTICA_DATABASE"
      );
    });

    it("should throw with all missing vars", () => {
      delete process.env.VERTICA_HOST;
      delete process.env.VERTICA_DATABASE;
      delete process.env.VERTICA_USER;

      expect(() => validateRequiredEnvVars()).toThrow(
        "Missing required environment variables: VERTICA_HOST, VERTICA_DATABASE, VERTICA_USER"
      );
    });
  });

  describe("getDatabaseConfig", () => {
    it("should validate and return config when all requirements met", () => {
      process.env.VERTICA_HOST = "localhost";
      process.env.VERTICA_DATABASE = "testdb";
      process.env.VERTICA_USER = "testuser";

      const config = getDatabaseConfig();

      expect(config.host).toBe("localhost");
      expect(config.database).toBe("testdb");
      expect(config.user).toBe("testuser");
    });

    it("should throw when required env vars are missing", () => {
      delete process.env.VERTICA_HOST;

      expect(() => getDatabaseConfig()).toThrow(
        "Missing required environment variables"
      );
    });

    it("should throw when config validation fails", () => {
      process.env.VERTICA_HOST = "localhost";
      process.env.VERTICA_DATABASE = "testdb";
      process.env.VERTICA_USER = "testuser";
      process.env.VERTICA_PORT = "invalid"; // invalid port

      expect(() => getDatabaseConfig()).toThrow(
        "Invalid database configuration"
      );
    });
  });
});
