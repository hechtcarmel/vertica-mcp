import { z } from "zod";
import type { MCPTool } from "../types/tool.js";
import { VerticaService } from "../services/vertica-service.js";
import { getDatabaseConfig } from "../config/database.js";

interface ListTablesInput {
  schemaName?: string;
}

export default class ListTablesTool implements MCPTool {
  name = "list_tables";
  description = "List all tables in a schema with metadata";

  inputSchema = {
    type: "object" as const,
    properties: {
      schemaName: {
        type: "string" as const,
        description:
          "Schema name (optional, defaults to configured default schema)",
      },
    },
    required: [],
  };

  async execute(input: Record<string, unknown>): Promise<string> {
    // Validate input
    const parsed = this.parseInput(input);
    let verticaService: VerticaService | null = null;

    try {
      // Create Vertica service instance
      const config = getDatabaseConfig();
      verticaService = new VerticaService(config);

      // List tables
      const tables = await verticaService.listTables(parsed.schemaName);

      return JSON.stringify(
        {
          success: true,
          schema: parsed.schemaName || config.defaultSchema || "public",
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
          schemaName: parsed.schemaName,
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

  private parseInput(input: Record<string, unknown>): ListTablesInput {
    const schema = z.object({
      schemaName: z.string().optional(),
    });

    return schema.parse(input);
  }
}
