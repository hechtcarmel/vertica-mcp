import { test } from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { spawnSync } from "node:child_process";
import process from "node:process";
import { URL, fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";
import { InMemoryTransport } from "@modelcontextprotocol/client";
import { createServer } from "../../dist/server.js";
import { VerticaService } from "../../dist/services/vertica-service.js";
import { ConnectionManager } from "../../dist/services/connection-manager.js";

const config = {
  host: "localhost",
  port: 5433,
  database: "test",
  user: "test",
  readonlyMode: true,
};
const empty = { rows: [], rowCount: 0, fields: [], command: "SELECT" };
const entry = fileURLToPath(new URL("../../dist/index.js", import.meta.url));

function database(options = {}) {
  const driver = new EventEmitter();
  const calls = [];
  let connects = 0;
  let ends = 0;
  driver.setTypeParser = () => {};
  driver.connect = async () => {
    connects++;
  };
  driver.end = async () => {
    ends++;
  };
  driver.query = async (sql, params) => {
    calls.push([sql, params]);
    return empty;
  };
  const service = new VerticaService({ ...config, ...options }, () => driver);
  return { driver, service, calls, connects: () => connects, ends: () => ends };
}

test("compiled server initializes lazily and preserves all six tools", async (t) => {
  const db = database();
  const manager = new ConnectionManager(config, () => db.service);
  const server = createServer(config, manager);
  const client = new Client({ name: "runtime-compatibility", version: "1" });
  t.after(async () => {
    await client.close();
    await server.close();
  });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await server.connect(b);
  await client.connect(a);
  assert.equal((await client.listTools()).tools.length, 6);
  assert.equal(db.connects(), 0);
  const rejected = await client.callTool({
    name: "execute_query",
    arguments: { sql: "SELECT 1; DELETE FROM t" },
  });
  assert.equal(rejected.isError, true);
  assert.equal(db.connects(), 0);
  const response = await client.callTool({
    name: "execute_query",
    arguments: { sql: "SELECT ?", params: [42] },
  });
  assert.equal(response.isError, false);
  assert.deepEqual(
    JSON.parse(response.content[0].text),
    response.structuredContent,
  );
  assert.deepEqual(
    db.calls.map(([sql]) => sql),
    ["START TRANSACTION READ ONLY", "SELECT ?", "ROLLBACK"],
  );
  assert.deepEqual(db.calls[1][1], [42]);
});

test("compiled read-only policy blocks CTE writes before driver connection", async () => {
  const db = database();
  await assert.rejects(
    db.service.executeQuery("WITH c AS (SELECT 1) DELETE FROM t"),
    /readonly/,
  );
  assert.equal(db.connects(), 0);
});

test("compiled service respects explicit write mode without replay", async () => {
  const db = database({ readonlyMode: false });
  await db.service.executeQuery("INSERT INTO t VALUES (?)", [1]);
  assert.deepEqual(db.calls, [["INSERT INTO t VALUES (?)", [1]]]);
  await db.service.disconnect();
  assert.equal(db.ends(), 1);
});

test("compiled batching executes once and observes maxRows", async () => {
  const db = database();
  db.driver.query = async (sql) => {
    db.calls.push([sql]);
    return sql.startsWith("SELECT * FROM (")
      ? { ...empty, rows: [{ n: 1 }, { n: 2 }, { n: 3 }], rowCount: 3 }
      : empty;
  };
  const batches = [];
  for await (const batch of db.service.streamQuery("SELECT n FROM t;", {
    batchSize: 5,
    maxRows: 2,
  }))
    batches.push(batch);
  assert.equal(batches.length, 1);
  assert.equal(batches[0].batch.length, 2);
  assert.equal(batches[0].hasMore, true);
  assert.equal(
    db.calls.filter(([sql]) => sql.startsWith("SELECT * FROM (")).length,
    1,
  );
  await db.service.disconnect();
});

test("compiled leases recover failures and reject work after shutdown", async () => {
  const db = database();
  const manager = new ConnectionManager(config, () => db.service);
  await assert.rejects(
    manager.withConnection(async () => {
      throw new Error("failed");
    }),
    /failed/,
  );
  assert.equal(await manager.withConnection(async () => 42), 42);
  await manager.disconnect();
  await assert.rejects(
    manager.withConnection(async () => 0),
    /closed/,
  );
  assert.equal(db.ends(), 1);
});

test("compiled CLI exposes its existing aliases", () => {
  for (const flag of ["--help", "-h", "--version", "-v"]) {
    const child = spawnSync(process.execPath, [entry, flag], {
      encoding: "utf8",
      timeout: 5000,
    });
    assert.equal(child.error, undefined);
    assert.equal(child.status, 0);
    assert.ok(child.stdout.trim());
  }
});

for (const mode of ["legacy", "modern"]) {
  test(`compiled CLI completes a ${mode} stdio exchange without database access`, async (t) => {
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [entry],
      env: {
        VERTICA_HOST: "localhost",
        VERTICA_DATABASE: "test",
        VERTICA_USER: "test",
      },
      stderr: "pipe",
    });
    const client = new Client(
      { name: "runtime-stdio", version: "1" },
      {
        versionNegotiation: {
          mode: mode === "modern" ? { pin: "2026-07-28" } : "legacy",
        },
      },
    );
    t.after(async () => client.close());
    await client.connect(transport);
    assert.equal(client.getProtocolEra(), mode);
    assert.equal((await client.listTools()).tools.length, 6);
    const response = await client.callTool({
      name: "execute_query",
      arguments: { sql: "DROP TABLE t" },
    });
    assert.equal(response.isError, true);
  });
}
