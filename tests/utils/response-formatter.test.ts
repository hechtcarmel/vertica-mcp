import { describe, it, expect } from "vitest";
import {
  formatQueryField,
  safeJsonStringify,
  createSuccessResponse,
  createErrorResponse,
  formatQueryResult,
  formatTableStructure,
} from "../../src/utils/response-formatter.js";
import type { BaseError } from "../../src/types/errors.js";

describe("response-formatter", () => {
  describe("createSuccessResponse", () => {
    it("should create a success response with data", () => {
      const testData = { id: 1, name: "test" };
      const response = createSuccessResponse(testData);
      const parsed = JSON.parse(response);

      expect(parsed.success).toBe(true);
      expect(parsed.data).toEqual(testData);
      expect(parsed.executedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
      expect(parsed.error).toBeUndefined();
    });

    it("should handle null data", () => {
      const response = createSuccessResponse(null);
      const parsed = JSON.parse(response);

      expect(parsed.success).toBe(true);
      expect(parsed.data).toBeNull();
    });

    it("should handle array data", () => {
      const testData = [1, 2, 3];
      const response = createSuccessResponse(testData);
      const parsed = JSON.parse(response);

      expect(parsed.success).toBe(true);
      expect(parsed.data).toEqual(testData);
    });
  });

  describe("createErrorResponse", () => {
    it("should create error response from string", () => {
      const errorMessage = "Something went wrong";
      const response = createErrorResponse(errorMessage);
      const parsed = JSON.parse(response);

      expect(parsed.success).toBe(false);
      expect(parsed.error.message).toBe(errorMessage);
      expect(parsed.executedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
      expect(parsed.data).toBeUndefined();
    });

    it("should create error response from Error object", () => {
      const error = new Error("Test error");
      const response = createErrorResponse(error);
      const parsed = JSON.parse(response);

      expect(parsed.success).toBe(false);
      expect(parsed.error.message).toBe("Test error");
    });

    it("should create error response from BaseError object", () => {
      const baseError: BaseError = {
        message: "Base error",
        code: "TEST_ERROR",
        details: { context: "test" },
      };
      const response = createErrorResponse(baseError);
      const parsed = JSON.parse(response);

      expect(parsed.success).toBe(false);
      expect(parsed.error).toEqual(baseError);
    });
  });

  describe("formatQueryResult", () => {
    it("should format query result with all fields", () => {
      const queryResult = {
        rows: [
          { id: 1, name: "Alice" },
          { id: 2, name: "Bob" },
        ],
        rowCount: 2,
        fields: [
          { name: "id", format: "int" },
          { name: "name", format: "varchar" },
        ],
        query: "SELECT * FROM users",
      };

      const formatted = formatQueryResult(queryResult);

      expect(formatted).toEqual({
        query: "SELECT * FROM users",
        rowCount: 2,
        fields: [
          { name: "id", dataType: "int" },
          { name: "name", dataType: "varchar" },
        ],
        rows: [
          { id: 1, name: "Alice" },
          { id: 2, name: "Bob" },
        ],
      });
    });

    it("should handle empty result set", () => {
      const queryResult = {
        rows: [],
        rowCount: 0,
        fields: [],
      };

      const formatted = formatQueryResult(queryResult);

      expect(formatted.rowCount).toBe(0);
      expect(formatted.rows).toEqual([]);
      expect(formatted.fields).toEqual([]);
      expect(formatted.query).toBeUndefined();
    });

    it("should handle result without query", () => {
      const queryResult = {
        rows: [{ count: 5 }],
        rowCount: 1,
        fields: [{ name: "count", format: "bigint" }],
      };

      const formatted = formatQueryResult(queryResult);

      expect(formatted.query).toBeUndefined();
      expect(formatted.rowCount).toBe(1);
    });
  });

  describe("formatTableStructure", () => {
    it("should format complete table structure", () => {
      const structure = {
        schemaName: "public",
        tableName: "users",
        tableType: "TABLE",
        owner: "admin",
        comment: "User table",
        columns: [
          {
            columnName: "id",
            dataType: "int",
            isNullable: false,
            defaultValue: undefined,
            columnSize: 4,
            decimalDigits: 0,
            ordinalPosition: 1,
            comment: "Primary key",
          },
          {
            columnName: "name",
            dataType: "varchar",
            isNullable: true,
            defaultValue: "'unnamed'",
            columnSize: 255,
            decimalDigits: undefined,
            ordinalPosition: 2,
          },
        ],
        constraints: [
          {
            constraintName: "users_pk",
            constraintType: "PRIMARY KEY",
            columnName: "id",
          },
          {
            constraintName: "users_fk",
            constraintType: "FOREIGN KEY",
            columnName: "department_id",
            referencedTable: "departments",
            referencedColumn: "id",
          },
        ],
      };

      const formatted = formatTableStructure(structure);

      expect(formatted.table).toEqual({
        schemaName: "public",
        tableName: "users",
        tableType: "TABLE",
        owner: "admin",
        comment: "User table",
      });

      expect(formatted.columns).toEqual([
        {
          name: "id",
          dataType: "int",
          nullable: false,
          defaultValue: undefined,
          size: 4,
          decimalDigits: 0,
          position: 1,
          comment: "Primary key",
        },
        {
          name: "name",
          dataType: "varchar",
          nullable: true,
          defaultValue: "'unnamed'",
          size: 255,
          decimalDigits: undefined,
          position: 2,
          comment: undefined,
        },
      ]);

      expect(formatted.constraints).toEqual([
        {
          name: "users_pk",
          type: "PRIMARY KEY",
          column: "id",
          referencedTable: undefined,
          referencedColumn: undefined,
        },
        {
          name: "users_fk",
          type: "FOREIGN KEY",
          column: "department_id",
          referencedTable: "departments",
          referencedColumn: "id",
        },
      ]);
    });

    it("should handle minimal table structure", () => {
      const structure = {
        schemaName: "test",
        tableName: "simple",
        tableType: "TABLE",
        owner: "user",
        columns: [],
        constraints: [],
      };

      const formatted = formatTableStructure(structure);

      expect(formatted.table.comment).toBeUndefined();
      expect(formatted.columns).toEqual([]);
      expect(formatted.constraints).toEqual([]);
    });
  });
});

describe("JSON wire types", () => {
  it("serializes bigint without precision loss, dates as ISO, and buffers as base64", () => {
    const data = {
      bigint: 9007199254740993n,
      date: new Date("2026-01-01T00:00:00Z"),
      bytes: Buffer.from("hello"),
    };
    expect(JSON.parse(safeJsonStringify(data))).toEqual({
      bigint: "9007199254740993",
      date: "2026-01-01T00:00:00.000Z",
      bytes: "aGVsbG8=",
    });
    expect(JSON.parse(createSuccessResponse(data)).data.bigint).toBe(
      "9007199254740993",
    );
  });
});

it("reports Vertica types rather than mistaking the wire format for a type", () => {
  expect(
    formatQueryField({ name: "id", dataTypeID: 6, format: "text" }),
  ).toEqual({ name: "id", dataType: "integer", dataTypeId: 6, format: "text" });
  expect(
    formatQueryField({ name: "custom", dataTypeID: 999, format: "text" })
      .dataType,
  ).toBe("unknown");
});
