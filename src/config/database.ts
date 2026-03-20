import { z } from "zod";
import type { VerticaConfig } from "../types/vertica.js";
import { DATABASE_CONSTANTS } from "../constants/index.js";

// Custom boolean transform that handles string values correctly
const booleanFromString = z
  .union([
    z.boolean(),
    z.string().transform((val) => {
      const lower = val.toLowerCase();
      if (lower === "true" || lower === "1") return true;
      if (lower === "false" || lower === "0") return false;
      throw new Error(`Invalid boolean value: ${val}`);
    }),
    z.undefined(),
  ])
  .transform((val) => val ?? true); // default to true if undefined

// Parse a comma-separated string into a trimmed, non-empty string array
const commaList = z
  .string()
  .optional()
  .transform((val: string | undefined) =>
    val
      ? val
          .split(",")
          .map((h: string) => h.trim())
          .filter(Boolean)
      : undefined
  );

// Zod schema for validating configuration
const ConfigSchema = z
  .object({
    host: z.string().optional(),
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
    readonlyMode: booleanFromString,
    primaryHosts: commaList,
    secondaryHosts: commaList,
    secondarySchedule: z.string().optional().default("MON-FRI 08:00-18:00"),
    timezone: z.string().optional().default("UTC"),
  })
  .superRefine(
    (
      data: { host?: string; primaryHosts?: string[] },
      ctx: z.RefinementCtx
    ) => {
      const hasHost = data.host && data.host.length > 0;
      const hasPrimaryHosts =
        data.primaryHosts && data.primaryHosts.length > 0;
      if (!hasHost && !hasPrimaryHosts) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Either VERTICA_HOST or VERTICA_PRIMARY_HOSTS must be set",
          path: ["host"],
        });
      }
    }
  );

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
    readonlyMode: process.env.VERTICA_READONLY_MODE,
    primaryHosts: process.env.VERTICA_PRIMARY_HOSTS,
    secondaryHosts: process.env.VERTICA_SECONDARY_HOSTS,
    secondarySchedule: process.env.VERTICA_SECONDARY_SCHEDULE,
    timezone: process.env.VERTICA_TIMEZONE,
  };

  try {
    const validatedConfig = ConfigSchema.parse(rawConfig);

    // Warn about redundant or ineffective configuration
    if (rawConfig.host && validatedConfig.primaryHosts && validatedConfig.primaryHosts.length > 0) {
      console.warn(
        "Warning: VERTICA_HOST is set but ignored — VERTICA_PRIMARY_HOSTS is used for subcluster routing"
      );
    }
    if (rawConfig.secondarySchedule && (!validatedConfig.secondaryHosts || validatedConfig.secondaryHosts.length === 0)) {
      console.warn(
        "Warning: VERTICA_SECONDARY_SCHEDULE is set but has no effect — VERTICA_SECONDARY_HOSTS is not configured"
      );
    }

    // Only log config details in debug mode
    if (process.env.DEBUG === "true" || process.env.VERTICA_DEBUG === "true") {
      const logConfig = {
        ...validatedConfig,
        password: validatedConfig.password ? "***" : undefined,
      };
      console.error("Database configuration loaded:", logConfig);
    }

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
  const hasHost = !!process.env.VERTICA_HOST;
  const hasPrimaryHosts = !!process.env.VERTICA_PRIMARY_HOSTS;

  if (!hasHost && !hasPrimaryHosts) {
    throw new Error(
      "Missing required environment variable: either VERTICA_HOST or VERTICA_PRIMARY_HOSTS must be set"
    );
  }

  const required = ["VERTICA_DATABASE", "VERTICA_USER"];
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
