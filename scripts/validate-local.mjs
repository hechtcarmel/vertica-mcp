import { Client } from "@modelcontextprotocol/client";
import {
  StdioClientTransport,
  getDefaultEnvironment,
} from "@modelcontextprotocol/client/stdio";
import { parseArgs } from "node:util";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import process from "node:process";
import console from "node:console";

function content(response) {
  if (response.isError)
    throw new Error(
      "The read-only smoke operation failed; inspect the failure only in the authorized local task",
    );
  const result =
    response.structuredContent ??
    JSON.parse(response.content.find((item) => item.type === "text").text);
  if (result.success !== true)
    throw new Error("The read-only smoke operation was unsuccessful");
  return result;
}

/** Dedicated safe reads only. Do not add mutation, rejection, mock, or write-path tests here. */
export async function runReadOnlySmoke(client, options = {}) {
  const checks = [];
  const tools = (await client.listTools()).tools;
  if (
    tools.length !== 6 ||
    !tools.every((tool) => tool.annotations?.readOnlyHint === true)
  ) {
    throw new Error(
      "Refusing database access: the candidate must advertise read-only tools",
    );
  }
  const call = async (name, args) =>
    content(
      await client.callTool({ name, arguments: args }, { timeout: 30000 }),
    );
  checks.push("tool discovery and read-only annotations");
  const one = await call("execute_query", {
    sql: "SELECT 1 AS mcp_smoke_check LIMIT 1",
  });
  if (one.rows[0]?.mcp_smoke_check !== 1)
    throw new Error("Read-only constant query returned an unexpected value");
  checks.push("bounded constant read");
  const bound = await call("execute_query", {
    sql: "SELECT ?::INT AS bound_value LIMIT 1",
    params: [42],
  });
  if (bound.rows[0]?.bound_value !== 42)
    throw new Error("Parameter binding check failed");
  checks.push("bound parameter read");
  const big = await call("execute_query", {
    sql: "SELECT 9223372036854775807::INT AS big_value LIMIT 1",
  });
  if (big.rows[0]?.big_value !== "9223372036854775807")
    throw new Error("Integer precision check failed");
  checks.push("lossless integer read");
  const readonly = await call("execute_query", {
    sql: "SHOW TRANSACTION_READ_ONLY",
  });
  if (String(readonly.rows[0]?.setting).toLowerCase() !== "true")
    throw new Error("The database transaction must be read-only");
  checks.push("read-only transaction status read");
  const batches = await call("stream_query", {
    sql: "SELECT 1 AS n UNION ALL SELECT 2 UNION ALL SELECT 3 ORDER BY n",
    batchSize: 1,
    maxRows: 2,
  });
  if (batches.totalRows !== 2 || batches.truncated !== true)
    throw new Error("Bounded batching check failed");
  checks.push("bounded constant batching read");
  if (options.catalogs) {
    if (!options.schemaName)
      throw new Error(
        "Catalog reads require an explicitly selected existing schema",
      );
    const tables = await call("execute_query", {
      sql: "SELECT table_name FROM v_catalog.tables WHERE table_schema = ? ORDER BY table_name LIMIT 1",
      params: [options.schemaName],
    });
    await call("execute_query", {
      sql: "SELECT table_name FROM v_catalog.views WHERE table_schema = ? ORDER BY table_name LIMIT 5",
      params: [options.schemaName],
    });
    checks.push("bounded existing catalog reads");
    const tableName = options.tableName ?? tables.rows[0]?.table_name;
    if (tableName) {
      await call("execute_query", {
        sql: "SELECT column_name, data_type, is_nullable FROM v_catalog.columns WHERE table_schema = ? AND table_name = ? ORDER BY ordinal_position LIMIT 10",
        params: [options.schemaName, tableName],
      });
      await call("execute_query", {
        sql: "SELECT constraint_name, constraint_type FROM v_catalog.constraint_columns WHERE table_schema = ? AND table_name = ? ORDER BY constraint_name LIMIT 10",
        params: [options.schemaName, tableName],
      });
      await call("execute_query", {
        sql: "SELECT p.projection_name FROM v_catalog.projections p JOIN v_catalog.tables t ON p.anchor_table_id = t.table_id WHERE t.table_schema = ? AND t.table_name = ? ORDER BY p.projection_name LIMIT 5",
        params: [options.schemaName, tableName],
      });
      checks.push("bounded existing column, constraint and projection reads");
    }
  }
  return checks;
}

async function main() {
  // Never connect from this cloud task or a non-Mac executor.
  if (process.platform !== "darwin")
    throw new Error(
      "This dedicated validation command runs only on the authorized Mac executor",
    );
  const { values } = parseArgs({
    options: {
      server: { type: "string" },
      "env-file": { type: "string" },
      catalogs: { type: "boolean", default: false },
      schema: { type: "string" },
      table: { type: "string" },
      protocol: { type: "string", default: "modern" },
    },
  });
  if (!values.server || !values["env-file"])
    throw new Error(
      "An isolated server entry point and existing environment-file path are required",
    );
  if (!["legacy", "modern"].includes(values.protocol))
    throw new Error("Protocol must be legacy or modern");
  const inherited = Object.fromEntries(
    Object.entries(process.env).filter(
      ([key, value]) =>
        value !== undefined &&
        (key.startsWith("VERTICA_") || key === "NODE_EXTRA_CA_CERTS"),
    ),
  );
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [resolve(values.server), "-e", resolve(values["env-file"])],
    env: {
      ...getDefaultEnvironment(),
      ...inherited,
      VERTICA_READONLY_MODE: "true",
      VERTICA_DEBUG: "false",
      DEBUG: "false",
    },
    stderr: "pipe", // Never print connection details or credentials into the handoff.
  });
  transport.stderr?.resume();
  const client = new Client(
    { name: "vertica-mcp-local-readonly-validation", version: "1" },
    {
      versionNegotiation: {
        mode: values.protocol === "modern" ? { pin: "2026-07-28" } : "legacy",
      },
    },
  );
  try {
    await client.connect(transport);
    const checks = await runReadOnlySmoke(client, {
      catalogs: values.catalogs,
      schemaName: values.schema,
      tableName: values.table,
    });
    console.log(
      JSON.stringify(
        { success: true, protocol: client.getProtocolEra(), checks },
        null,
        2,
      ),
    );
  } finally {
    await client.close();
  }
}

if (
  process.argv[1] &&
  pathToFileURL(resolve(process.argv[1])).href === import.meta.url
) {
  main().catch(() => {
    console.error(
      "Read-only Mac validation failed. Investigate only in the authorized local task; do not upload credentials or raw database errors.",
    );
    process.exitCode = 1;
  });
}
