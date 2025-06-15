import { z } from "zod";
import { BaseTool } from "../base/base-tool.js";
import { formatQueryResult } from "../utils/response-formatter.js";

interface ExecuteQueryInput {
  sql: string;
  params?: unknown[];
}

interface ExecuteQueryOutput {
  query: string;
  rowCount: number;
  fields: Array<{ name: string; dataType: string }>;
  rows: Record<string, unknown>[];
}

export default class ExecuteQueryTool extends BaseTool<
  ExecuteQueryInput,
  ExecuteQueryOutput
> {
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

  protected async executeOperation(
    input: ExecuteQueryInput
  ): Promise<ExecuteQueryOutput> {
    const service = await this.getService();

    const result = await service.executeQuery(input.sql, input.params || []);

    const formatted = formatQueryResult({
      ...result,
      query: input.sql,
    });

    return {
      ...formatted,
      query: input.sql, // Ensure query is always defined
    };
  }
}
