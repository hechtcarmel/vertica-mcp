import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  jest,
} from "@jest/globals";
import { VerticaService } from "../../src/services/vertica-service.js";
import type { VerticaConfig } from "../../src/types/vertica.js";
import { logger } from "../../src/utils/logger";
import { LOG_MESSAGES } from "../../src/constants/index.js";

// Mock the vertica-nodejs module
const mockClient = {
  connect: jest.fn(),
  end: jest.fn(),
  query: jest.fn(),
};

jest.mock("vertica-nodejs", () => ({
  Client: jest.fn().mockImplementation(() => mockClient),
}));

describe("VerticaService", () => {
  let service: VerticaService;
  let config: VerticaConfig;

  beforeEach(() => {
    config = {
      host: "localhost",
      port: 5433,
      database: "testdb",
      user: "testuser",
      password: "testpass",
      defaultSchema: "public",
    };

    service = new VerticaService(config);
    jest.clearAllMocks();
  });

  describe("Constructor and Basic Properties", () => {
    it("should create service with provided config", () => {
      expect(service).toBeInstanceOf(VerticaService);
      expect(service.isConnected()).toBe(false);
    });

    it("should handle minimal config", () => {
      const minimalConfig: VerticaConfig = {
        host: "localhost",
        port: 5433,
        database: "testdb",
        user: "testuser",
      };

      const minimalService = new VerticaService(minimalConfig);
      expect(minimalService).toBeInstanceOf(VerticaService);
      expect(minimalService.isConnected()).toBe(false);
    });
  });

  describe("Connection Management", () => {
    beforeEach(() => {
      mockClient.connect.mockResolvedValue(undefined);
      mockClient.end.mockResolvedValue(undefined);
    });

    it("should establish connection successfully", async () => {
      await service.connect();

      const { Client } = jest.requireMock("vertica-nodejs");
      expect(Client).toHaveBeenCalledWith(
        expect.objectContaining({
          host: "localhost",
          port: 5433,
          database: "testdb",
          user: "testuser",
          password: "testpass",
        })
      );
      expect(mockClient.connect).toHaveBeenCalled();
      expect(service.isConnected()).toBe(true);
    });

    it("should disconnect successfully", async () => {
      await service.connect();
      await service.disconnect();

      expect(mockClient.end).toHaveBeenCalled();
      expect(service.isConnected()).toBe(false);
    });

    it("should handle connection failures", async () => {
      const connectionError = new Error("Connection refused");
      mockClient.connect.mockRejectedValue(connectionError);

      await expect(service.connect()).rejects.toThrow(
        "Failed to connect to Vertica"
      );
      expect(service.isConnected()).toBe(false);
    });

    it("should handle disconnect when not connected", async () => {
      await service.disconnect();

      expect(mockClient.end).not.toHaveBeenCalled();
      expect(service.isConnected()).toBe(false);
    });

    it("should not reconnect if already connected", async () => {
      await service.connect();
      const firstCallCount = mockClient.connect.mock.calls.length;

      await service.connect();

      expect(mockClient.connect.mock.calls.length).toBe(firstCallCount);
    });

    it("should handle SSL configuration", async () => {
      config.ssl = true;
      const sslService = new VerticaService(config);

      await sslService.connect();

      const { Client } = jest.requireMock("vertica-nodejs");
      expect(Client).toHaveBeenCalledWith(
        expect.objectContaining({
          ssl: true,
        })
      );
    });
  });

  describe("Query Validation", () => {
    beforeEach(() => {
      mockClient.query.mockResolvedValue({
        rows: [],
        rowCount: 0,
        fields: [],
        command: "SELECT",
      });
    });

    it("should allow readonly queries", async () => {
      await expect(service.executeQuery("SELECT 1")).resolves.not.toThrow();
      await expect(service.executeQuery("SHOW TABLES")).resolves.not.toThrow();
      await expect(
        service.executeQuery("DESCRIBE table")
      ).resolves.not.toThrow();
      await expect(
        service.executeQuery("EXPLAIN SELECT * FROM table")
      ).resolves.not.toThrow();
      await expect(
        service.executeQuery("WITH cte AS (SELECT 1) SELECT * FROM cte")
      ).resolves.not.toThrow();
    });

    it("should reject write queries", async () => {
      await expect(
        service.executeQuery("INSERT INTO table VALUES (1)")
      ).rejects.toThrow("Only readonly queries are allowed");
      await expect(
        service.executeQuery("UPDATE table SET col = 1")
      ).rejects.toThrow("Only readonly queries are allowed");
      await expect(service.executeQuery("DELETE FROM table")).rejects.toThrow(
        "Only readonly queries are allowed"
      );
      await expect(service.executeQuery("DROP TABLE table")).rejects.toThrow(
        "Only readonly queries are allowed"
      );
    });

    it("should handle case insensitive validation", async () => {
      await expect(service.executeQuery("select 1")).resolves.not.toThrow();
      await expect(service.executeQuery("SeLeCt 1")).resolves.not.toThrow();
    });

    it("should handle queries with whitespace", async () => {
      await expect(service.executeQuery("   SELECT 1")).resolves.not.toThrow();
      await expect(service.executeQuery("SELECT 1   ")).resolves.not.toThrow();
    });
  });

  describe("Readonly Mode Configuration", () => {
    beforeEach(() => {
      mockClient.query.mockResolvedValue({
        rows: [],
        rowCount: 0,
        fields: [],
        command: "SELECT",
      });
    });

    it("should allow all queries when readonly mode is disabled", async () => {
      const configWithReadonlyDisabled = { ...config, readonlyMode: false };
      const serviceWithReadonlyDisabled = new VerticaService(
        configWithReadonlyDisabled
      );

      await expect(
        serviceWithReadonlyDisabled.executeQuery("SELECT 1")
      ).resolves.not.toThrow();
      await expect(
        serviceWithReadonlyDisabled.executeQuery("INSERT INTO table VALUES (1)")
      ).resolves.not.toThrow();
      await expect(
        serviceWithReadonlyDisabled.executeQuery("UPDATE table SET col = 1")
      ).resolves.not.toThrow();
      await expect(
        serviceWithReadonlyDisabled.executeQuery("DELETE FROM table")
      ).resolves.not.toThrow();
      await expect(
        serviceWithReadonlyDisabled.executeQuery("DROP TABLE table")
      ).resolves.not.toThrow();
    });

    it("should enforce readonly queries when readonly mode is enabled", async () => {
      const configWithReadonlyEnabled = { ...config, readonlyMode: true };
      const serviceWithReadonlyEnabled = new VerticaService(
        configWithReadonlyEnabled
      );

      await expect(
        serviceWithReadonlyEnabled.executeQuery("SELECT 1")
      ).resolves.not.toThrow();
      await expect(
        serviceWithReadonlyEnabled.executeQuery("INSERT INTO table VALUES (1)")
      ).rejects.toThrow(
        "Only readonly queries are allowed (readonly mode is enabled)"
      );
    });

    it("should default to readonly mode when not specified", async () => {
      const configWithoutReadonlyMode = { ...config };
      delete configWithoutReadonlyMode.readonlyMode;
      const serviceWithDefaultMode = new VerticaService(
        configWithoutReadonlyMode
      );

      await expect(
        serviceWithDefaultMode.executeQuery("SELECT 1")
      ).resolves.not.toThrow();
      await expect(
        serviceWithDefaultMode.executeQuery("INSERT INTO table VALUES (1)")
      ).rejects.toThrow(
        "Only readonly queries are allowed (readonly mode is enabled)"
      );
    });

    it("should include helpful error message when readonly mode is enabled", async () => {
      const configWithReadonlyEnabled = { ...config, readonlyMode: true };
      const serviceWithReadonlyEnabled = new VerticaService(
        configWithReadonlyEnabled
      );

      await expect(
        serviceWithReadonlyEnabled.executeQuery("INSERT INTO table VALUES (1)")
      ).rejects.toThrow(
        "To allow all queries, set VERTICA_READONLY_MODE=false"
      );
    });

    it("should apply readonly mode to stream queries as well", async () => {
      const configWithReadonlyDisabled = { ...config, readonlyMode: false };
      const serviceWithReadonlyDisabled = new VerticaService(
        configWithReadonlyDisabled
      );

      mockClient.query.mockResolvedValue({
        rows: [],
        rowCount: 0,
        fields: [],
        command: "INSERT",
      });

      const streamOptions = { batchSize: 100 };
      const generator = serviceWithReadonlyDisabled.streamQuery(
        "INSERT INTO table VALUES (1)",
        streamOptions
      );

      // Should not throw an error for non-readonly query when readonly mode is disabled
      await expect(generator.next()).resolves.not.toThrow();
    });
  });

  describe("Query Execution", () => {
    beforeEach(() => {
      mockClient.connect.mockResolvedValue(undefined);
    });

    it("should execute queries successfully", async () => {
      const expectedResult = {
        rows: [{ id: 1, name: "test" }],
        rowCount: 1,
        fields: [
          { name: "id", format: "int8" },
          { name: "name", format: "varchar" },
        ],
        command: "SELECT",
      };
      mockClient.query.mockResolvedValue(expectedResult);

      const result = await service.executeQuery("SELECT id, name FROM users");

      expect(result).toEqual(expectedResult);
      expect(mockClient.query).toHaveBeenCalledWith(
        "SELECT id, name FROM users",
        undefined
      );
    });

    it("should execute queries with parameters", async () => {
      const expectedResult = {
        rows: [{ id: 1, name: "John" }],
        rowCount: 1,
        fields: [{ name: "id", format: "int8" }],
        command: "SELECT",
      };
      mockClient.query.mockResolvedValue(expectedResult);

      const result = await service.executeQuery(
        "SELECT * FROM users WHERE id = ?",
        [1]
      );

      expect(result).toEqual(expectedResult);
      expect(mockClient.query).toHaveBeenCalledWith(
        "SELECT * FROM users WHERE id = ?",
        [1]
      );
    });

    it("should handle empty result sets", async () => {
      const expectedResult = {
        rows: [],
        rowCount: 0,
        fields: [{ name: "id", format: "int8" }],
        command: "SELECT",
      };
      mockClient.query.mockResolvedValue(expectedResult);

      const result = await service.executeQuery(
        "SELECT id FROM users WHERE id = -1"
      );

      expect(result).toEqual(expectedResult);
    });

    it("should auto-connect if not connected", async () => {
      mockClient.query.mockResolvedValue({
        rows: [],
        rowCount: 0,
        fields: [],
        command: "SELECT",
      });

      await service.executeQuery("SELECT 1");

      expect(mockClient.connect).toHaveBeenCalled();
    });

    it("should handle query execution errors", async () => {
      const queryError = new Error("Syntax error in SQL");
      mockClient.query.mockRejectedValue(queryError);

      await expect(
        service.executeQuery("SELECT * FROM nonexistent_table")
      ).rejects.toThrow("Query execution failed: Syntax error in SQL");
    });

    it("should handle connection errors during execution", async () => {
      const connectError = new Error("Connection failed");
      mockClient.connect.mockRejectedValue(connectError);

      await expect(service.executeQuery("SELECT 1")).rejects.toThrow(
        "Failed to connect to Vertica: Connection failed"
      );
    });

    it("should handle malformed query results gracefully", async () => {
      mockClient.query.mockResolvedValue({});

      const result = await service.executeQuery("SELECT 1");

      expect(result).toEqual({
        rows: [],
        rowCount: 0,
        fields: [],
        command: "",
      });
    });
  });

  describe("Metadata Operations", () => {
    beforeEach(() => {
      mockClient.connect.mockResolvedValue(undefined);
    });

    describe("getTableStructure()", () => {
      it("should get table structure successfully", async () => {
        const columnsResult = {
          rows: [
            {
              column_name: "id",
              data_type: "INTEGER",
              is_nullable: "NO",
              column_default: null,
              character_maximum_length: null,
              numeric_precision: null,
              numeric_scale: null,
              ordinal_position: 1,
            },
          ],
        };

        const tableResult = {
          rows: [
            {
              owner_name: "testuser",
              is_temp_table: false,
              is_system_table: false,
              is_flextable: false,
            },
          ],
        };

        mockClient.query
          .mockResolvedValueOnce(columnsResult)
          .mockResolvedValueOnce(tableResult);

        const result = await service.getTableStructure("users", "public");

        expect(result.schemaName).toBe("public");
        expect(result.tableName).toBe("users");
        expect(result.columns).toHaveLength(1);
        expect(result.columns[0]?.columnName).toBe("id");
        expect(result.tableType).toBe("TABLE");
        expect(result.owner).toBe("testuser");
      });

      it("should handle table not found", async () => {
        mockClient.query
          .mockResolvedValueOnce({ rows: [] })
          .mockResolvedValueOnce({ rows: [] });

        await expect(
          service.getTableStructure("nonexistent", "public")
        ).rejects.toThrow("Table public.nonexistent not found");
      });

      it("should use default schema when not provided", async () => {
        const columnsResult = { rows: [] };
        const tableResult = {
          rows: [
            {
              owner_name: "test",
              is_temp_table: false,
              is_system_table: false,
              is_flextable: false,
            },
          ],
        };

        mockClient.query
          .mockResolvedValueOnce(columnsResult)
          .mockResolvedValueOnce(tableResult);

        await service.getTableStructure("users");

        expect(mockClient.query).toHaveBeenCalledWith(expect.any(String), [
          "public",
          "users",
        ]);
      });
    });

    describe("listTables()", () => {
      it("should list tables successfully", async () => {
        const tablesResult = {
          rows: [
            {
              table_schema: "public",
              table_name: "users",
              owner_name: "testuser",
              is_temp_table: false,
              is_system_table: false,
              is_flextable: false,
            },
            {
              table_schema: "public",
              table_name: "products",
              owner_name: "testuser",
              is_temp_table: false,
              is_system_table: false,
              is_flextable: false,
            },
          ],
        };

        mockClient.query.mockResolvedValue(tablesResult);

        const result = await service.listTables("public");

        expect(result).toHaveLength(2);
        expect(result[0]?.schemaName).toBe("public");
        expect(result[0]?.tableName).toBe("users");
        expect(result[0]?.tableType).toBe("TABLE");
        expect(result[0]?.owner).toBe("testuser");
      });

      it("should handle empty table list", async () => {
        mockClient.query.mockResolvedValue({ rows: [] });

        const result = await service.listTables("public");

        expect(result).toHaveLength(0);
      });
    });

    describe("listViews()", () => {
      it("should list views successfully", async () => {
        const viewsResult = {
          rows: [
            {
              table_schema: "public",
              view_name: "user_summary",
              view_definition: "SELECT id, name FROM users",
              owner_name: "testuser",
            },
          ],
        };

        mockClient.query.mockResolvedValue(viewsResult);

        const result = await service.listViews("public");

        expect(result).toHaveLength(1);
        expect(result[0]?.schemaName).toBe("public");
        expect(result[0]?.viewName).toBe("user_summary");
        expect(result[0]?.definition).toBe("SELECT id, name FROM users");
        expect(result[0]?.owner).toBe("testuser");
      });
    });

    describe("listIndexes()", () => {
      it("should list indexes/projections successfully", async () => {
        const indexesResult = {
          rows: [
            {
              index_name: "users_proj",
              table_name: "users",
              column_name: "id",
              is_key_constraint_projection: true,
              sort_position: 1,
            },
          ],
        };

        mockClient.query.mockResolvedValue(indexesResult);

        const result = await service.listIndexes("users", "public");

        expect(result).toHaveLength(1);
        expect(result[0]?.indexName).toBe("users_proj");
        expect(result[0]?.tableName).toBe("users");
        expect(result[0]?.columnName).toBe("id");
        expect(result[0]?.isUnique).toBe(true);
        expect(result[0]?.indexType).toBe("projection");
        expect(result[0]?.ordinalPosition).toBe(1);
      });
    });
  });

  describe("Test Connection", () => {
    it("should return true for successful connection test", async () => {
      mockClient.connect.mockResolvedValue(undefined);
      mockClient.query.mockResolvedValue({
        rows: [{ test: 1 }],
      });

      const result = await service.testConnection();

      expect(result).toBe(true);
      expect(mockClient.query).toHaveBeenCalledWith(
        "SELECT 1 as test",
        undefined
      );
    });

    it("should return false for failed connection", async () => {
      mockClient.connect.mockRejectedValue(new Error("Connection failed"));

      const result = await service.testConnection();

      expect(result).toBe(false);
    });

    it("should return false for failed test query", async () => {
      mockClient.connect.mockResolvedValue(undefined);
      mockClient.query.mockResolvedValue({
        rows: [],
      });

      const result = await service.testConnection();

      expect(result).toBe(false);
    });

    it("should return false for incorrect test result", async () => {
      mockClient.connect.mockResolvedValue(undefined);
      mockClient.query.mockResolvedValue({
        rows: [{ test: 0 }],
      });

      const result = await service.testConnection();

      expect(result).toBe(false);
    });
  });

  describe("Error Handling and Edge Cases", () => {
    it("should handle undefined query results", async () => {
      mockClient.query.mockResolvedValue({});

      const result = await service.executeQuery("SELECT 1");

      expect(result.rows).toEqual([]);
      expect(result.rowCount).toBe(0);
      expect(result.fields).toEqual([]);
      expect(result.command).toBe("");
    });

    it("should handle disconnect errors gracefully", async () => {
      await service.connect();
      const disconnectError = new Error("Disconnect failed");
      mockClient.end.mockRejectedValue(disconnectError);

      const warnSpy = jest.spyOn(logger, "warn").mockImplementation(() => {});

      await service.disconnect();

      expect(service.isConnected()).toBe(false);
      expect(warnSpy).toHaveBeenCalledWith(
        LOG_MESSAGES.DB_CONNECTION_WARNING,
        expect.any(Error)
      );
      warnSpy.mockRestore();
    });

    it("should handle non-Error objects in error scenarios", async () => {
      mockClient.query.mockRejectedValue("String error");

      await expect(service.executeQuery("SELECT 1")).rejects.toThrow(
        "Query execution failed: String error"
      );
    });

    it("should handle connection timeout configuration", async () => {
      config.queryTimeout = 45000;
      const timeoutService = new VerticaService(config);

      await timeoutService.connect();

      const { Client } = jest.requireMock("vertica-nodejs");
      expect(Client).toHaveBeenCalledWith(
        expect.objectContaining({
          connectionTimeoutMillis: 45000,
        })
      );
    });
  });
});
