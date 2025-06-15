import { z } from "zod";
import type { VerticaConfig } from "../types/vertica.js";
import { DATABASE_CONSTANTS } from "../constants/index.js";

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
  connectionLimit: z.coerce
    .number()
    .int()
    .min(1)
    .max(100)
    .default(DATABASE_CONSTANTS.DEFAULT_CONNECTION_LIMIT),
  queryTimeout: z.coerce
    .number()
    .int()
    .min(1000)
    .max(300000)
    .default(DATABASE_CONSTANTS.DEFAULT_QUERY_TIMEOUT),
  ssl: z.coerce.boolean().default(false),
  sslRejectUnauthorized: z.coerce.boolean().default(true),
  defaultSchema: z.string().default(DATABASE_CONSTANTS.DEFAULT_SCHEMA),
});

/**
 * Load and validate Vertica database configuration from environment variables
 */
export function loadDatabaseConfig(): VerticaConfig {
  const rawConfig = {
    host: process.env.VERTICA_HOST,
    port: process.env.VERTICA_PORT,
    database: process.env.VERTICA_DATABASE,
    user: process.env.VERTICA_USER,
    password: process.env.VERTICA_PASSWORD,
    connectionLimit: process.env.VERTICA_CONNECTION_LIMIT,
    queryTimeout: process.env.VERTICA_QUERY_TIMEOUT,
    ssl: process.env.VERTICA_SSL,
    sslRejectUnauthorized: process.env.VERTICA_SSL_REJECT_UNAUTHORIZED,
    defaultSchema: process.env.VERTICA_DEFAULT_SCHEMA,
  };

  try {
    const validatedConfig = ConfigSchema.parse(rawConfig);

    // Mask password in logs
    const logConfig = {
      ...validatedConfig,
      password: validatedConfig.password ? "***" : undefined,
    };
    console.log("Database configuration loaded:", logConfig);

    return validatedConfig;
  } catch (error) {
    if (error instanceof z.ZodError) {
      const missingFields = error.errors
        .map((err) => `${err.path.join(".")}: ${err.message}`)
        .join(", ");
      throw new Error(`Invalid database configuration: ${missingFields}`);
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
      `Missing required environment variables: ${missing.join(", ")}`
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
