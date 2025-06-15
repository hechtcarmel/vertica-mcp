import { z } from "zod";
import type { MCPTool } from "../types/tool.js";
import { VerticaService } from "../services/vertica-service.js";
import { getDatabaseConfig } from "../config/database.js";
import { formatTableStructure } from "../utils/response-formatter.js";
import {
  validateTableName,
  validateSchemaName,
} from "../utils/table-helpers.js";

interface GetTableStructureInput {
  tableName: string;
  schemaName?: string;
}

export default class GetTableStructureTool implements MCPTool {
  name = "get_table_structure";
  description =
    "Get detailed structure information for a specific table including columns, data types, constraints, and metadata.";

  inputSchema = {
    type: "object" as const,
    properties: {
      tableName: {
        type: "string" as const,
        description: "Name of the table to analyze.",
      },
      schemaName: {
        type: "string" as const,
        description:
          "Schema name (optional, defaults to configured default schema).",
      },
    },
    required: ["tableName"],
  };

  async execute(input: Record<string, unknown>): Promise<string> {
    // Validate input
    const parsed = this.parseInput(input);
    let service: VerticaService | null = null;

    try {
      // Validate inputs
      validateTableName(parsed.tableName);
      if (parsed.schemaName) {
        validateSchemaName(parsed.schemaName);
      }

      const config = getDatabaseConfig();
      service = new VerticaService(config);

      // Get table structure
      const structure = await service.getTableStructure(
        parsed.tableName,
        parsed.schemaName
      );

      const formatted = formatTableStructure(structure);

      return JSON.stringify(
        {
          success: true,
          ...formatted,
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
      if (service) {
        try {
          await service.disconnect();
        } catch (error) {
          console.warn("Warning during service cleanup:", error);
        }
      }
    }
  }

  private parseInput(input: Record<string, unknown>): GetTableStructureInput {
    const schema = z.object({
      tableName: z.string(),
      schemaName: z.string().optional(),
    });

    return schema.parse(input);
  }
}
