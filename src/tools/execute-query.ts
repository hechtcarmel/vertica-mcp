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

  get description(): string {
    try {
      const config = getDatabaseConfig();
      const isReadonly = config.readonlyMode ?? true;

      if (isReadonly) {
        return "Execute readonly SQL queries against the Vertica database. Only SELECT, SHOW, DESCRIBE, EXPLAIN, and WITH queries are allowed.";
      } else {
        return "Execute SQL queries against the Vertica database. All SQL operations are allowed including INSERT, UPDATE, DELETE, CREATE, DROP, etc.";
      }
    } catch {
      return "Execute SQL queries against the Vertica database. Query restrictions depend on configuration.";
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
          params: {
            type: "array" as const,
            items: {},
            description: "Optional parameters for parameterized queries.",
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
          params: {
            type: "array" as const,
            items: {},
            description: "Optional parameters for parameterized queries.",
          },
        },
        required: ["sql"],
      };
    }
  }

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
