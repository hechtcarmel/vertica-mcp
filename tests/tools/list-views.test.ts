import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  jest,
} from "@jest/globals";
import ListViewsTool from "../../src/tools/list-views.js";
import { VerticaService } from "../../src/services/vertica-service.js";
import { getDatabaseConfig } from "../../src/config/database.js";
import type { ViewInfo } from "../../src/types/vertica.js";

// Mock modules
jest.mock("../../src/services/vertica-service.js");
jest.mock("../../src/config/database.js");

const mockedVerticaService = VerticaService as jest.MockedClass<
  typeof VerticaService
>;
const mockedGetDatabaseConfig = getDatabaseConfig as jest.MockedFunction<
  typeof getDatabaseConfig
>;

describe("ListViewsTool", () => {
  let tool: ListViewsTool;
  let mockServiceInstance: jest.Mocked<VerticaService>;

  beforeEach(() => {
    tool = new ListViewsTool();
    mockServiceInstance = {
      listViews: jest.fn(),
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
      expect(tool.name).toBe("list_views");
    });

    it("should have appropriate description", () => {
      expect(tool.description).toBe(
        "List all views in a schema with their definitions and metadata"
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
      const mockViews: ViewInfo[] = [];
      mockServiceInstance.listViews.mockResolvedValue(mockViews);

      const result = await tool.execute({});
      const parsed = JSON.parse(result);

      expect(parsed.success).toBe(true);
      expect(mockServiceInstance.listViews).toHaveBeenCalledWith(undefined);
    });

    it("should accept valid input with schemaName", async () => {
      const mockViews: ViewInfo[] = [];
      mockServiceInstance.listViews.mockResolvedValue(mockViews);

      const result = await tool.execute({ schemaName: "custom_schema" });
      const parsed = JSON.parse(result);

      expect(parsed.success).toBe(true);
      expect(mockServiceInstance.listViews).toHaveBeenCalledWith(
        "custom_schema"
      );
    });

    it("should reject invalid input types", async () => {
      await expect(tool.execute({ schemaName: 123 })).rejects.toThrow();
    });
  });

  describe("Successful Execution", () => {
    it("should return empty list when no views exist", async () => {
      const mockViews: ViewInfo[] = [];
      mockServiceInstance.listViews.mockResolvedValue(mockViews);

      const result = await tool.execute({});
      const parsed = JSON.parse(result);

      expect(parsed.success).toBe(true);
      expect(parsed.schema).toBe("public");
      expect(parsed.viewCount).toBe(0);
      expect(parsed.views).toEqual([]);
      expect(parsed.queriedAt).toBeDefined();
      expect(mockServiceInstance.disconnect).toHaveBeenCalled();
    });

    it("should return list of views successfully", async () => {
      const mockViews: ViewInfo[] = [
        {
          schemaName: "public",
          viewName: "user_summary",
          definition: "SELECT id, name, email FROM users WHERE active = true",
          owner: "testuser",
          comment: "Active users view",
        },
        {
          schemaName: "public",
          viewName: "product_catalog",
          definition:
            "SELECT p.id, p.name, p.price, c.name as category FROM products p JOIN categories c ON p.category_id = c.id",
          owner: "testuser",
        },
      ];

      mockServiceInstance.listViews.mockResolvedValue(mockViews);

      const result = await tool.execute({});
      const parsed = JSON.parse(result);

      expect(parsed.success).toBe(true);
      expect(parsed.schema).toBe("public");
      expect(parsed.viewCount).toBe(2);
      expect(parsed.views).toHaveLength(2);
      expect(parsed.views[0]).toEqual({
        schemaName: "public",
        viewName: "user_summary",
        owner: "testuser",
        comment: "Active users view",
        definition: "SELECT id, name, email FROM users WHERE active = true",
      });
      expect(parsed.views[1]).toEqual({
        schemaName: "public",
        viewName: "product_catalog",
        owner: "testuser",
        comment: undefined,
        definition:
          "SELECT p.id, p.name, p.price, c.name as category FROM products p JOIN categories c ON p.category_id = c.id",
      });
    });

    it("should truncate long view definitions", async () => {
      const longDefinition =
        "SELECT " +
        "column, ".repeat(100) +
        "id FROM very_complex_table WHERE condition = true AND another_condition = false";

      const mockViews: ViewInfo[] = [
        {
          schemaName: "public",
          viewName: "complex_view",
          definition: longDefinition,
          owner: "testuser",
        },
      ];

      mockServiceInstance.listViews.mockResolvedValue(mockViews);

      const result = await tool.execute({});
      const parsed = JSON.parse(result);

      expect(parsed.success).toBe(true);
      expect(parsed.views[0].definition).toHaveLength(203); // 200 chars + "..."
      expect(parsed.views[0].definition).toMatch(/\.\.\.$/);
    });

    it("should not truncate short view definitions", async () => {
      const shortDefinition = "SELECT id, name FROM users";

      const mockViews: ViewInfo[] = [
        {
          schemaName: "public",
          viewName: "simple_view",
          definition: shortDefinition,
          owner: "testuser",
        },
      ];

      mockServiceInstance.listViews.mockResolvedValue(mockViews);

      const result = await tool.execute({});
      const parsed = JSON.parse(result);

      expect(parsed.success).toBe(true);
      expect(parsed.views[0].definition).toBe(shortDefinition);
    });

    it("should use specified schema name", async () => {
      const mockViews: ViewInfo[] = [
        {
          schemaName: "custom_schema",
          viewName: "special_view",
          definition: "SELECT * FROM special_table",
          owner: "admin",
        },
      ];

      mockServiceInstance.listViews.mockResolvedValue(mockViews);

      const result = await tool.execute({ schemaName: "custom_schema" });
      const parsed = JSON.parse(result);

      expect(parsed.success).toBe(true);
      expect(parsed.schema).toBe("custom_schema");
      expect(parsed.viewCount).toBe(1);
      expect(mockServiceInstance.listViews).toHaveBeenCalledWith(
        "custom_schema"
      );
    });

    it("should use default schema when none specified", async () => {
      const mockViews: ViewInfo[] = [];
      mockServiceInstance.listViews.mockResolvedValue(mockViews);

      const result = await tool.execute({});
      const parsed = JSON.parse(result);

      expect(parsed.success).toBe(true);
      expect(parsed.schema).toBe("public");
      expect(mockServiceInstance.listViews).toHaveBeenCalledWith(undefined);
    });

    it("should handle config without default schema", async () => {
      mockedGetDatabaseConfig.mockReturnValue({
        host: "localhost",
        port: 5433,
        database: "testdb",
        user: "testuser",
      } as any);

      const mockViews: ViewInfo[] = [];
      mockServiceInstance.listViews.mockResolvedValue(mockViews);

      const result = await tool.execute({});
      const parsed = JSON.parse(result);

      expect(parsed.success).toBe(true);
      expect(parsed.schema).toBe("public");
    });
  });

  describe("Error Handling", () => {
    it("should handle database connection errors", async () => {
      mockServiceInstance.listViews.mockRejectedValue(
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
      mockServiceInstance.listViews.mockRejectedValue(
        new Error('Schema "unknown_schema" does not exist')
      );

      const result = await tool.execute({ schemaName: "unknown_schema" });
      const parsed = JSON.parse(result);

      expect(parsed.success).toBe(false);
      expect(parsed.error).toBe('Schema "unknown_schema" does not exist');
      expect(parsed.schemaName).toBe("unknown_schema");
    });

    it("should handle permission errors", async () => {
      mockServiceInstance.listViews.mockRejectedValue(
        new Error('Permission denied for schema "restricted"')
      );

      const result = await tool.execute({ schemaName: "restricted" });
      const parsed = JSON.parse(result);

      expect(parsed.success).toBe(false);
      expect(parsed.error).toBe('Permission denied for schema "restricted"');
    });

    it("should handle service cleanup errors gracefully", async () => {
      const mockViews: ViewInfo[] = [];
      mockServiceInstance.listViews.mockResolvedValue(mockViews);
      mockServiceInstance.disconnect.mockRejectedValue(
        new Error("Cleanup failed")
      );

      const consoleSpy = jest.spyOn(console, "warn").mockImplementation();

      const result = await tool.execute({});
      const parsed = JSON.parse(result);

      expect(parsed.success).toBe(true);
      expect(consoleSpy).toHaveBeenCalledWith(
        "Warning during service cleanup:",
        expect.any(Error)
      );
      consoleSpy.mockRestore();
    });
  });

  describe("Edge Cases", () => {
    it("should handle large number of views", async () => {
      const mockViews: ViewInfo[] = Array.from({ length: 50 }, (_, i) => ({
        schemaName: "public",
        viewName: `view_${i}`,
        definition: `SELECT * FROM table_${i}`,
        owner: "testuser",
      }));

      mockServiceInstance.listViews.mockResolvedValue(mockViews);

      const result = await tool.execute({});
      const parsed = JSON.parse(result);

      expect(parsed.success).toBe(true);
      expect(parsed.viewCount).toBe(50);
      expect(parsed.views).toHaveLength(50);
    });

    it("should handle non-Error objects in catch block", async () => {
      mockServiceInstance.listViews.mockRejectedValue("String error");

      const result = await tool.execute({});
      const parsed = JSON.parse(result);

      expect(parsed.success).toBe(false);
      expect(parsed.error).toBe("String error");
    });

    it("should handle views with missing optional fields", async () => {
      const mockViews: ViewInfo[] = [
        {
          schemaName: "public",
          viewName: "minimal_view",
          definition: "SELECT id FROM table",
          owner: "testuser",
        },
      ];

      mockServiceInstance.listViews.mockResolvedValue(mockViews);

      const result = await tool.execute({});
      const parsed = JSON.parse(result);

      expect(parsed.success).toBe(true);
      expect(parsed.views[0]).toEqual({
        schemaName: "public",
        viewName: "minimal_view",
        owner: "testuser",
        comment: undefined,
        definition: "SELECT id FROM table",
      });
    });

    it("should handle view definition exactly at 200 characters", async () => {
      const exactDefinition = "A".repeat(200);

      const mockViews: ViewInfo[] = [
        {
          schemaName: "public",
          viewName: "exact_view",
          definition: exactDefinition,
          owner: "testuser",
        },
      ];

      mockServiceInstance.listViews.mockResolvedValue(mockViews);

      const result = await tool.execute({});
      const parsed = JSON.parse(result);

      expect(parsed.success).toBe(true);
      expect(parsed.views[0].definition).toBe(exactDefinition);
      expect(parsed.views[0].definition).not.toMatch(/\.\.\.$/);
    });
  });
});
