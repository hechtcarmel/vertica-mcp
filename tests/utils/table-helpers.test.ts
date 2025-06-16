import { describe, it, expect } from "@jest/globals";
import {
  determineTableType,
  resolveSchemaName,
  validateTableName,
  validateSchemaName,
} from "../../src/utils/table-helpers.js";

describe("table-helpers", () => {
  describe("determineTableType", () => {
    it("should return TEMPORARY TABLE for temp table flag", () => {
      expect(determineTableType({ is_temp_table: "t" })).toBe(
        "TEMPORARY TABLE"
      );
      expect(determineTableType({ is_temp_table: true })).toBe(
        "TEMPORARY TABLE"
      );
    });

    it("should return SYSTEM TABLE for system table flag", () => {
      expect(determineTableType({ is_system_table: "t" })).toBe("SYSTEM TABLE");
      expect(determineTableType({ is_system_table: true })).toBe(
        "SYSTEM TABLE"
      );
    });

    it("should return FLEX TABLE for flex table flag", () => {
      expect(determineTableType({ is_flextable: "t" })).toBe("FLEX TABLE");
      expect(determineTableType({ is_flextable: true })).toBe("FLEX TABLE");
    });

    it("should return TABLE for regular table", () => {
      expect(determineTableType({})).toBe("TABLE");
      expect(determineTableType({ is_temp_table: "f" })).toBe("TABLE");
      expect(determineTableType({ is_temp_table: false })).toBe("TABLE");
    });

    it("should prioritize temp table over other flags", () => {
      expect(
        determineTableType({
          is_temp_table: "t",
          is_system_table: "t",
          is_flextable: "t",
        })
      ).toBe("TEMPORARY TABLE");
    });

    it("should prioritize system table over flex table", () => {
      expect(
        determineTableType({
          is_system_table: "t",
          is_flextable: "t",
        })
      ).toBe("SYSTEM TABLE");
    });
  });

  describe("resolveSchemaName", () => {
    it("should return provided schema name", () => {
      expect(resolveSchemaName("custom_schema")).toBe("custom_schema");
    });

    it("should return default schema when no schema provided", () => {
      expect(resolveSchemaName(undefined, "default")).toBe("default");
    });

    it("should return public when no schema or default provided", () => {
      expect(resolveSchemaName()).toBe("public");
    });

    it("should prefer provided schema over default", () => {
      expect(resolveSchemaName("custom", "default")).toBe("custom");
    });

    it("should handle empty string schema", () => {
      expect(resolveSchemaName("", "default")).toBe("default");
    });
  });

  describe("validateTableName", () => {
    it("should accept valid table names", () => {
      expect(() => validateTableName("users")).not.toThrow();
      expect(() => validateTableName("user_data")).not.toThrow();
      expect(() => validateTableName("UserTable")).not.toThrow();
      expect(() => validateTableName("_private")).not.toThrow();
      expect(() => validateTableName("table123")).not.toThrow();
    });

    it("should reject empty or non-string names", () => {
      expect(() => validateTableName("")).toThrow(
        "Table name must be a non-empty string"
      );
      expect(() => validateTableName(null as any)).toThrow(
        "Table name must be a non-empty string"
      );
      expect(() => validateTableName(123 as any)).toThrow(
        "Table name must be a non-empty string"
      );
    });

    it("should reject names with whitespace", () => {
      expect(() => validateTableName(" users")).toThrow(
        "Table name cannot have leading or trailing whitespace"
      );
      expect(() => validateTableName("users ")).toThrow(
        "Table name cannot have leading or trailing whitespace"
      );
      expect(() => validateTableName(" users ")).toThrow(
        "Table name cannot have leading or trailing whitespace"
      );
    });

    it("should reject invalid SQL identifiers", () => {
      expect(() => validateTableName("123table")).toThrow(
        "Table name must be a valid SQL identifier"
      );
      expect(() => validateTableName("user-table")).toThrow(
        "Table name must be a valid SQL identifier"
      );
      expect(() => validateTableName("user.table")).toThrow(
        "Table name must be a valid SQL identifier"
      );
      expect(() => validateTableName("user@table")).toThrow(
        "Table name must be a valid SQL identifier"
      );
      expect(() => validateTableName("user table")).toThrow(
        "Table name must be a valid SQL identifier"
      );
    });
  });

  describe("validateSchemaName", () => {
    it("should accept valid schema names", () => {
      expect(() => validateSchemaName("public")).not.toThrow();
      expect(() => validateSchemaName("my_schema")).not.toThrow();
      expect(() => validateSchemaName("Schema1")).not.toThrow();
      expect(() => validateSchemaName("_system")).not.toThrow();
    });

    it("should reject empty or non-string names", () => {
      expect(() => validateSchemaName("")).toThrow(
        "Schema name must be a non-empty string"
      );
      expect(() => validateSchemaName(null as any)).toThrow(
        "Schema name must be a non-empty string"
      );
      expect(() => validateSchemaName(undefined as any)).toThrow(
        "Schema name must be a non-empty string"
      );
    });

    it("should reject names with whitespace", () => {
      expect(() => validateSchemaName(" public")).toThrow(
        "Schema name cannot have leading or trailing whitespace"
      );
      expect(() => validateSchemaName("public ")).toThrow(
        "Schema name cannot have leading or trailing whitespace"
      );
    });

    it("should reject invalid SQL identifiers", () => {
      expect(() => validateSchemaName("123schema")).toThrow(
        "Schema name must be a valid SQL identifier"
      );
      expect(() => validateSchemaName("my-schema")).toThrow(
        "Schema name must be a valid SQL identifier"
      );
      expect(() => validateSchemaName("my.schema")).toThrow(
        "Schema name must be a valid SQL identifier"
      );
      expect(() => validateSchemaName("my schema")).toThrow(
        "Schema name must be a valid SQL identifier"
      );
    });
  });
});
