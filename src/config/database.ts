import { z } from "zod";
import type { VerticaConfig } from "../types/vertica.js";
import { DATABASE_CONSTANTS } from "../constants/index.js";

// Custom boolean transform that handles string values correctly
const booleanFromString = (fallback: boolean) =>
  z.preprocess((value) => {
    if (typeof value !== "string") return value;
    switch (value.trim().toLowerCase()) {
      case "true":
      case "1":
        return true;
      case "false":
      case "0":
        return false;
      default:
        return value;
    }
  }, z.boolean().default(fallback));

// Zod schema for validating configuration
const ConfigSchema = z.object({
  host: z.string().min(1, "VERTICA_HOST is required"),
  port: z.coerce
    .number()
    .int()
    .min(1)
    .max(65535)
    .default(DATABASE_CONSTANTS.DEFAULT_PORT),
  database: z.string().min(1, "VERTICA_DATABASE is required"),
  user: z.string().min(1, "VERTICA_USER is required"),
  password: z.string().optional(),
  queryTimeout: z.coerce
    .number()
    .int()
    .min(1000)
    .max(300000)
    .default(DATABASE_CONSTANTS.DEFAULT_QUERY_TIMEOUT),
  idleTimeout: z.coerce
    .number()
    .int()
    .min(DATABASE_CONSTANTS.MIN_IDLE_TIMEOUT)
    .max(DATABASE_CONSTANTS.MAX_IDLE_TIMEOUT)
    .default(DATABASE_CONSTANTS.DEFAULT_IDLE_TIMEOUT),
  ssl: booleanFromString(false),
  sslRejectUnauthorized: booleanFromString(true),
  defaultSchema: z.string().min(1).default(DATABASE_CONSTANTS.DEFAULT_SCHEMA),
  readonlyMode: booleanFromString(true),
  connectionLoadBalance: booleanFromString(false),
});

/**
 * Load and validate Vertica database configuration from environment variables
 */
export function loadDatabaseConfig(
  env: NodeJS.ProcessEnv = process.env,
): VerticaConfig {
  const rawConfig = {
    host: env.VERTICA_HOST,
    port: env.VERTICA_PORT,
    database: env.VERTICA_DATABASE,
    user: env.VERTICA_USER,
    password: env.VERTICA_PASSWORD,
    queryTimeout: env.VERTICA_QUERY_TIMEOUT,
    idleTimeout: env.VERTICA_IDLE_TIMEOUT,
    ssl: env.VERTICA_SSL,
    sslRejectUnauthorized: env.VERTICA_SSL_REJECT_UNAUTHORIZED,
    defaultSchema: env.VERTICA_DEFAULT_SCHEMA,
    readonlyMode: env.VERTICA_READONLY_MODE,
    connectionLoadBalance: env.VERTICA_CONNECTION_LOAD_BALANCE,
  };

  try {
    const validatedConfig = ConfigSchema.parse(rawConfig);

    // Only log config details in debug mode
    if (env.DEBUG === "true" || env.VERTICA_DEBUG === "true") {
      const logConfig = {
        ...validatedConfig,
        password: validatedConfig.password ? "***" : undefined,
      };
      console.error("Database configuration loaded:", logConfig);
    }

    return validatedConfig;
  } catch (error) {
    if (error instanceof z.ZodError) {
      const missingFields = error.issues
        .map((err) => `${err.path.join(".")}: ${err.message}`)
        .join(", ");
      throw new Error(`Invalid database configuration: ${missingFields}`, {
        cause: error,
      });
    }
    throw error;
  }
}

/**
 * Validate that required environment variables are set
 */
export function validateRequiredEnvVars(): void {
  const required = ["VERTICA_HOST", "VERTICA_DATABASE", "VERTICA_USER"];
  const missing = required.filter((key) => !process.env[key]);

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(", ")}`,
    );
  }
}

/**
 * Get database configuration with validation
 */
export function getDatabaseConfig(): VerticaConfig {
  validateRequiredEnvVars();
  return loadDatabaseConfig();
}
