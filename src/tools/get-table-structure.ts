import { z } from "zod";
import { MCPTool } from "mcp-framework";
import { VerticaService } from "../services/vertica-service.js";
import { getDatabaseConfig } from "../config/database.js";

interface GetTableStructureInput {
  tableName: string;
  schemaName?: string;
}

export default class GetTableStructureTool extends MCPTool<GetTableStructureInput> {
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
    try {
      // Create Vertica service instance
      const config = getDatabaseConfig();
      const verticaService = new VerticaService(config);

      try {
        // Get table structure
        const structure = await verticaService.getTableStructure(
          input.tableName,
          input.schemaName
        );

        return JSON.stringify(
          {
            success: true,
            table: {
              schemaName: structure.schemaName,
              tableName: structure.tableName,
              tableType: structure.tableType,
              owner: structure.owner,
              comment: structure.comment,
            },
            columns: structure.columns.map((col) => ({
              name: col.columnName,
              dataType: col.dataType,
              nullable: col.isNullable,
              defaultValue: col.defaultValue,
              size: col.columnSize,
              decimalDigits: col.decimalDigits,
              position: col.ordinalPosition,
              comment: col.comment,
            })),
            constraints: structure.constraints.map((constraint) => ({
              name: constraint.constraintName,
              type: constraint.constraintType,
              column: constraint.columnName,
              referencedTable: constraint.referencedTable,
              referencedColumn: constraint.referencedColumn,
            })),
            analyzedAt: new Date().toISOString(),
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
          analyzedAt: new Date().toISOString(),
        },
        null,
        2
      );
    }
  }
}
