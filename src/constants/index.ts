/**
 * Application constants
 */

export const DATABASE_CONSTANTS = {
  DEFAULT_PORT: 5433,
  DEFAULT_SCHEMA: "public",
  DEFAULT_CONNECTION_LIMIT: 10,
  DEFAULT_QUERY_TIMEOUT: 60000,
  DEFAULT_IDLE_TIMEOUT: 3600000,
  MIN_IDLE_TIMEOUT: 60000,
  MAX_IDLE_TIMEOUT: 86400000,
  DEFAULT_BATCH_SIZE: 1000,
  MAX_BATCH_SIZE: 10000,
  MAX_BATCHES_LIMIT: 100,
  MAX_STREAM_ROWS: 1000000,
} as const;

export const READONLY_QUERY_PREFIXES = [
  "SELECT",
  "SHOW",
  "DESCRIBE",
  "EXPLAIN",
  "WITH",
] as const;

export const TABLE_TYPES = {
  TABLE: "TABLE",
  TEMPORARY_TABLE: "TEMPORARY TABLE",
  SYSTEM_TABLE: "SYSTEM TABLE",
  FLEX_TABLE: "FLEX TABLE",
  VIEW: "VIEW",
} as const;

export const LOG_MESSAGES = {
  SERVER_STARTING: "🚀 Starting Vertica MCP Server...",
  SERVER_READY:
    "✅ Vertica MCP Server is running and ready to accept connections",
  SERVER_SHUTDOWN: "\n🛑 Shutting down gracefully...",
  DB_CONNECTED: "✅ Connected to Vertica database",
  DB_DISCONNECTED: "🔌 Disconnected from Vertica database",
  DB_IDLE_TIMEOUT: "🔌 Idle timeout reached, disconnecting from Vertica database",
  DB_CONNECTION_WARNING: "⚠️ Warning during disconnect:",
  DB_LOAD_BALANCE_ROUTING: "🔀 Load balance redirect:",
  DB_LOAD_BALANCE_SKIP: "⚠️ Load balance routing failed, staying on initial host:",
  DB_LOAD_BALANCE_SAME: "✅ Load balance: already on optimal node",
  DB_CONNECTION_FAILED: "❌ Failed to connect to Vertica",
  SERVER_START_FAILED: "❌ Failed to start Vertica MCP Server:",
  UNHANDLED_ERROR: "❌ Unhandled error in main:",
} as const;
