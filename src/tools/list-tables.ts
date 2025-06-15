import { z } from "zod";
import { MCPTool } from "mcp-framework";
import { VerticaService } from "../services/vertica-service.js";
import { getDatabaseConfig } from "../config/database.js";

interface ListTablesInput {
  schemaName?: string;
}

export default class ListTablesTool extends MCPTool<ListTablesInput> {
  name = "list_tables";
  description =
    "List all tables in a schema with their metadata including table type and owner information.";

  schema = {
    schemaName: {
      type: z.string().optional(),
      description:
        "Schema name (optional, defaults to configured default schema).",
    },
  };

  async execute(input: ListTablesInput) {
    try {
      // Create Vertica service instance
      const config = getDatabaseConfig();
      const verticaService = new VerticaService(config);

      try {
        // List tables
        const tables = await verticaService.listTables(input.schemaName);

        return JSON.stringify(
          {
            success: true,
            schema: input.schemaName || config.defaultSchema || "public",
            tableCount: tables.length,
            tables: tables.map((table) => ({
              schemaName: table.schemaName,
              tableName: table.tableName,
              tableType: table.tableType,
              owner: table.owner,
              rowCount: table.rowCount,
              comment: table.comment,
            })),
            queriedAt: new Date().toISOString(),
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
          schemaName: input.schemaName,
          queriedAt: new Date().toISOString(),
        },
        null,
        2
      );
    }
  }
}
