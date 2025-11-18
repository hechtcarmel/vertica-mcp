import { z } from "zod";
import type { MCPTool } from "../types/tool.js";
import { VerticaService } from "../services/vertica-service.js";
import { getDatabaseConfig } from "../config/database.js";
import { safeJsonStringify } from "../utils/response-formatter.js";

interface StreamQueryInput {
  sql: string;
  batchSize?: number;
  maxRows?: number;
}

export default class StreamQueryTool implements MCPTool {
  name = "stream_query";

  get description(): string {
    try {
      const config = getDatabaseConfig();
      const isReadonly = config.readonlyMode ?? true;

      if (isReadonly) {
        return "Stream large readonly query results in batches to handle datasets efficiently. Only SELECT, SHOW, DESCRIBE, EXPLAIN, and WITH queries are allowed.";
      } else {
        return "Stream large query results in batches to handle datasets efficiently. All SQL operations are allowed including data modification queries.";
      }
    } catch {
      return "Stream large query results in batches to handle datasets efficiently. Query restrictions depend on configuration.";
    }
  }

  get inputSchema() {
    try {
      const config = getDatabaseConfig();
      const isReadonly = config.readonlyMode ?? true;

      const sqlDescription = isReadonly
        ? "SQL query to execute. Only readonly queries are allowed: SELECT, SHOW, DESCRIBE, EXPLAIN, and WITH."
        : "SQL query to execute. All SQL operations are allowed including INSERT, UPDATE, DELETE, CREATE, DROP, etc.";

      return {
        type: "object" as const,
        properties: {
          sql: {
            type: "string" as const,
            description: sqlDescription,
          },
          batchSize: {
            type: "number" as const,
            minimum: 1,
            maximum: 10000,
            default: 1000,
            description: "Number of rows per batch (1-10000, default: 1000).",
          },
          maxRows: {
            type: "number" as const,
            minimum: 1,
            maximum: 1000000,
            description: "Maximum total rows to fetch (optional).",
          },
        },
        required: ["sql"],
      };
    } catch {
      return {
        type: "object" as const,
        properties: {
          sql: {
            type: "string" as const,
            description:
              "SQL query to execute. Query restrictions depend on configuration.",
          },
          batchSize: {
            type: "number" as const,
            minimum: 1,
            maximum: 10000,
            default: 1000,
            description: "Number of rows per batch (1-10000, default: 1000).",
          },
          maxRows: {
            type: "number" as const,
            minimum: 1,
            maximum: 1000000,
            description: "Maximum total rows to fetch (optional).",
          },
        },
        required: ["sql"],
      };
    }
  }

  async execute(input: Record<string, unknown>): Promise<string> {
    // Validate input
    const parsed = this.parseInput(input);
    let verticaService: VerticaService | null = null;

    try {
      // Create Vertica service instance
      const config = getDatabaseConfig();
      verticaService = new VerticaService(config);

      const batches = [];
      let totalRows = 0;
      const batchSize = parsed.batchSize || 1000;

      // Stream the query results
      for await (const batch of verticaService.streamQuery(parsed.sql, {
        batchSize,
        maxRows: parsed.maxRows,
      })) {
        batches.push({
          batchNumber: batch.batchNumber,
          rowCount: batch.batch.length,
          rows: batch.batch,
          hasMore: batch.hasMore,
          fields: batch.fields.map((field) => ({
            name: field.name,
            dataType: field.format,
          })),
        });

        totalRows += batch.batch.length;

        // Safety break if we've collected too many batches
        if (batches.length > 100) {
          break;
        }
      }

      return safeJsonStringify(
        {
          success: true,
          query: parsed.sql,
          totalRows,
          batchCount: batches.length,
          batchSize,
          batches,
          executedAt: new Date().toISOString(),
        },
        2
      );
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      return safeJsonStringify(
        {
          success: false,
          error: errorMessage,
          query: parsed.sql,
          executedAt: new Date().toISOString(),
        },
        2
      );
    } finally {
      if (verticaService) {
        try {
          await verticaService.disconnect();
        } catch (error) {
          console.error("Warning during service cleanup:", error instanceof Error ? error.message : String(error));
        }
      }
    }
  }

  private parseInput(input: Record<string, unknown>): StreamQueryInput {
    const schema = z.object({
      sql: z.string(),
      batchSize: z.number().int().min(1).max(10000).default(1000),
      maxRows: z.number().int().min(1).max(1000000).optional(),
    });

    return schema.parse(input);
  }
}
