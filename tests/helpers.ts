import { EventEmitter } from "node:events";
import { vi } from "vitest";
import type { Client } from "vertica-nodejs";
import { VerticaService } from "../src/services/vertica-service.js";
import type { VerticaConfig, QueryResult } from "../src/types/vertica.js";
export const config: VerticaConfig = {
  host: "localhost",
  port: 5433,
  database: "testdb",
  user: "tester",
  password: "secret-for-testing",
  readonlyMode: true,
  defaultSchema: "public",
  idleTimeout: 60000,
};
export const result = (rows: Record<string, unknown>[] = []): QueryResult => ({
  rows,
  rowCount: rows.length,
  fields: [],
  command: "SELECT",
});
export function setup(options: Partial<VerticaConfig> = {}) {
  const client = Object.assign(new EventEmitter(), {
    setTypeParser:
      vi.fn<
        (
          oid: number,
          format: "text",
          parser: (value: string) => unknown,
        ) => void
      >(),
    connect: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
    end: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
    query: vi
      .fn<
        (
          sql: string,
          params?: unknown[],
        ) => Promise<QueryResult | QueryResult[]>
      >()
      .mockResolvedValue(result()),
  });
  const factory = vi.fn(() => client as unknown as Client);
  const service = new VerticaService({ ...config, ...options }, factory);
  return { client, factory, service };
}
export function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}
