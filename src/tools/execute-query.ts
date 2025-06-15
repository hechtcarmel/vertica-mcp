import { z } from "zod";
import type { MCPTool } from "../types/tool.js";
import { VerticaService } from "../services/vertica-service.js";
import { getDatabaseConfig } from "../config/database.js";
import { formatQueryResult } from "../utils/response-formatter.js";

interface ExecuteQueryInput {
  sql: string;
  params?: unknown[];
}

export default class ExecuteQueryTool implements MCPTool {
  name = "execute_query";
  description =
    "Execute a readonly SQL query against the Vertica database. Supports SELECT, SHOW, DESCRIBE, EXPLAIN, and WITH queries.";

  inputSchema = {
    type: "object" as const,
    properties: {
      sql: {
        type: "string" as const,
        description:
          "SQL query to execute. Must be a readonly query (SELECT, SHOW, DESCRIBE, EXPLAIN, or WITH).",
      },
      params: {
        type: "array" as const,
        items: {},
        description: "Optional parameters for parameterized queries.",
      },
    },
    required: ["sql"],
  };

  async execute(input: Record<string, unknown>): Promise<string> {
    // Validate input
    const parsed = this.parseInput(input);
    let service: VerticaService | null = null;

    try {
      const config = getDatabaseConfig();
      service = new VerticaService(config);

      const result = await service.executeQuery(
        parsed.sql,
        parsed.params || []
      );

      const formatted = formatQueryResult({
        ...result,
        query: parsed.sql,
      });

      return JSON.stringify(
        {
          success: true,
          ...formatted,
          query: parsed.sql,
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
      if (service) {
        try {
          await service.disconnect();
        } catch (error) {
          console.warn("Warning during service cleanup:", error);
        }
      }
    }
  }

  private parseInput(input: Record<string, unknown>): ExecuteQueryInput {
    const schema = z.object({
      sql: z.string(),
      params: z.array(z.unknown()).optional(),
    });

    return schema.parse(input);
  }
}
