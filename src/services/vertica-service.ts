import { DATABASE_CONSTANTS as limits } from "../constants/index.js";
import vertica from "vertica-nodejs";
import type { Client, ClientConfig } from "vertica-nodejs";
import type {
  VerticaConfig,
  QueryResult,
  TableStructure,
  ColumnInfo,
  ConstraintInfo,
  IndexInfo,
  ViewInfo,
  TableInfo,
  StreamQueryOptions,
  StreamQueryResult,
} from "../types/vertica.js";
import {
  determineTableType,
  resolveSchemaName,
} from "../utils/table-helpers.js";
import { readonlyStatement, singleStatement } from "../utils/sql.js";

export type ClientFactory = (config: ClientConfig) => Client;

export class VerticaService {
  private connection: Client | null = null;
  private connecting: Promise<void> | null = null;
  private queue: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly config: VerticaConfig,
    private readonly createClient: ClientFactory = (options) =>
      new vertica.Client(options),
  ) {}

  async connect(): Promise<void> {
    if (this.connection) return;
    this.connecting ??= this.open().finally(() => {
      this.connecting = null;
    });
    await this.connecting;
  }

  private async open(): Promise<void> {
    const timeout = this.config.queryTimeout ?? limits.DEFAULT_QUERY_TIMEOUT;
    const client = this.createClient({
      host: this.config.host,
      port: this.config.port,
      database: this.config.database,
      user: this.config.user,
      password: this.config.password,
      connectionTimeoutMillis: timeout,
      query_timeout: timeout,
      tls_mode: !this.config.ssl
        ? "disable"
        : this.config.sslRejectUnauthorized === false
          ? "require"
          : "verify-full",
      client_label: "vertica-mcp",
    });
    // Vertica INTEGER is signed 64-bit. The driver's default parseInt parser
    // loses precision outside JavaScript's safe range. Override per client.
    client.setTypeParser(6, "text", (value) => {
      const parsed = Number(value);
      return Number.isSafeInteger(parsed) ? parsed : value;
    });
    // Driver clients emit errors even while idle. Invalidate instead of crashing
    // or handing a poisoned client to the next request. Never replay a query.
    const invalidate = () => {
      if (this.connection === client) this.connection = null;
      void client.end().catch(() => {});
    };
    client.on("error", invalidate);
    client.on("end", () => {
      if (this.connection === client) this.connection = null;
    });
    try {
      await client.connect();
      this.connection = client;
    } catch (error) {
      await client.end().catch(() => {});
      throw new Error(`Failed to connect to Vertica: ${this.message(error)}`, {
        cause: error,
      });
    }
  }

  async disconnect(): Promise<void> {
    await this.connecting?.catch(() => {});
    const client = this.connection;
    this.connection = null;
    await client?.end().catch(() => {});
  }

  getHost(): string {
    return this.config.host;
  }
  isConnected(): boolean {
    return this.connection !== null;
  }

  private message(error: unknown): string {
    const message = error instanceof Error ? error.message : String(error);
    return this.config.password
      ? message.split(this.config.password).join("[REDACTED]")
      : message;
  }

  async executeQuery(
    sql: string,
    params?: unknown[],
    signal?: AbortSignal,
  ): Promise<QueryResult> {
    const statement =
      this.config.readonlyMode === false
        ? singleStatement(sql).sql
        : readonlyStatement(sql);
    const operation = this.queue.then(async () => {
      signal?.throwIfAborted();
      await this.connect();
      signal?.throwIfAborted();
      const client = this.connection!;
      const abort = () => {
        void this.disconnect();
      };
      signal?.addEventListener("abort", abort, { once: true });
      const readonly = this.config.readonlyMode !== false;
      try {
        if (readonly) await client.query("START TRANSACTION READ ONLY");
        const result = await client.query(statement, params);
        if (Array.isArray(result))
          throw new Error("Multiple query results are not supported");
        signal?.throwIfAborted();
        return {
          rows: result.rows ?? [],
          rowCount: result.rowCount ?? result.rows?.length ?? 0,
          fields: result.fields ?? [],
          command: result.command ?? "",
        };
      } catch (error) {
        // A client-side timeout does not cancel the statement in this driver.
        // Close it so it cannot keep running or leak transaction state.
        if (
          /timeout|connection|closed|socket/i.test(this.message(error)) ||
          signal?.aborted
        ) {
          await this.disconnect();
        }
        throw new Error(`Query execution failed: ${this.message(error)}`, {
          cause: error,
        });
      } finally {
        signal?.removeEventListener("abort", abort);
        if (readonly && this.connection === client) {
          try {
            await client.query("ROLLBACK");
          } catch {
            await this.disconnect();
          }
        }
      }
    });
    this.queue = operation.catch(() => {});
    return operation;
  }

  async *streamQuery(
    sql: string,
    options: StreamQueryOptions,
    signal?: AbortSignal,
  ): AsyncGenerator<StreamQueryResult> {
    const statement = readonlyStatement(sql, true);
    const {
      batchSize,
      maxRows = limits.DEFAULT_BATCH_SIZE * limits.MAX_BATCHES_LIMIT,
    } = options;
    if (
      !Number.isInteger(batchSize) ||
      batchSize < 1 ||
      batchSize > limits.MAX_BATCH_SIZE ||
      !Number.isInteger(maxRows) ||
      maxRows < 1 ||
      maxRows > limits.MAX_STREAM_ROWS
    ) {
      throw new Error("Invalid batchSize or maxRows");
    }
    // One execution preserves query semantics and accepts existing LIMIT/OFFSET.
    // The extra row distinguishes an exact boundary from a truncated result.
    const result = await this.executeQuery(
      `SELECT * FROM (\n${statement}\n) AS mcp_result LIMIT ${maxRows + 1}`,
      options.params,
      signal,
    );
    const rows = result.rows.slice(0, maxRows);
    const totalBatches = Math.ceil(rows.length / batchSize);
    for (let offset = 0; offset < rows.length; offset += batchSize) {
      signal?.throwIfAborted();
      const end = Math.min(offset + batchSize, rows.length);
      yield {
        batch: rows.slice(offset, end),
        batchNumber: Math.floor(offset / batchSize) + 1,
        totalBatches,
        hasMore: end < result.rows.length,
        fields: result.fields,
      };
    }
  }

  /**
   * Get detailed table structure information
   */
  async getTableStructure(
    tableName: string,
    schemaName?: string,
    signal?: AbortSignal,
  ): Promise<TableStructure> {
    const schema = resolveSchemaName(schemaName, this.config.defaultSchema);

    // Get column information
    const columnsQuery = `
      SELECT 
        column_name,
        data_type,
        is_nullable,
        column_default,
        character_maximum_length,
        numeric_precision,
        numeric_scale,
        ordinal_position
      FROM v_catalog.columns 
      WHERE table_schema = ? AND table_name = ?
      ORDER BY ordinal_position
    `;

    const columnsResult = await this.executeQuery(
      columnsQuery,
      [schema, tableName],
      signal,
    );

    const columns: ColumnInfo[] = columnsResult.rows.map((row) => ({
      columnName: row.column_name as string,
      dataType: row.data_type as string,
      isNullable:
        row.is_nullable === true ||
        row.is_nullable === "t" ||
        row.is_nullable === "YES",
      defaultValue: row.column_default as string | undefined,
      columnSize: row.character_maximum_length as number | undefined,
      decimalDigits: row.numeric_scale as number | undefined,
      ordinalPosition: row.ordinal_position as number,
    }));

    // Get table metadata
    const tableQuery = `
      SELECT 
        owner_name,
        is_temp_table,
        is_system_table,
        is_flextable
      FROM v_catalog.tables 
      WHERE table_schema = ? AND table_name = ?
    `;

    const tableResult = await this.executeQuery(
      tableQuery,
      [schema, tableName],
      signal,
    );

    if (tableResult.rows.length === 0) {
      throw new Error(`Table ${schema}.${tableName} not found`);
    }

    const tableInfo = tableResult.rows[0]!;

    const tableType = determineTableType({
      is_temp_table: tableInfo.is_temp_table as string | boolean,
      is_system_table: tableInfo.is_system_table as string | boolean,
      is_flextable: tableInfo.is_flextable as string | boolean,
    });

    // Read column constraints, including foreign-key references.
    const constraintResult = await this.executeQuery(
      `
      SELECT constraint_name, constraint_type, column_name,
             reference_table_name, reference_column_name
      FROM v_catalog.constraint_columns
      WHERE table_schema = ? AND table_name = ?
      ORDER BY constraint_name, column_name
    `,
      [schema, tableName],
      signal,
    );
    const constraints: ConstraintInfo[] = constraintResult.rows.map((row) => ({
      constraintName: row.constraint_name as string,
      constraintType: row.constraint_type as string,
      columnName: row.column_name as string,
      referencedTable: row.reference_table_name as string | undefined,
      referencedColumn: row.reference_column_name as string | undefined,
    }));

    return {
      schemaName: schema,
      tableName,
      columns,
      constraints,
      tableType,
      owner: tableInfo.owner_name as string,
    };
  }

  /**
   * List all tables in a schema
   */
  async listTables(
    schemaName?: string,
    signal?: AbortSignal,
  ): Promise<TableInfo[]> {
    const schema = resolveSchemaName(schemaName, this.config.defaultSchema);

    const query = `
      SELECT 
        table_schema,
        table_name,
        owner_name,
        is_temp_table,
        is_system_table,
        is_flextable
      FROM v_catalog.tables 
      WHERE table_schema = ?
      ORDER BY table_name
    `;

    const result = await this.executeQuery(query, [schema], signal);

    return result.rows.map((row) => {
      const tableType = determineTableType({
        is_temp_table: row.is_temp_table as string | boolean,
        is_system_table: row.is_system_table as string | boolean,
        is_flextable: row.is_flextable as string | boolean,
      });

      return {
        schemaName: row.table_schema as string,
        tableName: row.table_name as string,
        tableType,
        owner: row.owner_name as string,
      };
    });
  }

  /**
   * List all views in a schema
   */
  async listViews(
    schemaName?: string,
    signal?: AbortSignal,
  ): Promise<ViewInfo[]> {
    const schema = resolveSchemaName(schemaName, this.config.defaultSchema);

    const query = `
      SELECT 
        table_schema,
        table_name as view_name,
        view_definition,
        owner_name
      FROM v_catalog.views 
      WHERE table_schema = ?
      ORDER BY table_name
    `;

    const result = await this.executeQuery(query, [schema], signal);

    return result.rows.map((row) => ({
      schemaName: row.table_schema as string,
      viewName: row.view_name as string,
      definition: row.view_definition as string,
      owner: row.owner_name as string,
    }));
  }

  /**
   * List indexes for a table
   */
  async listIndexes(
    tableName: string,
    schemaName?: string,
    signal?: AbortSignal,
  ): Promise<IndexInfo[]> {
    const schema = resolveSchemaName(schemaName, this.config.defaultSchema);

    // Note: Vertica has projections instead of traditional indexes
    // This query gets projection information which serves a similar purpose
    const query = `
      SELECT 
        p.projection_name as index_name,
        p.anchor_table_name as table_name,
        pc.projection_column_name as column_name,
        p.is_key_constraint_projection,
        pc.sort_position
      FROM v_catalog.projection_columns pc
      JOIN v_catalog.projections p ON pc.projection_id = p.projection_id
      JOIN v_catalog.tables t ON p.anchor_table_id = t.table_id
      WHERE t.table_schema = ? AND p.anchor_table_name = ?
      ORDER BY p.projection_name, pc.sort_position
    `;

    const result = await this.executeQuery(query, [schema, tableName], signal);

    return result.rows.map((row) => ({
      indexName: row.index_name as string,
      tableName: row.table_name as string,
      columnName: row.column_name as string,
      isUnique:
        row.is_key_constraint_projection === "t" ||
        row.is_key_constraint_projection === true,
      indexType: "projection",
      ordinalPosition: row.sort_position as number,
    }));
  }

  /**
   * Test database connection
   */
  async testConnection(): Promise<boolean> {
    try {
      await this.connect();
      const result = await this.executeQuery("SELECT 1 as test");
      return result.rows.length > 0 && result.rows[0]?.test === 1;
    } catch {
      return false;
    }
  }
}
