import vertica from "vertica-nodejs";
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
  READONLY_QUERY_PREFIXES,
  SSL_MODES,
  LOG_MESSAGES,
} from "../constants/index.js";
import {
  determineTableType,
  resolveSchemaName,
} from "../utils/table-helpers.js";

type Connection = any;

// Type declaration for vertica-nodejs CommonJS module
interface VerticaModule {
  Client: new (config: any) => any;
  Pool: any;
  defaults: any;
  types: any;
  DatabaseError: any;
  version: string;
}

const verticaTyped = vertica as any as VerticaModule;

export class VerticaService {
  private config: VerticaConfig;
  private connection: Connection | null = null;
  private readonly readonlyQueryPrefixes = READONLY_QUERY_PREFIXES;

  constructor(config: VerticaConfig) {
    this.config = config;
  }

  /**
   * Establish connection to Vertica database
   */
  async connect(): Promise<void> {
    if (this.connection) {
      return;
    }

    try {
      const clientConfig: any = {
        host: this.config.host,
        port: this.config.port,
        database: this.config.database,
        user: this.config.user,
        password: this.config.password,
        connectionTimeoutMillis: this.config.queryTimeout || 30000,
      };

      // Add SSL/TLS configuration if specified
      if (this.config.ssl) {
        clientConfig.tls_mode = SSL_MODES.REQUIRE;
        if (this.config.sslRejectUnauthorized !== undefined) {
          // Note: Vertica uses tls_mode for SSL control
          clientConfig.tls_mode = this.config.sslRejectUnauthorized
            ? SSL_MODES.VERIFY_FULL
            : SSL_MODES.REQUIRE;
        }
      } else {
        // Explicitly disable SSL/TLS for Vertica
        clientConfig.tls_mode = SSL_MODES.DISABLE;
        clientConfig.ssl = false;
        clientConfig.tls = false;
      }

      const client = new verticaTyped.Client(clientConfig);

      await client.connect();
      this.connection = client;

      console.log(
        `${LOG_MESSAGES.DB_CONNECTED}: ${this.config.host}:${this.config.port}/${this.config.database}`
      );
    } catch (error) {
      throw new Error(
        `Failed to connect to Vertica: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  /**
   * Close database connection
   */
  async disconnect(): Promise<void> {
    if (this.connection) {
      try {
        await this.connection.end();
        console.log(LOG_MESSAGES.DB_DISCONNECTED);
      } catch (error) {
        console.warn(
          LOG_MESSAGES.DB_CONNECTION_WARNING,
          error instanceof Error ? error.message : String(error)
        );
      } finally {
        this.connection = null;
      }
    }
  }

  /**
   * Check if connected to database
   */
  isConnected(): boolean {
    return this.connection !== null;
  }

  /**
   * Validate that a query is readonly
   */
  private validateReadonlyQuery(sql: string): void {
    const trimmedSql = sql.trim().toUpperCase();
    const isReadonly = this.readonlyQueryPrefixes.some((prefix) =>
      trimmedSql.startsWith(prefix)
    );

    if (!isReadonly) {
      throw new Error(
        `Only readonly queries are allowed. Query must start with: ${this.readonlyQueryPrefixes.join(
          ", "
        )}`
      );
    }
  }

  /**
   * Execute a readonly SQL query
   */
  async executeQuery(sql: string, params?: unknown[]): Promise<QueryResult> {
    this.validateReadonlyQuery(sql);
    await this.connect();

    if (!this.connection) {
      throw new Error("Database connection not established");
    }

    try {
      const result = await this.connection.query(sql, params);

      return {
        rows: result.rows || [],
        rowCount: result.rowCount || 0,
        fields: result.fields || [],
        command: result.command || "",
      };
    } catch (error) {
      throw new Error(
        `Query execution failed: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  /**
   * Stream query results in batches
   */
  async *streamQuery(
    sql: string,
    options: StreamQueryOptions
  ): AsyncGenerator<StreamQueryResult> {
    this.validateReadonlyQuery(sql);
    await this.connect();

    if (!this.connection) {
      throw new Error("Database connection not established");
    }

    const { batchSize, maxRows } = options;
    let offset = 0;
    let batchNumber = 0;
    let totalFetched = 0;

    try {
      while (true) {
        const limitedSql = `${sql} LIMIT ${batchSize} OFFSET ${offset}`;
        const result = await this.connection.query(limitedSql);

        if (!result.rows || result.rows.length === 0) {
          break;
        }

        batchNumber++;
        totalFetched += result.rows.length;

        const hasMore =
          result.rows.length === batchSize &&
          (!maxRows || totalFetched < maxRows);

        yield {
          batch: result.rows,
          batchNumber,
          totalBatches: hasMore ? batchNumber + 1 : batchNumber,
          hasMore,
          fields: result.fields || [],
        };

        if (!hasMore || (maxRows && totalFetched >= maxRows)) {
          break;
        }

        offset += batchSize;
      }
    } catch (error) {
      throw new Error(
        `Stream query failed: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  /**
   * Get detailed table structure information
   */
  async getTableStructure(
    tableName: string,
    schemaName?: string
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

    const columnsResult = await this.executeQuery(columnsQuery, [
      schema,
      tableName,
    ]);

    const columns: ColumnInfo[] = columnsResult.rows.map((row) => ({
      columnName: row.column_name as string,
      dataType: row.data_type as string,
      isNullable: row.is_nullable === "YES",
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

    const tableResult = await this.executeQuery(tableQuery, [
      schema,
      tableName,
    ]);

    if (tableResult.rows.length === 0) {
      throw new Error(`Table ${schema}.${tableName} not found`);
    }

    const tableInfo = tableResult.rows[0]!;

    const tableType = determineTableType({
      is_temp_table: tableInfo.is_temp_table as string | boolean,
      is_system_table: tableInfo.is_system_table as string | boolean,
      is_flextable: tableInfo.is_flextable as string | boolean,
    });

    // Get constraints (simplified - Vertica has different constraint system)
    const constraints: ConstraintInfo[] = [];

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
  async listTables(schemaName?: string): Promise<TableInfo[]> {
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

    const result = await this.executeQuery(query, [schema]);

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
  async listViews(schemaName?: string): Promise<ViewInfo[]> {
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

    const result = await this.executeQuery(query, [schema]);

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
    schemaName?: string
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
      WHERE p.projection_schema = ? AND p.anchor_table_name = ?
      ORDER BY p.projection_name, pc.sort_position
    `;

    const result = await this.executeQuery(query, [schema, tableName]);

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
