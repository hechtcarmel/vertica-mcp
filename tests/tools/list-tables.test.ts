import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  jest,
} from "@jest/globals";
import ListTablesTool from "../../src/tools/list-tables.js";
import { VerticaService } from "../../src/services/vertica-service.js";
import { getDatabaseConfig } from "../../src/config/database.js";
import type { TableInfo } from "../../src/types/vertica.js";
import { logger } from "../../src/utils/logger";
import { LOG_MESSAGES } from "../../src/constants/index.js";

// Mock modules
jest.mock("../../src/services/vertica-service.js");
jest.mock("../../src/config/database.js");

const mockedVerticaService = VerticaService as jest.MockedClass<
  typeof VerticaService
>;
const mockedGetDatabaseConfig = getDatabaseConfig as jest.MockedFunction<
  typeof getDatabaseConfig
>;

describe("ListTablesTool", () => {
  let tool: ListTablesTool;
  let mockServiceInstance: jest.Mocked<VerticaService>;

  beforeEach(() => {
    tool = new ListTablesTool();
    mockServiceInstance = {
      listTables: jest.fn(),
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
      expect(tool.name).toBe("list_tables");
    });

    it("should have appropriate description", () => {
      expect(tool.description).toBe(
        "List all tables in a schema with metadata"
      );
    });

    it("should have correct input schema", () => {
      expect(tool.inputSchema.type).toBe("object");
      expect(tool.inputSchema.properties.schemaName).toEqual({
        type: "string",
        description:
          "Schema name (optional, defaults to configured default schema)",
      });
      expect(tool.inputSchema.required).toEqual([]);
    });
  });

  describe("Input Validation", () => {
    it("should accept empty input", async () => {
      const mockTables: TableInfo[] = [];
      mockServiceInstance.listTables.mockResolvedValue(mockTables);

      const result = await tool.execute({});
      const parsed = JSON.parse(result);

      expect(parsed.success).toBe(true);
      expect(mockServiceInstance.listTables).toHaveBeenCalledWith(undefined);
    });

    it("should accept valid input with schemaName", async () => {
      const mockTables: TableInfo[] = [];
      mockServiceInstance.listTables.mockResolvedValue(mockTables);

      const result = await tool.execute({ schemaName: "custom_schema" });
      const parsed = JSON.parse(result);

      expect(parsed.success).toBe(true);
      expect(mockServiceInstance.listTables).toHaveBeenCalledWith(
        "custom_schema"
      );
    });

    it("should reject invalid input types", async () => {
      await expect(tool.execute({ schemaName: 123 })).rejects.toThrow();
    });
  });

  describe("Successful Execution", () => {
    it("should return empty list when no tables exist", async () => {
      const mockTables: TableInfo[] = [];
      mockServiceInstance.listTables.mockResolvedValue(mockTables);

      const result = await tool.execute({});
      const parsed = JSON.parse(result);

      expect(parsed.success).toBe(true);
      expect(parsed.schema).toBe("public");
      expect(parsed.tableCount).toBe(0);
      expect(parsed.tables).toEqual([]);
      expect(parsed.queriedAt).toBeDefined();
      expect(mockServiceInstance.disconnect).toHaveBeenCalled();
    });

    it("should return list of tables successfully", async () => {
      const mockTables: TableInfo[] = [
        {
          schemaName: "public",
          tableName: "users",
          tableType: "TABLE",
          owner: "testuser",
          rowCount: 100,
          comment: "User data table",
        },
        {
          schemaName: "public",
          tableName: "products",
          tableType: "TABLE",
          owner: "testuser",
          rowCount: 250,
        },
      ];

      mockServiceInstance.listTables.mockResolvedValue(mockTables);

      const result = await tool.execute({});
      const parsed = JSON.parse(result);

      expect(parsed.success).toBe(true);
      expect(parsed.schema).toBe("public");
      expect(parsed.tableCount).toBe(2);
      expect(parsed.tables).toHaveLength(2);
      expect(parsed.tables[0]).toEqual({
        schemaName: "public",
        tableName: "users",
        owner: "testuser",
        comment: "User data table",
        rowCount: 100,
      });
      expect(parsed.tables[1]).toEqual({
        schemaName: "public",
        tableName: "products",
        owner: "testuser",
        comment: undefined,
        rowCount: 250,
      });
    });

    it("should use specified schema name", async () => {
      const mockTables: TableInfo[] = [
        {
          schemaName: "custom_schema",
          tableName: "special_table",
          tableType: "VIEW",
          owner: "admin",
        },
      ];

      mockServiceInstance.listTables.mockResolvedValue(mockTables);

      const result = await tool.execute({ schemaName: "custom_schema" });
      const parsed = JSON.parse(result);

      expect(parsed.success).toBe(true);
      expect(parsed.schema).toBe("custom_schema");
      expect(parsed.tableCount).toBe(1);
      expect(mockServiceInstance.listTables).toHaveBeenCalledWith(
        "custom_schema"
      );
    });

    it("should use default schema when none specified", async () => {
      const mockTables: TableInfo[] = [];
      mockServiceInstance.listTables.mockResolvedValue(mockTables);

      const result = await tool.execute({});
      const parsed = JSON.parse(result);

      expect(parsed.success).toBe(true);
      expect(parsed.schema).toBe("public");
      expect(mockServiceInstance.listTables).toHaveBeenCalledWith(undefined);
    });

    it("should handle config without default schema", async () => {
      mockedGetDatabaseConfig.mockReturnValue({
        host: "localhost",
        port: 5433,
        database: "testdb",
        user: "testuser",
      } as any);

      const mockTables: TableInfo[] = [];
      mockServiceInstance.listTables.mockResolvedValue(mockTables);

      const result = await tool.execute({});
      const parsed = JSON.parse(result);

      expect(parsed.success).toBe(true);
      expect(parsed.schema).toBe("public");
    });
  });

  describe("Error Handling", () => {
    it("should handle database connection errors", async () => {
      mockServiceInstance.listTables.mockRejectedValue(
        new Error("Connection failed")
      );

      const result = await tool.execute({});
      const parsed = JSON.parse(result);

      expect(parsed.success).toBe(false);
      expect(parsed.error).toBe("Connection failed");
      expect(parsed.schemaName).toBeUndefined();
      expect(parsed.queriedAt).toBeDefined();
      expect(mockServiceInstance.disconnect).toHaveBeenCalled();
    });

    it("should handle schema not found errors", async () => {
      mockServiceInstance.listTables.mockRejectedValue(
        new Error('Schema "unknown_schema" does not exist')
      );

      const result = await tool.execute({ schemaName: "unknown_schema" });
      const parsed = JSON.parse(result);

      expect(parsed.success).toBe(false);
      expect(parsed.error).toBe('Schema "unknown_schema" does not exist');
      expect(parsed.schemaName).toBe("unknown_schema");
    });

    it("should handle permission errors", async () => {
      mockServiceInstance.listTables.mockRejectedValue(
        new Error('Permission denied for schema "restricted"')
      );

      const result = await tool.execute({ schemaName: "restricted" });
      const parsed = JSON.parse(result);

      expect(parsed.success).toBe(false);
      expect(parsed.error).toBe('Permission denied for schema "restricted"');
    });

    it("should handle service cleanup errors gracefully", async () => {
      const mockTables: TableInfo[] = [];
      mockServiceInstance.listTables.mockResolvedValue(mockTables);
      mockServiceInstance.disconnect.mockRejectedValue(
        new Error("Cleanup failed")
      );

      const warnSpy = jest.spyOn(logger, "warn").mockImplementation(() => {});

      const result = await tool.execute({});
      const parsed = JSON.parse(result);

      expect(parsed.success).toBe(true);
      expect(warnSpy).toHaveBeenCalledWith(
        LOG_MESSAGES.SERVICE_CLEANUP_WARNING,
        expect.any(Error)
      );
      warnSpy.mockRestore();
    });
  });

  describe("Edge Cases", () => {
    it("should handle large number of tables", async () => {
      const mockTables: TableInfo[] = Array.from({ length: 100 }, (_, i) => ({
        schemaName: "public",
        tableName: `table_${i}`,
        tableType: "TABLE",
        owner: "testuser",
      }));

      mockServiceInstance.listTables.mockResolvedValue(mockTables);

      const result = await tool.execute({});
      const parsed = JSON.parse(result);

      expect(parsed.success).toBe(true);
      expect(parsed.tableCount).toBe(100);
      expect(parsed.tables).toHaveLength(100);
    });

    it("should handle non-Error objects in catch block", async () => {
      mockServiceInstance.listTables.mockRejectedValue("String error");

      const result = await tool.execute({});
      const parsed = JSON.parse(result);

      expect(parsed.success).toBe(false);
      expect(parsed.error).toBe("String error");
    });

    it("should handle tables with missing optional fields", async () => {
      const mockTables: TableInfo[] = [
        {
          schemaName: "public",
          tableName: "minimal_table",
          tableType: "TABLE",
          owner: "testuser",
        },
      ];

      mockServiceInstance.listTables.mockResolvedValue(mockTables);

      const result = await tool.execute({});
      const parsed = JSON.parse(result);

      expect(parsed.success).toBe(true);
      expect(parsed.tables[0]).toEqual({
        schemaName: "public",
        tableName: "minimal_table",
        owner: "testuser",
        comment: undefined,
        rowCount: undefined,
      });
    });
  });
});
