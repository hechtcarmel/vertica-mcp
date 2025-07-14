import { z } from "zod";
import type { MCPTool } from "../types/tool.js";
import { VerticaService } from "../services/vertica-service.js";
import { getDatabaseConfig } from "../config/database.js";

interface ListIndexesInput {
  tableName: string;
  schemaName?: string;
}

export default class ListIndexesTool implements MCPTool {
  name = "list_indexes";
  description =
    "List indexes (projections) for a specific table in Vertica with column and uniqueness information";

  inputSchema = {
    type: "object" as const,
    properties: {
      tableName: {
        type: "string" as const,
        description: "Name of the table to list indexes for",
      },
      schemaName: {
        type: "string" as const,
        description:
          "Schema name (optional, defaults to configured default schema)",
      },
    },
    required: ["tableName"],
  };

  async execute(input: Record<string, unknown>): Promise<string> {
    // Validate input
    const parsed = this.parseInput(input);
    let verticaService: VerticaService | null = null;

    try {
      // Create Vertica service instance
      const config = getDatabaseConfig();
      verticaService = new VerticaService(config);

      // List indexes
      const indexes = await verticaService.listIndexes(
        parsed.tableName,
        parsed.schemaName
      );

      return JSON.stringify(
        {
          success: true,
          table: parsed.tableName,
          schema: parsed.schemaName ?? config.defaultSchema ?? "public",
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
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      return JSON.stringify(
        {
          success: false,
          error: errorMessage,
          tableName: parsed.tableName,
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

  private parseInput(input: Record<string, unknown>): ListIndexesInput {
    const schema = z.object({
      tableName: z.string(),
      schemaName: z.string().optional(),
    });

    return schema.parse(input);
  }
}
