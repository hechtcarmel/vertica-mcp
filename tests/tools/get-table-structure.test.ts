import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  jest,
} from "@jest/globals";
import GetTableStructureTool from "../../src/tools/get-table-structure.js";
import { VerticaService } from "../../src/services/vertica-service.js";
import { getDatabaseConfig } from "../../src/config/database.js";
import {
  validateTableName,
  validateSchemaName,
} from "../../src/utils/table-helpers.js";
import type { TableStructure } from "../../src/types/vertica.js";
import { logger } from "../../src/utils/logger";
import { LOG_MESSAGES } from "../../src/constants/index.js";

// Mock modules
jest.mock("../../src/services/vertica-service.js");
jest.mock("../../src/config/database.js");
jest.mock("../../src/utils/table-helpers.js");

const mockedVerticaService = VerticaService as jest.MockedClass<
  typeof VerticaService
>;
const mockedGetDatabaseConfig = getDatabaseConfig as jest.MockedFunction<
  typeof getDatabaseConfig
>;
const mockedValidateTableName = validateTableName as jest.MockedFunction<
  typeof validateTableName
>;
const mockedValidateSchemaName = validateSchemaName as jest.MockedFunction<
  typeof validateSchemaName
>;

describe("GetTableStructureTool", () => {
  let tool: GetTableStructureTool;
  let mockServiceInstance: jest.Mocked<VerticaService>;

  beforeEach(() => {
    tool = new GetTableStructureTool();
    mockServiceInstance = {
      getTableStructure: jest.fn(),
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

    // Set validation mocks to pass by default
    mockedValidateTableName.mockImplementation(() => {});
    mockedValidateSchemaName.mockImplementation(() => {});
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("Tool Properties", () => {
    it("should have correct name", () => {
      expect(tool.name).toBe("get_table_structure");
    });

    it("should have appropriate description", () => {
      expect(tool.description).toContain("detailed structure information");
      expect(tool.description).toContain("columns, data types, constraints");
    });

    it("should have correct input schema", () => {
      expect(tool.inputSchema.type).toBe("object");
      expect(tool.inputSchema.properties.tableName).toEqual({
        type: "string",
        description: "Name of the table to analyze.",
      });
      expect(tool.inputSchema.properties.schemaName).toEqual({
        type: "string",
        description:
          "Schema name (optional, defaults to configured default schema).",
      });
      expect(tool.inputSchema.required).toEqual(["tableName"]);
    });
  });

  describe("Input Validation", () => {
    it("should accept valid input with tableName only", async () => {
      const mockTableStructure: TableStructure = {
        schemaName: "public",
        tableName: "test_table",
        columns: [],
        constraints: [],
        tableType: "TABLE",
        owner: "testuser",
      };

      mockServiceInstance.getTableStructure.mockResolvedValue(
        mockTableStructure
      );

      const result = await tool.execute({ tableName: "test_table" });
      const parsed = JSON.parse(result);

      expect(parsed.success).toBe(true);
      expect(mockedValidateTableName).toHaveBeenCalledWith("test_table");
      expect(mockedValidateSchemaName).not.toHaveBeenCalled();
    });

    it("should accept valid input with tableName and schemaName", async () => {
      const mockTableStructure: TableStructure = {
        schemaName: "custom_schema",
        tableName: "test_table",
        columns: [],
        constraints: [],
        tableType: "TABLE",
        owner: "testuser",
      };

      mockServiceInstance.getTableStructure.mockResolvedValue(
        mockTableStructure
      );

      const result = await tool.execute({
        tableName: "test_table",
        schemaName: "custom_schema",
      });
      const parsed = JSON.parse(result);

      expect(parsed.success).toBe(true);
      expect(mockedValidateTableName).toHaveBeenCalledWith("test_table");
      expect(mockedValidateSchemaName).toHaveBeenCalledWith("custom_schema");
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
    it("should return table structure successfully", async () => {
      const mockTableStructure: TableStructure = {
        schemaName: "public",
        tableName: "test_table",
        columns: [
          {
            columnName: "id",
            dataType: "INTEGER",
            isNullable: false,
            ordinalPosition: 1,
          },
        ],
        constraints: [
          {
            constraintName: "pk_test_table",
            constraintType: "PRIMARY KEY",
            columnName: "id",
          },
        ],
        tableType: "TABLE",
        owner: "testuser",
        comment: "Test table",
      };

      mockServiceInstance.getTableStructure.mockResolvedValue(
        mockTableStructure
      );

      const result = await tool.execute({ tableName: "test_table" });
      const parsed = JSON.parse(result);

      expect(parsed.success).toBe(true);
      expect(parsed.queriedAt).toBeDefined();
      expect(mockServiceInstance.disconnect).toHaveBeenCalled();
    });

    it("should pass correct parameters to service", async () => {
      const mockTableStructure: TableStructure = {
        schemaName: "custom_schema",
        tableName: "my_table",
        columns: [],
        constraints: [],
        tableType: "VIEW",
        owner: "testuser",
      };

      mockServiceInstance.getTableStructure.mockResolvedValue(
        mockTableStructure
      );

      await tool.execute({
        tableName: "my_table",
        schemaName: "custom_schema",
      });

      expect(mockServiceInstance.getTableStructure).toHaveBeenCalledWith(
        "my_table",
        "custom_schema"
      );
    });
  });

  describe("Error Handling", () => {
    it("should handle table validation errors", async () => {
      mockedValidateTableName.mockImplementation(() => {
        throw new Error("Invalid table name");
      });

      const result = await tool.execute({ tableName: "invalid-table" });
      const parsed = JSON.parse(result);

      expect(parsed.success).toBe(false);
      expect(parsed.error).toBe("Invalid table name");
      expect(parsed.tableName).toBe("invalid-table");
      expect(parsed.queriedAt).toBeDefined();
    });

    it("should handle schema validation errors", async () => {
      mockedValidateSchemaName.mockImplementation(() => {
        throw new Error("Invalid schema name");
      });

      const result = await tool.execute({
        tableName: "test_table",
        schemaName: "invalid-schema",
      });
      const parsed = JSON.parse(result);

      expect(parsed.success).toBe(false);
      expect(parsed.error).toBe("Invalid schema name");
      expect(parsed.tableName).toBe("test_table");
      expect(parsed.schemaName).toBe("invalid-schema");
    });

    it("should handle database connection errors", async () => {
      mockServiceInstance.getTableStructure.mockRejectedValue(
        new Error("Connection failed")
      );

      const result = await tool.execute({ tableName: "test_table" });
      const parsed = JSON.parse(result);

      expect(parsed.success).toBe(false);
      expect(parsed.error).toBe("Connection failed");
      expect(mockServiceInstance.disconnect).toHaveBeenCalled();
    });

    it("should handle table not found errors", async () => {
      mockServiceInstance.getTableStructure.mockRejectedValue(
        new Error('Table "unknown_table" does not exist')
      );

      const result = await tool.execute({ tableName: "unknown_table" });
      const parsed = JSON.parse(result);

      expect(parsed.success).toBe(false);
      expect(parsed.error).toBe('Table "unknown_table" does not exist');
      expect(parsed.tableName).toBe("unknown_table");
    });

    it("should handle service cleanup errors gracefully", async () => {
      const mockTableStructure: TableStructure = {
        schemaName: "public",
        tableName: "test_table",
        columns: [],
        constraints: [],
        tableType: "TABLE",
        owner: "testuser",
      };

      mockServiceInstance.getTableStructure.mockResolvedValue(
        mockTableStructure
      );
      mockServiceInstance.disconnect.mockRejectedValue(
        new Error("Cleanup failed")
      );

      const warnSpy = jest.spyOn(logger, "warn").mockImplementation(() => {});

      const result = await tool.execute({ tableName: "test_table" });
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
    it("should handle empty table structure", async () => {
      const mockTableStructure: TableStructure = {
        schemaName: "public",
        tableName: "empty_table",
        columns: [],
        constraints: [],
        tableType: "TABLE",
        owner: "testuser",
      };

      mockServiceInstance.getTableStructure.mockResolvedValue(
        mockTableStructure
      );

      const result = await tool.execute({ tableName: "empty_table" });
      const parsed = JSON.parse(result);

      expect(parsed.success).toBe(true);
    });

    it("should handle non-Error objects in catch block", async () => {
      mockServiceInstance.getTableStructure.mockRejectedValue("String error");

      const result = await tool.execute({ tableName: "test_table" });
      const parsed = JSON.parse(result);

      expect(parsed.success).toBe(false);
      expect(parsed.error).toBe("String error");
    });

    it("should handle undefined schemaName in error response", async () => {
      mockServiceInstance.getTableStructure.mockRejectedValue(
        new Error("Service error")
      );

      const result = await tool.execute({ tableName: "test_table" });
      const parsed = JSON.parse(result);

      expect(parsed.success).toBe(false);
      expect(parsed.schemaName).toBeUndefined();
    });
  });
});
