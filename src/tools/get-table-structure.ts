import { z } from "zod";
import { BaseTool } from "../base/base-tool.js";
import { formatTableStructure } from "../utils/response-formatter.js";
import {
  validateTableName,
  validateSchemaName,
} from "../utils/table-helpers.js";

interface GetTableStructureInput {
  tableName: string;
  schemaName?: string;
}

export default class GetTableStructureTool extends BaseTool<GetTableStructureInput> {
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

  protected async executeOperation(input: GetTableStructureInput) {
    // Validate inputs
    validateTableName(input.tableName);
    if (input.schemaName) {
      validateSchemaName(input.schemaName);
    }

    const service = await this.getService();

    // Get table structure
    const structure = await service.getTableStructure(
      input.tableName,
      input.schemaName
    );

    return formatTableStructure(structure);
  }
}
