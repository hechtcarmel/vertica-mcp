import { z } from "zod";
import { MCPTool } from "mcp-framework";
import { VerticaService } from "../services/vertica-service.js";
import { getDatabaseConfig } from "../config/database.js";

interface ListIndexesInput {
  tableName: string;
  schemaName?: string;
}

export default class ListIndexesTool extends MCPTool<ListIndexesInput> {
  name = "list_indexes";
  description =
    "List indexes (projections) for a specific table in Vertica with column and uniqueness information";

  schema = {
    tableName: {
      type: z.string(),
      description: "Name of the table to list indexes for",
    },
    schemaName: {
      type: z.string().optional(),
      description:
        "Schema name (optional, defaults to configured default schema)",
    },
  };

  async execute(input: ListIndexesInput) {
    try {
      // Create Vertica service instance
      const config = getDatabaseConfig();
      const verticaService = new VerticaService(config);

      try {
        // List indexes
        const indexes = await verticaService.listIndexes(
          input.tableName,
          input.schemaName
        );

        return JSON.stringify(
          {
            success: true,
            table: input.tableName,
            schema: input.schemaName ?? config.defaultSchema ?? "public",
            indexCount: indexes.length,
            indexes: indexes.map((index) => ({
              indexName: index.indexName,
              columnName: index.columnName,
              isUnique: index.isUnique,
              indexType: index.indexType,
              ordinalPosition: index.ordinalPosition,
            })),
            note: "In Vertica, indexes are implemented as projections which provide similar functionality",
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
          tableName: input.tableName,
          schemaName: input.schemaName,
          queriedAt: new Date().toISOString(),
        },
        null,
        2
      );
    }
  }
}
