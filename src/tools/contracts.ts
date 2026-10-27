import { z } from "zod";
import { DATABASE_CONSTANTS as limits } from "../constants/index.js";
import type { VerticaConfig } from "../types/vertica.js";

export const READONLY_TRANSACTION_META_KEY =
  "com.hechtcarmel.vertica/readOnlyTransaction";
const name = z.string().min(1).max(128);
const tableName = name.describe(
  "Exact existing table name, not a view. Pass the schema separately; do not add SQL quotes.",
);
const schemaName = name
  .optional()
  .describe(
    "Exact schema name without SQL quotes. Omit for VERTICA_DEFAULT_SCHEMA, or public if unset.",
  );
const sql = z
  .string()
  .min(1)
  .refine((value) => value.trim().length > 0, "SQL cannot be blank")
  .describe(
    "One Vertica SQL statement, not a script. Use ? placeholders with params; add LIMIT to bound execute_query reads.",
  );
const params = z
  .array(z.unknown())
  .optional()
  .describe(
    "Values for ? placeholders in SQL order; values only, not identifiers.",
  );
const count = z.number().int().nonnegative();
const nullableText = z.string().nullable().optional();
const rows = z.array(z.record(z.string(), z.unknown()));
const fields = z.array(
  z.looseObject({
    name: z.string(),
    dataType: z.string(),
    dataTypeId: z.number().int().optional(),
    format: z.string().optional(),
  }),
);
const timestamp = z.iso.datetime();

function response(shape: z.ZodRawShape, time: "executedAt" | "queriedAt") {
  // Both branches are objects. Keep the explicit root type for older MCP clients.
  return z
    .discriminatedUnion("success", [
      z.looseObject({ success: z.literal(true), [time]: timestamp, ...shape }),
      z.looseObject({
        success: z.literal(false),
        error: z.string(),
        [time]: timestamp,
      }),
    ])
    .meta({ type: "object" });
}

export const outputSchemas = {
  execute_query: response(
    {
      query: z.string(),
      rowCount: count.describe(
        "Returned result rows, not a DML affected-row count.",
      ),
      fields,
      rows,
    },
    "executedAt",
  ),
  stream_query: response(
    {
      query: z.string(),
      totalRows: count,
      batchCount: count,
      batchSize: z.number().int().positive(),
      maxRows: z.number().int().positive(),
      hasMore: z
        .boolean()
        .describe(
          "Additional rows existed beyond maxRows; no continuation token is provided.",
        ),
      truncated: z.boolean(),
      batches: z.array(
        z.looseObject({
          batchNumber: z.number().int().positive(),
          rowCount: count,
          rows,
          fields,
          hasMore: z
            .boolean()
            .describe(
              "More rows follow in this response or were omitted by maxRows.",
            ),
        }),
      ),
    },
    "executedAt",
  ),
  list_tables: response(
    {
      schema: z.string(),
      tableCount: count,
      tables: z.array(
        z.looseObject({
          schemaName: z.string(),
          tableName: z.string(),
          tableType: z.string(),
          owner: z.string(),
          rowCount: count.optional(),
          comment: nullableText,
        }),
      ),
    },
    "queriedAt",
  ),
  list_views: response(
    {
      schema: z.string(),
      viewCount: count,
      views: z.array(
        z.looseObject({
          schemaName: z.string(),
          viewName: z.string(),
          owner: z.string(),
          definition: z
            .string()
            .describe(
              "Preview: first 200 characters, followed by ... when truncated.",
            ),
          fullDefinition: z.string(),
          comment: nullableText,
        }),
      ),
    },
    "queriedAt",
  ),
  list_indexes: response(
    {
      table: z.string(),
      schema: z.string(),
      indexCount: count.describe(
        "Returned projection-column rows, not a distinct projection count.",
      ),
      note: z.string(),
      indexes: z.array(
        z.looseObject({
          indexName: z.string(),
          columnName: z.string(),
          isUnique: z
            .boolean()
            .describe(
              "Legacy name for is_key_constraint_projection; not an independent uniqueness guarantee.",
            ),
          indexType: z.literal("projection"),
          ordinalPosition: z.number().int().nullable(),
        }),
      ),
    },
    "queriedAt",
  ),
  get_table_structure: response(
    {
      table: z.looseObject({
        schemaName: z.string(),
        tableName: z.string(),
        tableType: z.string(),
        owner: z.string(),
        comment: nullableText,
      }),
      columns: z.array(
        z.looseObject({
          name: z.string(),
          dataType: z.string(),
          nullable: z.boolean(),
          defaultValue: nullableText,
          size: z
            .union([z.number(), z.string()])
            .nullable()
            .optional()
            .describe("Catalog length value when available."),
          decimalDigits: z.number().nullable().optional(),
          position: z.number().int(),
          comment: nullableText,
        }),
      ),
      constraints: z.array(
        z.looseObject({
          name: z.string(),
          type: z.string().describe("Vertica catalog code: p, f, u, c, or n."),
          column: z.string(),
          referencedTable: nullableText,
          referencedColumn: nullableText,
        }),
      ),
    },
    "queriedAt",
  ),
};

const catalogAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
};
// Arbitrary SQL can call functions with effects that read-only transactions do
// not prevent. Do not advertise purity, idempotence, or a closed interaction world.
const queryAnnotations = {
  readOnlyHint: false,
  destructiveHint: true,
  idempotentHint: false,
  openWorldHint: true,
};

export function toolContracts(config: VerticaConfig) {
  const readonly = config.readonlyMode !== false;
  const queryMeta = { [READONLY_TRANSACTION_META_KEY]: readonly };
  return {
    execute_query: {
      title: "Execute SQL",
      description:
        "Run one SQL statement for small results or SHOW/DESCRIBE/EXPLAIN. " +
        (readonly
          ? "Read-only statement checks and transactions are enabled. "
          : "Writes are enabled. ") +
        "Results have no row cap; add LIMIT or use stream_query. Database functions can have side effects.",
      inputSchema: z.strictObject({ sql, params }).meta({
        examples: [{ sql: "SELECT ?::INT AS value LIMIT 1", params: [42] }],
      }),
      outputSchema: outputSchemas.execute_query,
      annotations: queryAnnotations,
      _meta: queryMeta,
    },
    stream_query: {
      title: "Batch query results",
      description:
        "Use for bounded SELECT/WITH results valid inside a subquery. Executes once and returns batches in one response; no cursor or incremental streaming. Use ORDER BY for reproducible ordering. Functions can have side effects.",
      inputSchema: z.strictObject({
        sql,
        params,
        batchSize: z
          .number()
          .int()
          .min(1)
          .max(limits.MAX_BATCH_SIZE)
          .default(limits.DEFAULT_BATCH_SIZE)
          .describe("Rows per returned batch, not transport messages."),
        maxRows: z
          .number()
          .int()
          .min(1)
          .max(limits.MAX_STREAM_ROWS)
          .optional()
          .describe(
            "Maximum returned rows. Omit for min(batchSize * 100, 1000000). Truncation does not provide a continuation cursor.",
          ),
      }),
      outputSchema: outputSchemas.stream_query,
      annotations: queryAnnotations,
      _meta: queryMeta,
    },
    list_tables: {
      title: "List tables",
      description:
        "Discover visible tables in one schema before querying. Returns all matching metadata without pagination; does not read table data.",
      inputSchema: z.strictObject({ schemaName }),
      outputSchema: outputSchemas.list_tables,
      annotations: catalogAnnotations,
    },
    list_views: {
      title: "List views",
      description:
        "Discover views and their SQL in one schema. Returns all visible matches without pagination; definition is a 200-character preview and fullDefinition is complete.",
      inputSchema: z.strictObject({ schemaName }),
      outputSchema: outputSchemas.list_views,
      annotations: catalogAnnotations,
    },
    list_indexes: {
      title: "Inspect projections",
      description:
        "Inspect one table's Vertica projections and column sort positions. Returns all projection-column catalog rows without pagination. isUnique reflects key-constraint projection status, not a uniqueness proof.",
      inputSchema: z.strictObject({ tableName, schemaName }),
      outputSchema: outputSchemas.list_indexes,
      annotations: catalogAnnotations,
    },
    get_table_structure: {
      title: "Inspect table structure",
      description:
        "Inspect one existing table's columns, nullability, constraints and owner before composing SQL. Does not read table data. Fails if the table is absent or invisible; does not inspect views.",
      inputSchema: z.strictObject({ tableName, schemaName }),
      outputSchema: outputSchemas.get_table_structure,
      annotations: catalogAnnotations,
    },
  };
}
