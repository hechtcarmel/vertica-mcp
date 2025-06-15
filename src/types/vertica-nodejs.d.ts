declare module "vertica-nodejs" {
  export interface ConnectionConfig {
    host: string;
    port: number;
    database: string;
    user: string;
    password?: string;
    ssl?: boolean;
    connectTimeout?: number;
  }

  export interface QueryResult {
    rows: Record<string, any>[];
    rowCount: number;
    fields: Array<{
      name: string;
      dataTypeID: number;
      dataTypeSize: number;
      dataTypeModifier: number;
      format: string;
    }>;
    command: string;
  }

  export interface Connection {
    query(text: string, params?: any[]): Promise<QueryResult>;
    end(): Promise<void>;
  }

  export function connect(config: ConnectionConfig): Promise<Connection>;
}
