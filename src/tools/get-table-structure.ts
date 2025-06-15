import { z } from "zod";
import { MCPTool } from "mcp-framework";
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

class GetTableStructureTool extends MCPTool<GetTableStructureInput> {
  name = "get_table_structure";
  description =
    "Get detailed structure information for a specific table including columns, data types, constraints, and metadata.";

  schema = {
    tableName: {
      type: z.string(),
      description: "Name of the table to analyze.",
    },
    schemaName: {
      type: z.string().optional(),
      description:
        "Schema name (optional, defaults to configured default schema).",
    },
  };

  async execute(input: GetTableStructureInput) {
    let service: VerticaService | null = null;

    try {
      // Validate inputs
      validateTableName(input.tableName);
      if (input.schemaName) {
        validateSchemaName(input.schemaName);
      }

      const config = getDatabaseConfig();
      service = new VerticaService(config);

      // Get table structure
      const structure = await service.getTableStructure(
        input.tableName,
        input.schemaName
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
          tableName: input.tableName,
          schemaName: input.schemaName,
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
}

export default GetTableStructureTool;
