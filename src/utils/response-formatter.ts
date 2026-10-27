import type { ApiResponse, BaseError } from "../types/errors.js";

/**
 * Utility functions for formatting API responses consistently
 */

/**
 * Custom JSON replacer that handles BigInt and other special types
 */
function jsonReplacer(
  this: Record<string, unknown>,
  key: string,
  value: unknown,
): unknown {
  const original = this[key];
  if (Buffer.isBuffer(original)) return original.toString("base64");
  if (typeof value === "bigint") {
    return value.toString();
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (Buffer.isBuffer(value)) {
    return value.toString("base64");
  }
  return value;
}

/**
 * Safe JSON stringify that handles BigInt, Date, Buffer, and other special types
 */
export function safeJsonStringify(data: unknown, space?: number): string {
  return JSON.stringify(data, jsonReplacer, space);
}

/**
 * Create a successful response
 */
export function createSuccessResponse<T>(data: T): string {
  const response: ApiResponse<T> = {
    success: true,
    data,
    executedAt: new Date().toISOString(),
  };

  return safeJsonStringify(response, 2);
}

/**
 * Create an error response
 */
export function createErrorResponse(error: BaseError | Error | string): string {
  let formattedError: BaseError;

  if (typeof error === "string") {
    formattedError = { message: error };
  } else if (error instanceof Error) {
    formattedError = { message: error.message };
  } else {
    formattedError = error;
  }

  const response: ApiResponse = {
    success: false,
    error: formattedError,
    executedAt: new Date().toISOString(),
  };

  return safeJsonStringify(response, 2);
}

// Vertica wire type IDs (v-protocol's VerticaType), not PostgreSQL OIDs.
const dataTypes: Record<number, string> = {
  5: "boolean",
  6: "integer",
  7: "float",
  8: "char",
  9: "varchar",
  10: "date",
  11: "time",
  12: "timestamp",
  13: "timestamptz",
  14: "interval",
  15: "timetz",
  16: "numeric",
  17: "varbinary",
  20: "uuid",
  114: "interval year to month",
  115: "long varchar",
  116: "long varbinary",
  117: "binary",
  300: "row",
  301: "array",
  302: "map",
};

export function formatQueryField(field: {
  name: string;
  format: string;
  dataTypeID?: number;
}) {
  return {
    name: field.name,
    dataType:
      field.dataTypeID === undefined
        ? field.format
        : (dataTypes[field.dataTypeID] ?? "unknown"),
    ...(field.dataTypeID === undefined
      ? {}
      : { dataTypeId: field.dataTypeID, format: field.format }),
  };
}

/**
 * Format query result for consistent output
 */
export function formatQueryResult(result: {
  rows: Record<string, unknown>[];
  rowCount: number;
  fields: { name: string; format: string; dataTypeID?: number }[];
  query?: string;
}) {
  return {
    query: result.query,
    rowCount: result.rowCount,
    fields: result.fields.map(formatQueryField),
    rows: result.rows,
  };
}

/**
 * Format table structure for consistent output
 */
export function formatTableStructure(structure: {
  schemaName: string;
  tableName: string;
  tableType: string;
  owner: string;
  comment?: string;
  columns: Array<{
    columnName: string;
    dataType: string;
    isNullable: boolean;
    defaultValue?: string;
    columnSize?: number;
    decimalDigits?: number;
    ordinalPosition: number;
    comment?: string;
  }>;
  constraints: Array<{
    constraintName: string;
    constraintType: string;
    columnName: string;
    referencedTable?: string;
    referencedColumn?: string;
  }>;
}) {
  return {
    table: {
      schemaName: structure.schemaName,
      tableName: structure.tableName,
      tableType: structure.tableType,
      owner: structure.owner,
      comment: structure.comment,
    },
    columns: structure.columns.map((col) => ({
      name: col.columnName,
      dataType: col.dataType,
      nullable: col.isNullable,
      defaultValue: col.defaultValue,
      size: col.columnSize,
      decimalDigits: col.decimalDigits,
      position: col.ordinalPosition,
      comment: col.comment,
    })),
    constraints: structure.constraints.map((constraint) => ({
      name: constraint.constraintName,
      type: constraint.constraintType,
      column: constraint.columnName,
      referencedTable: constraint.referencedTable,
      referencedColumn: constraint.referencedColumn,
    })),
  };
}
