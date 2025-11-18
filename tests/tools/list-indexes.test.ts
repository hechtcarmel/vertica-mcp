import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  jest,
} from "@jest/globals";
import ListIndexesTool from "../../src/tools/list-indexes.js";
import { VerticaService } from "../../src/services/vertica-service.js";
import { getDatabaseConfig } from "../../src/config/database.js";
import type { IndexInfo } from "../../src/types/vertica.js";

// Mock modules
jest.mock("../../src/services/vertica-service.js");
jest.mock("../../src/config/database.js");

const mockedVerticaService = VerticaService as jest.MockedClass<
  typeof VerticaService
>;
const mockedGetDatabaseConfig = getDatabaseConfig as jest.MockedFunction<
  typeof getDatabaseConfig
>;

describe("ListIndexesTool", () => {
  let tool: ListIndexesTool;
  let mockServiceInstance: jest.Mocked<VerticaService>;

  beforeEach(() => {
    tool = new ListIndexesTool();
    mockServiceInstance = {
      listIndexes: jest.fn(),
      disconnect: jest.fn().mockResolvedValue(undefined),
    } as any;

    mockedVerticaService.mockImplementation(() => mockServiceInstance);
    mockedGetDatabaseConfig.mockReturnValue({
      host: "localhost",
      port: 5433,
      database: "testdb",
      user: "testuser",
      defaultSchema: "public",
    } as any);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("Tool Properties", () => {
    it("should have correct name", () => {
      expect(tool.name).toBe("list_indexes");
    });

    it("should have appropriate description", () => {
      expect(tool.description).toBe(
        "List indexes (projections) for a specific table in Vertica with column and uniqueness information"
      );
    });

    it("should have correct input schema", () => {
      expect(tool.inputSchema.type).toBe("object");
      expect(tool.inputSchema.properties.tableName).toEqual({
        type: "string",
        description: "Name of the table to list indexes for",
      });
      expect(tool.inputSchema.properties.schemaName).toEqual({
        type: "string",
        description:
          "Schema name (optional, defaults to configured default schema)",
      });
      expect(tool.inputSchema.required).toEqual(["tableName"]);
    });
  });

  describe("Input Validation", () => {
    it("should accept valid input with tableName only", async () => {
      const mockIndexes: IndexInfo[] = [];
      mockServiceInstance.listIndexes.mockResolvedValue(mockIndexes);

      const result = await tool.execute({ tableName: "test_table" });
      const parsed = JSON.parse(result);

      expect(parsed.success).toBe(true);
      expect(mockServiceInstance.listIndexes).toHaveBeenCalledWith(
        "test_table",
        undefined
      );
    });

    it("should accept valid input with tableName and schemaName", async () => {
      const mockIndexes: IndexInfo[] = [];
      mockServiceInstance.listIndexes.mockResolvedValue(mockIndexes);

      const result = await tool.execute({
        tableName: "test_table",
        schemaName: "custom_schema",
      });
      const parsed = JSON.parse(result);

      expect(parsed.success).toBe(true);
      expect(mockServiceInstance.listIndexes).toHaveBeenCalledWith(
        "test_table",
        "custom_schema"
      );
    });

    it("should reject input without tableName", async () => {
      await expect(tool.execute({})).rejects.toThrow();
    });

    it("should reject invalid input types", async () => {
      await expect(tool.execute({ tableName: 123 })).rejects.toThrow();
      await expect(
        tool.execute({ tableName: "test", schemaName: 456 })
      ).rejects.toThrow();
    });
  });

  describe("Successful Execution", () => {
    it("should return empty list when no indexes exist", async () => {
      const mockIndexes: IndexInfo[] = [];
      mockServiceInstance.listIndexes.mockResolvedValue(mockIndexes);

      const result = await tool.execute({ tableName: "test_table" });
      const parsed = JSON.parse(result);

      expect(parsed.success).toBe(true);
      expect(parsed.table).toBe("test_table");
      expect(parsed.schema).toBe("public");
      expect(parsed.indexCount).toBe(0);
      expect(parsed.indexes).toEqual([]);
      expect(parsed.note).toContain("projections");
      expect(parsed.queriedAt).toBeDefined();
      expect(mockServiceInstance.disconnect).toHaveBeenCalled();
    });

    it("should return list of indexes successfully", async () => {
      const mockIndexes: IndexInfo[] = [
        {
          indexName: "pk_users",
          tableName: "users",
          columnName: "id",
          isUnique: true,
          indexType: "PRIMARY",
          ordinalPosition: 1,
        },
        {
          indexName: "idx_users_email",
          tableName: "users",
          columnName: "email",
          isUnique: true,
          indexType: "UNIQUE",
          ordinalPosition: 1,
        },
        {
          indexName: "idx_users_name",
          tableName: "users",
          columnName: "name",
          isUnique: false,
          indexType: "INDEX",
          ordinalPosition: 1,
        },
      ];

      mockServiceInstance.listIndexes.mockResolvedValue(mockIndexes);

      const result = await tool.execute({ tableName: "users" });
      const parsed = JSON.parse(result);

      expect(parsed.success).toBe(true);
      expect(parsed.table).toBe("users");
      expect(parsed.schema).toBe("public");
      expect(parsed.indexCount).toBe(3);
      expect(parsed.indexes).toHaveLength(3);
      expect(parsed.indexes[0]).toEqual({
        indexName: "pk_users",
        columnName: "id",
        isUnique: true,
        indexType: "PRIMARY",
        ordinalPosition: 1,
      });
      expect(parsed.indexes[1]).toEqual({
        indexName: "idx_users_email",
        columnName: "email",
        isUnique: true,
        indexType: "UNIQUE",
        ordinalPosition: 1,
      });
      expect(parsed.indexes[2]).toEqual({
        indexName: "idx_users_name",
        columnName: "name",
        isUnique: false,
        indexType: "INDEX",
        ordinalPosition: 1,
      });
    });

    it("should use specified schema name", async () => {
      const mockIndexes: IndexInfo[] = [
        {
          indexName: "idx_special",
          tableName: "special_table",
          columnName: "special_column",
          isUnique: false,
          indexType: "INDEX",
          ordinalPosition: 1,
        },
      ];

      mockServiceInstance.listIndexes.mockResolvedValue(mockIndexes);

      const result = await tool.execute({
        tableName: "special_table",
        schemaName: "custom_schema",
      });
      const parsed = JSON.parse(result);

      expect(parsed.success).toBe(true);
      expect(parsed.table).toBe("special_table");
      expect(parsed.schema).toBe("custom_schema");
      expect(parsed.indexCount).toBe(1);
      expect(mockServiceInstance.listIndexes).toHaveBeenCalledWith(
        "special_table",
        "custom_schema"
      );
    });

    it("should use default schema when none specified", async () => {
      const mockIndexes: IndexInfo[] = [];
      mockServiceInstance.listIndexes.mockResolvedValue(mockIndexes);

      const result = await tool.execute({ tableName: "test_table" });
      const parsed = JSON.parse(result);

      expect(parsed.success).toBe(true);
      expect(parsed.schema).toBe("public");
      expect(mockServiceInstance.listIndexes).toHaveBeenCalledWith(
        "test_table",
        undefined
      );
    });

    it("should handle config without default schema", async () => {
      mockedGetDatabaseConfig.mockReturnValue({
        host: "localhost",
        port: 5433,
        database: "testdb",
        user: "testuser",
      } as any);

      const mockIndexes: IndexInfo[] = [];
      mockServiceInstance.listIndexes.mockResolvedValue(mockIndexes);

      const result = await tool.execute({ tableName: "test_table" });
      const parsed = JSON.parse(result);

      expect(parsed.success).toBe(true);
      expect(parsed.schema).toBe("public");
    });
  });

  describe("Error Handling", () => {
    it("should handle database connection errors", async () => {
      mockServiceInstance.listIndexes.mockRejectedValue(
        new Error("Connection failed")
      );

      const result = await tool.execute({ tableName: "test_table" });
      const parsed = JSON.parse(result);

      expect(parsed.success).toBe(false);
      expect(parsed.error).toBe("Connection failed");
      expect(parsed.tableName).toBe("test_table");
      expect(parsed.schemaName).toBeUndefined();
      expect(parsed.queriedAt).toBeDefined();
      expect(mockServiceInstance.disconnect).toHaveBeenCalled();
    });

    it("should handle table not found errors", async () => {
      mockServiceInstance.listIndexes.mockRejectedValue(
        new Error('Table "unknown_table" does not exist')
      );

      const result = await tool.execute({ tableName: "unknown_table" });
      const parsed = JSON.parse(result);

      expect(parsed.success).toBe(false);
      expect(parsed.error).toBe('Table "unknown_table" does not exist');
      expect(parsed.tableName).toBe("unknown_table");
    });

    it("should handle schema not found errors", async () => {
      mockServiceInstance.listIndexes.mockRejectedValue(
        new Error('Schema "unknown_schema" does not exist')
      );

      const result = await tool.execute({
        tableName: "test_table",
        schemaName: "unknown_schema",
      });
      const parsed = JSON.parse(result);

      expect(parsed.success).toBe(false);
      expect(parsed.error).toBe('Schema "unknown_schema" does not exist');
      expect(parsed.tableName).toBe("test_table");
      expect(parsed.schemaName).toBe("unknown_schema");
    });

    it("should handle permission errors", async () => {
      mockServiceInstance.listIndexes.mockRejectedValue(
        new Error('Permission denied for table "restricted.sensitive_table"')
      );

      const result = await tool.execute({
        tableName: "sensitive_table",
        schemaName: "restricted",
      });
      const parsed = JSON.parse(result);

      expect(parsed.success).toBe(false);
      expect(parsed.error).toBe(
        'Permission denied for table "restricted.sensitive_table"'
      );
    });

    it("should handle service cleanup errors gracefully", async () => {
      const mockIndexes: IndexInfo[] = [];
      mockServiceInstance.listIndexes.mockResolvedValue(mockIndexes);
      mockServiceInstance.disconnect.mockRejectedValue(
        new Error("Cleanup failed")
      );

      const consoleSpy = jest.spyOn(console, "error").mockImplementation();

      const result = await tool.execute({ tableName: "test_table" });
      const parsed = JSON.parse(result);

      expect(parsed.success).toBe(true);
      expect(consoleSpy).toHaveBeenCalledWith(
        "Warning during service cleanup:",
        expect.any(String)
      );
      consoleSpy.mockRestore();
    });
  });

  describe("Edge Cases", () => {
    it("should handle table with many indexes", async () => {
      const mockIndexes: IndexInfo[] = Array.from({ length: 20 }, (_, i) => ({
        indexName: `idx_${i}`,
        tableName: "complex_table",
        columnName: `column_${i}`,
        isUnique: i % 2 === 0,
        indexType: i === 0 ? "PRIMARY" : "INDEX",
        ordinalPosition: 1,
      }));

      mockServiceInstance.listIndexes.mockResolvedValue(mockIndexes);

      const result = await tool.execute({ tableName: "complex_table" });
      const parsed = JSON.parse(result);

      expect(parsed.success).toBe(true);
      expect(parsed.indexCount).toBe(20);
      expect(parsed.indexes).toHaveLength(20);
    });

    it("should handle non-Error objects in catch block", async () => {
      mockServiceInstance.listIndexes.mockRejectedValue("String error");

      const result = await tool.execute({ tableName: "test_table" });
      const parsed = JSON.parse(result);

      expect(parsed.success).toBe(false);
      expect(parsed.error).toBe("String error");
    });

    it("should handle composite indexes", async () => {
      const mockIndexes: IndexInfo[] = [
        {
          indexName: "idx_composite",
          tableName: "users",
          columnName: "first_name",
          isUnique: false,
          indexType: "INDEX",
          ordinalPosition: 1,
        },
        {
          indexName: "idx_composite",
          tableName: "users",
          columnName: "last_name",
          isUnique: false,
          indexType: "INDEX",
          ordinalPosition: 2,
        },
      ];

      mockServiceInstance.listIndexes.mockResolvedValue(mockIndexes);

      const result = await tool.execute({ tableName: "users" });
      const parsed = JSON.parse(result);

      expect(parsed.success).toBe(true);
      expect(parsed.indexCount).toBe(2);
      expect(parsed.indexes[0].ordinalPosition).toBe(1);
      expect(parsed.indexes[1].ordinalPosition).toBe(2);
    });

    it("should handle undefined schemaName in error response", async () => {
      mockServiceInstance.listIndexes.mockRejectedValue(
        new Error("Service error")
      );

      const result = await tool.execute({ tableName: "test_table" });
      const parsed = JSON.parse(result);

      expect(parsed.success).toBe(false);
      expect(parsed.schemaName).toBeUndefined();
    });
  });
});
