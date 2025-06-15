/**
 * Error types for the Vertica MCP server
 */

export interface BaseError {
  message: string;
  code?: string;
  details?: Record<string, unknown>;
}

export interface DatabaseConnectionError extends BaseError {
  type: "DATABASE_CONNECTION_ERROR";
  host?: string;
  port?: number;
  database?: string;
}

export interface QueryExecutionError extends BaseError {
  type: "QUERY_EXECUTION_ERROR";
  query?: string;
  parameters?: unknown[];
}

export interface ValidationError extends BaseError {
  type: "VALIDATION_ERROR";
  field?: string;
  value?: unknown;
}

export interface ConfigurationError extends BaseError {
  type: "CONFIGURATION_ERROR";
  missingFields?: string[];
}

export interface ReadonlyViolationError extends BaseError {
  type: "READONLY_VIOLATION_ERROR";
  query?: string;
  allowedPrefixes?: string[];
}

export interface TableNotFoundError extends BaseError {
  type: "TABLE_NOT_FOUND_ERROR";
  tableName?: string;
  schemaName?: string;
}

export type VerticaError =
  | DatabaseConnectionError
  | QueryExecutionError
  | ValidationError
  | ConfigurationError
  | ReadonlyViolationError
  | TableNotFoundError;

/**
 * Response types for consistent API responses
 */
export interface SuccessResponse<T = unknown> {
  success: true;
  data: T;
  executedAt: string;
}

export interface ErrorResponse {
  success: false;
  error: BaseError;
  executedAt: string;
}

export type ApiResponse<T = unknown> = SuccessResponse<T> | ErrorResponse;
