import { TABLE_TYPES } from "../constants/index.js";

/**
 * Utility functions for table operations
 */

/**
 * Determine table type based on Vertica flags
 */
export function determineTableType(flags: {
  is_temp_table?: string | boolean;
  is_system_table?: string | boolean;
  is_flextable?: string | boolean;
}): string {
  const { is_temp_table, is_system_table, is_flextable } = flags;

  if (is_temp_table === "t" || is_temp_table === true) {
    return TABLE_TYPES.TEMPORARY_TABLE;
  }

  if (is_system_table === "t" || is_system_table === true) {
    return TABLE_TYPES.SYSTEM_TABLE;
  }

  if (is_flextable === "t" || is_flextable === true) {
    return TABLE_TYPES.FLEX_TABLE;
  }

  return TABLE_TYPES.TABLE;
}

/**
 * Format schema name with fallback to default
 */
export function resolveSchemaName(
  schemaName?: string,
  defaultSchema?: string
): string {
  return schemaName || defaultSchema || "public";
}

/**
 * Validate table name format
 */
export function validateTableName(tableName: string): void {
  if (!tableName || typeof tableName !== "string") {
    throw new Error("Table name must be a non-empty string");
  }

  if (tableName.trim() !== tableName) {
    throw new Error("Table name cannot have leading or trailing whitespace");
  }

  // Basic SQL identifier validation
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(tableName)) {
    throw new Error("Table name must be a valid SQL identifier");
  }
}

/**
 * Validate schema name format
 */
export function validateSchemaName(schemaName: string): void {
  if (!schemaName || typeof schemaName !== "string") {
    throw new Error("Schema name must be a non-empty string");
  }

  if (schemaName.trim() !== schemaName) {
    throw new Error("Schema name cannot have leading or trailing whitespace");
  }

  // Basic SQL identifier validation
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(schemaName)) {
    throw new Error("Schema name must be a valid SQL identifier");
  }
}
