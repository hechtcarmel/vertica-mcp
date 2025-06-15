import { z } from "zod";
import { BaseTool } from "../base/base-tool.js";
import {
  validateSchemaName,
  resolveSchemaName,
} from "../utils/table-helpers.js";

interface ListTablesInput {
  schemaName?: string;
}

interface ListTablesOutput {
  schema: string;
  tableCount: number;
  tables: Array<{
    schemaName: string;
    tableName: string;
    tableType: string;
    owner: string;
    rowCount?: number;
    comment?: string;
  }>;
}

export default class ListTablesTool extends BaseTool<
  ListTablesInput,
  ListTablesOutput
> {
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

  protected async executeOperation(
    input: ListTablesInput
  ): Promise<ListTablesOutput> {
    // Validate schema name if provided
    if (input.schemaName) {
      validateSchemaName(input.schemaName);
    }

    const service = await this.getService();

    // List tables
    const tables = await service.listTables(input.schemaName);

    // Use the schema from the first table or fallback to input
    const resolvedSchema =
      tables.length > 0 && tables[0]
        ? tables[0].schemaName
        : resolveSchemaName(input.schemaName);

    return {
      schema: resolvedSchema,
      tableCount: tables.length,
      tables: tables.map((table) => ({
        schemaName: table.schemaName,
        tableName: table.tableName,
        tableType: table.tableType,
        owner: table.owner,
        rowCount: table.rowCount,
        comment: table.comment,
      })),
    };
  }
}
