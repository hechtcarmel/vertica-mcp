import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  jest,
} from "@jest/globals";
import ExecuteQueryTool from "../../src/tools/execute-query.js";
import type { QueryResult } from "../../src/types/vertica.js";

// Mock the service and config
jest.mock("../../src/services/vertica-service.js");
jest.mock("../../src/config/database.js");

import { VerticaService } from "../../src/services/vertica-service.js";
import { getDatabaseConfig } from "../../src/config/database.js";

// Type the mocked modules
const MockedVerticaService = VerticaService as jest.MockedClass<
  typeof VerticaService
>;
const mockedGetDatabaseConfig = getDatabaseConfig as jest.MockedFunction<
  typeof getDatabaseConfig
>;

describe("ExecuteQueryTool", () => {
  let tool: ExecuteQueryTool;
  let mockService: jest.Mocked<VerticaService>;

  // Helper to create proper QueryResult
  const createMockResult = (
    rows: Record<string, unknown>[] = []
  ): QueryResult => ({
    rows,
    rowCount: rows.length,
    fields: [
      {
        name: "id",
        format: "int",
        dataTypeID: 1,
        dataTypeSize: 4,
        dataTypeModifier: 0,
      },
      {
        name: "name",
        format: "varchar",
        dataTypeID: 2,
        dataTypeSize: 255,
        dataTypeModifier: 0,
      },
    ],
    command: "SELECT",
  });

  beforeEach(() => {
    tool = new ExecuteQueryTool();

    // Create mock service instance
    mockService = {
      executeQuery: jest.fn(),
      disconnect: jest.fn(),
    } as any;

    MockedVerticaService.mockImplementation(() => mockService);

    // Mock database config
    mockedGetDatabaseConfig.mockReturnValue({
      host: "localhost",
      port: 5433,
      database: "test",
      user: "test",
      password: "test",
      connectionLimit: 10,
      queryTimeout: 60000,
      ssl: false,
      sslRejectUnauthorized: true,
      defaultSchema: "public",
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("tool properties", () => {
    it("should have correct name", () => {
      expect(tool.name).toBe("execute_query");
    });

    it("should have description", () => {
      expect(tool.description).toContain("readonly SQL queries");
    });

    it("should have valid input schema", () => {
      expect(tool.inputSchema.type).toBe("object");
      expect(tool.inputSchema.properties.sql.type).toBe("string");
      expect(tool.inputSchema.required).toContain("sql");
    });
  });

  describe("input validation", () => {
    it("should accept valid SQL with no parameters", async () => {
      mockService.executeQuery.mockResolvedValue(
        createMockResult([{ id: 1, name: "test" }])
      );

      const result = await tool.execute({ sql: "SELECT * FROM users" });
      const parsed = JSON.parse(result);

      expect(parsed.success).toBe(true);
      expect(mockService.executeQuery).toHaveBeenCalledWith(
        "SELECT * FROM users",
        []
      );
    });

    it("should accept valid SQL with parameters", async () => {
      mockService.executeQuery.mockResolvedValue(
        createMockResult([{ id: 1, name: "test" }])
      );

      const result = await tool.execute({
        sql: "SELECT * FROM users WHERE id = ?",
        params: [1],
      });
      const parsed = JSON.parse(result);

      expect(parsed.success).toBe(true);
      expect(mockService.executeQuery).toHaveBeenCalledWith(
        "SELECT * FROM users WHERE id = ?",
        [1]
      );
    });

    it("should reject missing sql parameter", async () => {
      await expect(tool.execute({})).rejects.toThrow();
    });

    it("should reject non-string sql", async () => {
      await expect(tool.execute({ sql: 123 })).rejects.toThrow();
    });

    it("should reject invalid params type", async () => {
      await expect(
        tool.execute({
          sql: "SELECT * FROM users",
          params: "invalid",
        })
      ).rejects.toThrow();
    });
  });

  describe("successful execution", () => {
    it("should format query results correctly", async () => {
      const mockRows = [
        { id: 1, name: "Alice" },
        { id: 2, name: "Bob" },
      ];

      mockService.executeQuery.mockResolvedValue(createMockResult(mockRows));

      const result = await tool.execute({ sql: "SELECT * FROM users" });
      const parsed = JSON.parse(result);

      expect(parsed.success).toBe(true);
      expect(parsed.query).toBe("SELECT * FROM users");
      expect(parsed.rowCount).toBe(2);
      expect(parsed.rows).toEqual(mockRows);
      expect(parsed.fields).toEqual([
        { name: "id", dataType: "int" },
        { name: "name", dataType: "varchar" },
      ]);
      expect(parsed.executedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });

    it("should handle empty result set", async () => {
      mockService.executeQuery.mockResolvedValue(createMockResult([]));

      const result = await tool.execute({ sql: "SELECT * FROM empty_table" });
      const parsed = JSON.parse(result);

      expect(parsed.success).toBe(true);
      expect(parsed.rowCount).toBe(0);
      expect(parsed.rows).toEqual([]);
    });

    it("should disconnect service after execution", async () => {
      mockService.executeQuery.mockResolvedValue(createMockResult([]));

      await tool.execute({ sql: "SELECT 1" });

      expect(mockService.disconnect).toHaveBeenCalled();
    });
  });

  describe("error handling", () => {
    it("should handle database connection errors", async () => {
      mockService.executeQuery.mockRejectedValue(
        new Error("Connection failed")
      );

      const result = await tool.execute({ sql: "SELECT * FROM users" });
      const parsed = JSON.parse(result);

      expect(parsed.success).toBe(false);
      expect(parsed.error).toBe("Connection failed");
      expect(parsed.query).toBe("SELECT * FROM users");
      expect(parsed.executedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });

    it("should handle SQL syntax errors", async () => {
      mockService.executeQuery.mockRejectedValue(new Error("Syntax error"));

      const result = await tool.execute({ sql: "INVALID SQL" });
      const parsed = JSON.parse(result);

      expect(parsed.success).toBe(false);
      expect(parsed.error).toBe("Syntax error");
      expect(parsed.query).toBe("INVALID SQL");
    });

    it("should handle service creation errors", async () => {
      mockedGetDatabaseConfig.mockImplementation(() => {
        throw new Error("Config error");
      });

      const result = await tool.execute({ sql: "SELECT 1" });
      const parsed = JSON.parse(result);

      expect(parsed.success).toBe(false);
      expect(parsed.error).toBe("Config error");
    });

    it("should disconnect even when execution fails", async () => {
      mockService.executeQuery.mockRejectedValue(new Error("Query failed"));

      await tool.execute({ sql: "SELECT 1" });

      expect(mockService.disconnect).toHaveBeenCalled();
    });

    it("should handle disconnect errors gracefully", async () => {
      mockService.executeQuery.mockResolvedValue(createMockResult([]));
      mockService.disconnect.mockRejectedValue(new Error("Disconnect failed"));

      // Should not throw, just log warning
      await expect(tool.execute({ sql: "SELECT 1" })).resolves.not.toThrow();
    });
  });

  describe("parameter handling", () => {
    it("should handle numeric parameters", async () => {
      mockService.executeQuery.mockResolvedValue(createMockResult([]));

      await tool.execute({
        sql: "SELECT * FROM users WHERE id = ? AND age > ?",
        params: [1, 18],
      });

      expect(mockService.executeQuery).toHaveBeenCalledWith(
        "SELECT * FROM users WHERE id = ? AND age > ?",
        [1, 18]
      );
    });

    it("should handle string parameters", async () => {
      mockService.executeQuery.mockResolvedValue(createMockResult([]));

      await tool.execute({
        sql: "SELECT * FROM users WHERE name = ?",
        params: ["John"],
      });

      expect(mockService.executeQuery).toHaveBeenCalledWith(
        "SELECT * FROM users WHERE name = ?",
        ["John"]
      );
    });

    it("should handle mixed parameter types", async () => {
      mockService.executeQuery.mockResolvedValue(createMockResult([]));

      await tool.execute({
        sql: "SELECT * FROM users WHERE id = ? AND name = ? AND active = ?",
        params: [1, "John", true],
      });

      expect(mockService.executeQuery).toHaveBeenCalledWith(
        "SELECT * FROM users WHERE id = ? AND name = ? AND active = ?",
        [1, "John", true]
      );
    });
  });
});
