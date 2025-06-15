import type { ApiResponse, BaseError } from "../types/errors.js";

/**
 * Utility functions for formatting API responses consistently
 */

/**
 * Create a successful response
 */
export function createSuccessResponse<T>(data: T): string {
  const response: ApiResponse<T> = {
    success: true,
    data,
    executedAt: new Date().toISOString(),
  };

  return JSON.stringify(response, null, 2);
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

  return JSON.stringify(response, null, 2);
}

/**
 * Format query result for consistent output
 */
export function formatQueryResult(result: {
  rows: Record<string, unknown>[];
  rowCount: number;
  fields: { name: string; format: string }[];
  query?: string;
}) {
  return {
    query: result.query,
    rowCount: result.rowCount,
    fields: result.fields.map((field) => ({
      name: field.name,
      dataType: field.format,
    })),
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
