import { z } from "zod";
import { MCPTool } from "mcp-framework";
import { VerticaService } from "../services/vertica-service.js";
import { getDatabaseConfig } from "../config/database.js";

interface ExecuteQueryInput {
  sql: string;
  params?: unknown[];
}

export default class ExecuteQueryTool extends MCPTool<ExecuteQueryInput> {
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
    try {
      // Create Vertica service instance
      const config = getDatabaseConfig();
      const verticaService = new VerticaService(config);

      try {
        // Execute the query
        const result = await verticaService.executeQuery(
          input.sql,
          input.params || []
        );

        return JSON.stringify(
          {
            success: true,
            query: input.sql,
            rowCount: result.rowCount,
            fields: result.fields.map((field) => ({
              name: field.name,
              dataType: field.format,
            })),
            rows: result.rows,
            executedAt: new Date().toISOString(),
          },
          null,
          2
        );
      } finally {
        // Always disconnect
        await verticaService.disconnect();
      }
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
    }
  }
}
