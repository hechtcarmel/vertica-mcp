import { z } from "zod";
import { MCPTool } from "mcp-framework";
import { VerticaService } from "../services/vertica-service.js";
import { getDatabaseConfig } from "../config/database.js";
import { formatQueryResult } from "../utils/response-formatter.js";

interface ExecuteQueryInput {
  sql: string;
  params?: unknown[];
}

class ExecuteQueryTool extends MCPTool<ExecuteQueryInput> {
  name = "execute_query";
  description =
    "Execute a readonly SQL query against the Vertica database. Supports SELECT, SHOW, DESCRIBE, EXPLAIN, and WITH queries.";

  schema = {
    sql: {
      type: z.string(),
      description:
        "SQL query to execute. Must be a readonly query (SELECT, SHOW, DESCRIBE, EXPLAIN, or WITH).",
    },
    params: {
      type: z.array(z.unknown()).optional(),
      description: "Optional parameters for parameterized queries.",
    },
  };

  async execute(input: ExecuteQueryInput) {
    let service: VerticaService | null = null;

    try {
      const config = getDatabaseConfig();
      service = new VerticaService(config);

      const result = await service.executeQuery(input.sql, input.params || []);

      const formatted = formatQueryResult({
        ...result,
        query: input.sql,
      });

      return JSON.stringify(
        {
          success: true,
          ...formatted,
          query: input.sql,
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
          query: input.sql,
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
}

export default ExecuteQueryTool;
