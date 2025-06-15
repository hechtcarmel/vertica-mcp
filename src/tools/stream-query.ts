import { z } from "zod";
import type { MCPTool } from "../types/tool.js";
import { VerticaService } from "../services/vertica-service.js";
import { getDatabaseConfig } from "../config/database.js";

interface StreamQueryInput {
  sql: string;
  batchSize?: number;
  maxRows?: number;
}

export default class StreamQueryTool implements MCPTool {
  name = "stream_query";
  description =
    "Stream large query results in batches to handle datasets efficiently without memory issues.";

  inputSchema = {
    type: "object" as const,
    properties: {
      sql: {
        type: "string" as const,
        description:
          "SQL query to execute. Must be a readonly query (SELECT, SHOW, DESCRIBE, EXPLAIN, or WITH).",
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

      return JSON.stringify(
        {
          success: true,
          query: parsed.sql,
          totalRows,
          batchCount: batches.length,
          batchSize,
          batches,
          executedAt: new Date().toISOString(),
        },
        null,
        2
      );
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      return JSON.stringify(
        {
          success: false,
          error: errorMessage,
          query: parsed.sql,
          executedAt: new Date().toISOString(),
        },
        null,
        2
      );
    } finally {
      if (verticaService) {
        try {
          await verticaService.disconnect();
        } catch (error) {
          console.warn("Warning during service cleanup:", error);
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
