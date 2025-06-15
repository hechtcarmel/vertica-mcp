import { z } from "zod";
import { MCPTool } from "mcp-framework";
import { VerticaService } from "../services/vertica-service.js";
import { getDatabaseConfig } from "../config/database.js";

interface ListTablesInput {
  schemaName?: string;
}

class ListTablesTool extends MCPTool<ListTablesInput> {
  name = "list_tables";
  description = "List all tables in a schema with metadata";

  schema = {
    schemaName: {
      type: z.string().optional(),
      description:
        "Schema name (optional, defaults to configured default schema)",
    },
  };

  async execute(input: ListTablesInput) {
    let verticaService: VerticaService | null = null;

    try {
      // Create Vertica service instance
      const config = getDatabaseConfig();
      verticaService = new VerticaService(config);

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
            owner: table.owner,
            comment: table.comment,
            rowCount: table.rowCount,
          })),
          queriedAt: new Date().toISOString(),
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
          schemaName: input.schemaName,
          queriedAt: new Date().toISOString(),
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
}

export default ListTablesTool;
