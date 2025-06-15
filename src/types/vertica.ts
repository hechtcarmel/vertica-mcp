export interface VerticaConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  password?: string;
  connectionLimit?: number;
  queryTimeout?: number;
  ssl?: boolean;
  sslRejectUnauthorized?: boolean;
  defaultSchema?: string;
}

export interface QueryResult {
  rows: Record<string, unknown>[];
  rowCount: number;
  fields: QueryField[];
  command: string;
}

export interface QueryField {
  name: string;
  dataTypeID: number;
  dataTypeSize: number;
  dataTypeModifier: number;
  format: string;
}

export interface TableStructure {
  schemaName: string;
  tableName: string;
  columns: ColumnInfo[];
  constraints: ConstraintInfo[];
  tableType: string;
  owner: string;
  comment?: string;
}

export interface ColumnInfo {
  columnName: string;
  dataType: string;
  isNullable: boolean;
  defaultValue?: string;
  columnSize?: number;
  decimalDigits?: number;
  ordinalPosition: number;
  comment?: string;
}

export interface ConstraintInfo {
  constraintName: string;
  constraintType: string;
  columnName: string;
  referencedTable?: string;
  referencedColumn?: string;
}

export interface IndexInfo {
  indexName: string;
  tableName: string;
  columnName: string;
  isUnique: boolean;
  indexType: string;
  ordinalPosition: number;
}

export interface ViewInfo {
  schemaName: string;
  viewName: string;
  definition: string;
  owner: string;
  comment?: string;
}

export interface TableInfo {
  schemaName: string;
  tableName: string;
  tableType: string;
  owner: string;
  rowCount?: number;
  comment?: string;
}

export interface StreamQueryOptions {
  batchSize: number;
  maxRows?: number;
}

export interface StreamQueryResult {
  batch: Record<string, unknown>[];
  batchNumber: number;
  totalBatches: number;
  hasMore: boolean;
  fields: QueryField[];
}
