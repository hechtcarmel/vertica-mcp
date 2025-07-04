import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  jest,
} from "@jest/globals";
import StreamQueryTool from "../../src/tools/stream-query.js";
import type { StreamQueryResult } from "../../src/types/vertica.js";

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

describe("StreamQueryTool", () => {
  let tool: StreamQueryTool;
  let mockService: jest.Mocked<VerticaService>;

  // Helper to create mock stream result
  const createMockStreamResult = (
    batchNumber: number,
    rows: Record<string, unknown>[],
    hasMore: boolean = false
  ): StreamQueryResult => ({
    batch: rows,
    batchNumber,
    totalBatches: hasMore ? batchNumber + 1 : batchNumber,
    hasMore,
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
  });

  beforeEach(() => {
    tool = new StreamQueryTool();

    // Create mock service instance
    mockService = {
      streamQuery: jest.fn(),
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
      expect(tool.name).toBe("stream_query");
    });

    it("should have description", () => {
      expect(tool.description).toContain("Stream large readonly query results");
    });

    it("should have valid input schema", () => {
      expect(tool.inputSchema.type).toBe("object");
      expect(tool.inputSchema.properties.sql.type).toBe("string");
      expect(tool.inputSchema.properties.batchSize?.minimum).toBe(1);
      expect(tool.inputSchema.properties.batchSize?.maximum).toBe(10000);
      expect(tool.inputSchema.required).toContain("sql");
    });
  });

  describe("input validation", () => {
    it("should accept valid SQL with default batch size", async () => {
      // Mock async generator
      const mockResults = [
        createMockStreamResult(1, [{ id: 1, name: "test" }], false),
      ];
      mockService.streamQuery.mockImplementation(async function* () {
        for (const result of mockResults) {
          yield result;
        }
      });

      const result = await tool.execute({ sql: "SELECT * FROM users" });
      const parsed = JSON.parse(result);

      expect(parsed.success).toBe(true);
      expect(mockService.streamQuery).toHaveBeenCalledWith(
        "SELECT * FROM users",
        {
          batchSize: 1000,
          maxRows: undefined,
        }
      );
    });

    it("should accept custom batch size", async () => {
      const mockResults = [createMockStreamResult(1, [], false)];
      mockService.streamQuery.mockImplementation(async function* () {
        for (const result of mockResults) {
          yield result;
        }
      });

      await tool.execute({
        sql: "SELECT * FROM users",
        batchSize: 500,
      });

      expect(mockService.streamQuery).toHaveBeenCalledWith(
        "SELECT * FROM users",
        {
          batchSize: 500,
          maxRows: undefined,
        }
      );
    });

    it("should accept max rows parameter", async () => {
      const mockResults = [createMockStreamResult(1, [], false)];
      mockService.streamQuery.mockImplementation(async function* () {
        for (const result of mockResults) {
          yield result;
        }
      });

      await tool.execute({
        sql: "SELECT * FROM users",
        maxRows: 5000,
      });

      expect(mockService.streamQuery).toHaveBeenCalledWith(
        "SELECT * FROM users",
        {
          batchSize: 1000,
          maxRows: 5000,
        }
      );
    });

    it("should reject missing sql parameter", async () => {
      await expect(tool.execute({})).rejects.toThrow();
    });

    it("should reject invalid batch size (too small)", async () => {
      await expect(
        tool.execute({
          sql: "SELECT * FROM users",
          batchSize: 0,
        })
      ).rejects.toThrow();
    });

    it("should reject invalid batch size (too large)", async () => {
      await expect(
        tool.execute({
          sql: "SELECT * FROM users",
          batchSize: 15000,
        })
      ).rejects.toThrow();
    });

    it("should reject invalid max rows (too small)", async () => {
      await expect(
        tool.execute({
          sql: "SELECT * FROM users",
          maxRows: 0,
        })
      ).rejects.toThrow();
    });

    it("should reject invalid max rows (too large)", async () => {
      await expect(
        tool.execute({
          sql: "SELECT * FROM users",
          maxRows: 2000000,
        })
      ).rejects.toThrow();
    });
  });

  describe("streaming functionality", () => {
    it("should handle single batch result", async () => {
      const mockRows = [
        { id: 1, name: "Alice" },
        { id: 2, name: "Bob" },
      ];
      const mockResults = [createMockStreamResult(1, mockRows, false)];

      mockService.streamQuery.mockImplementation(async function* () {
        for (const result of mockResults) {
          yield result;
        }
      });

      const result = await tool.execute({ sql: "SELECT * FROM users" });
      const parsed = JSON.parse(result);

      expect(parsed.success).toBe(true);
      expect(parsed.totalRows).toBe(2);
      expect(parsed.batchCount).toBe(1);
      expect(parsed.batches).toHaveLength(1);
      expect(parsed.batches[0].batchNumber).toBe(1);
      expect(parsed.batches[0].rowCount).toBe(2);
      expect(parsed.batches[0].rows).toEqual(mockRows);
      expect(parsed.batches[0].hasMore).toBe(false);
    });

    it("should handle multiple batch results", async () => {
      const mockResults = [
        createMockStreamResult(1, [{ id: 1, name: "Alice" }], true),
        createMockStreamResult(2, [{ id: 2, name: "Bob" }], false),
      ];

      mockService.streamQuery.mockImplementation(async function* () {
        for (const result of mockResults) {
          yield result;
        }
      });

      const result = await tool.execute({ sql: "SELECT * FROM users" });
      const parsed = JSON.parse(result);

      expect(parsed.success).toBe(true);
      expect(parsed.totalRows).toBe(2);
      expect(parsed.batchCount).toBe(2);
      expect(parsed.batches).toHaveLength(2);
      expect(parsed.batches[0].batchNumber).toBe(1);
      expect(parsed.batches[0].hasMore).toBe(true);
      expect(parsed.batches[1].batchNumber).toBe(2);
      expect(parsed.batches[1].hasMore).toBe(false);
    });

    it("should limit batches to 100 for safety", async () => {
      // Generate 150 batches
      const mockResults = Array.from({ length: 150 }, (_, i) =>
        createMockStreamResult(
          i + 1,
          [{ id: i + 1, name: `User${i + 1}` }],
          i < 149
        )
      );

      mockService.streamQuery.mockImplementation(async function* () {
        for (const result of mockResults) {
          yield result;
        }
      });

      const result = await tool.execute({ sql: "SELECT * FROM users" });
      const parsed = JSON.parse(result);

      expect(parsed.success).toBe(true);
      expect(parsed.batchCount).toBe(101); // Should stop after 101 batches (> 100)
      expect(parsed.batches).toHaveLength(101);
    });

    it("should disconnect service after streaming", async () => {
      const mockResults = [createMockStreamResult(1, [], false)];
      mockService.streamQuery.mockImplementation(async function* () {
        for (const result of mockResults) {
          yield result;
        }
      });

      await tool.execute({ sql: "SELECT 1" });

      expect(mockService.disconnect).toHaveBeenCalled();
    });
  });

  describe("error handling", () => {
    it("should handle streaming errors", async () => {
      mockService.streamQuery.mockImplementation(async function* () {
        throw new Error("Streaming failed");
      });

      const result = await tool.execute({ sql: "SELECT * FROM users" });
      const parsed = JSON.parse(result);

      expect(parsed.success).toBe(false);
      expect(parsed.error).toBe("Streaming failed");
      expect(parsed.query).toBe("SELECT * FROM users");
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

    it("should disconnect even when streaming fails", async () => {
      mockService.streamQuery.mockImplementation(async function* () {
        throw new Error("Streaming failed");
      });

      await tool.execute({ sql: "SELECT 1" });

      expect(mockService.disconnect).toHaveBeenCalled();
    });
  });

  describe("field formatting", () => {
    it("should format field information correctly", async () => {
      const mockResults = [
        createMockStreamResult(1, [{ id: 1, name: "test" }], false),
      ];

      mockService.streamQuery.mockImplementation(async function* () {
        for (const result of mockResults) {
          yield result;
        }
      });

      const result = await tool.execute({ sql: "SELECT * FROM users" });
      const parsed = JSON.parse(result);

      expect(parsed.batches[0].fields).toEqual([
        { name: "id", dataType: "int" },
        { name: "name", dataType: "varchar" },
      ]);
    });
  });
});
