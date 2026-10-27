import { describe, it, expect, vi } from "vitest";
import {
  loadDatabaseConfig,
  getDatabaseConfig,
} from "../../src/config/database.js";
const env = {
  VERTICA_HOST: "localhost",
  VERTICA_DATABASE: "db",
  VERTICA_USER: "user",
};
describe("configuration compatibility", () => {
  it("preserves all legacy defaults", () => {
    expect(loadDatabaseConfig(env)).toEqual({
      host: "localhost",
      database: "db",
      user: "user",
      port: 5433,
      queryTimeout: 60000,
      idleTimeout: 3600000,
      ssl: false,
      sslRejectUnauthorized: true,
      readonlyMode: true,
      defaultSchema: "public",
      connectionLoadBalance: false,
    });
  });
  it.each([
    "VERTICA_READONLY_MODE",
    "VERTICA_SSL",
    "VERTICA_SSL_REJECT_UNAUTHORIZED",
    "VERTICA_CONNECTION_LOAD_BALANCE",
  ])("parses %s consistently", (key) => {
    const property = {
      VERTICA_READONLY_MODE: "readonlyMode",
      VERTICA_SSL: "ssl",
      VERTICA_SSL_REJECT_UNAUTHORIZED: "sslRejectUnauthorized",
      VERTICA_CONNECTION_LOAD_BALANCE: "connectionLoadBalance",
    }[key]!;
    for (const value of ["false", "0", "FALSE", " false "])
      expect(loadDatabaseConfig({ ...env, [key]: value })).toHaveProperty(
        property,
        false,
      );
    for (const value of ["true", "1", "TRUE"])
      expect(loadDatabaseConfig({ ...env, [key]: value })).toHaveProperty(
        property,
        true,
      );
    expect(() => loadDatabaseConfig({ ...env, [key]: "typo" })).toThrow(
      "Invalid database configuration",
    );
  });
  it.each(["VERTICA_HOST", "VERTICA_DATABASE", "VERTICA_USER"])(
    "requires %s",
    (key) => {
      expect(() => loadDatabaseConfig({ ...env, [key]: "" })).toThrow(
        "required",
      );
    },
  );
  it.each([
    ["VERTICA_PORT", "0"],
    ["VERTICA_PORT", "65536"],
    ["VERTICA_PORT", "bad"],
    ["VERTICA_QUERY_TIMEOUT", "999"],
    ["VERTICA_QUERY_TIMEOUT", "300001"],
    ["VERTICA_IDLE_TIMEOUT", "59999"],
    ["VERTICA_IDLE_TIMEOUT", "86400001"],
    ["VERTICA_DEFAULT_SCHEMA", ""],
  ])("rejects invalid %s=%s", (key, value) =>
    expect(() => loadDatabaseConfig({ ...env, [key]: value })).toThrow(),
  );
  it("accepts existing optional environment settings", () => {
    expect(
      loadDatabaseConfig({
        ...env,
        VERTICA_PORT: "5555",
        VERTICA_PASSWORD: "p",
        VERTICA_DEFAULT_SCHEMA: "Mixed Case",
        VERTICA_READONLY_MODE: "false",
      }),
    ).toMatchObject({
      port: 5555,
      password: "p",
      defaultSchema: "Mixed Case",
      readonlyMode: false,
    });
  });
  it("redacts passwords in debug logging", () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    loadDatabaseConfig({
      ...env,
      VERTICA_PASSWORD: "do-not-log",
      VERTICA_DEBUG: "true",
    });
    expect(JSON.stringify(log.mock.calls)).not.toContain("do-not-log");
    expect(log).toHaveBeenCalled();
  });
  it("reports missing required variables using the legacy helper", () => {
    vi.stubEnv("VERTICA_HOST", "");
    vi.stubEnv("VERTICA_DATABASE", "");
    vi.stubEnv("VERTICA_USER", "");
    expect(getDatabaseConfig).toThrow("Missing required environment variables");
    vi.unstubAllEnvs();
  });
});
