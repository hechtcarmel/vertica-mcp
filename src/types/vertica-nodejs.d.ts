declare module "vertica-nodejs" {
  import { EventEmitter } from "node:events";
  export interface ClientConfig {
    host: string;
    port: number;
    database: string;
    user: string;
    password?: string;
    connectionTimeoutMillis: number;
    query_timeout: number;
    tls_mode: "disable" | "require" | "verify-full";
    client_label: string;
  }
  export class Client extends EventEmitter {
    constructor(config: ClientConfig);
    setTypeParser(
      oid: number,
      format: "text",
      parser: (value: string) => unknown,
    ): void;
    connect(): Promise<void>;
    query(
      text: string,
      values?: unknown[],
    ): Promise<
      import("./vertica.js").QueryResult | import("./vertica.js").QueryResult[]
    >;
    end(): Promise<void>;
  }
  const vertica: { Client: typeof Client };
  export default vertica;
}
