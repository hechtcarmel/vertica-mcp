import { accessSync, constants, realpathSync } from "node:fs";
import { parseArgs } from "node:util";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";
import console from "node:console";

const hints = {
  unsupported_platform: "Run only in the separately authorized Mac task.",
  invalid_arguments:
    "Use the isolated server path, existing env-file path, and modern or legacy protocol. Catalog reads require an existing schema.",
  missing_local_file:
    "Verify the existing file paths locally, including symlink targets. Do not copy connection files.",
  local_access_denied:
    "The existing local files are inaccessible. Stop; do not change permissions.",
  local_dependency_missing:
    "Verify the isolated candidate and pinned harness installation. Do not replace global packages.",
  invalid_configuration:
    "Check the existing profile's supported option names and value formats locally. Do not print its contents.",
  connection_refused:
    "Check that the existing endpoint is reachable from the Mac. Do not expand network access.",
  host_resolution:
    "Check the existing hostname and current DNS/VPN availability locally. Do not change network policy.",
  timeout:
    "The current stage timed out. Check existing connectivity and the local candidate process before retrying.",
  tls_validation:
    "Check the existing TLS configuration and CA availability locally. Do not disable verification or change trust settings.",
  authentication:
    "Check the existing profile's credentials locally. Do not print, copy, or upload them.",
  database_permission:
    "The existing account lacks access for this read. Stop or skip optional catalog checks; do not grant permissions.",
  database_compatibility:
    "The database rejected a supported read or transaction operation. Report this category and stage; keep the raw error local.",
  protocol_compatibility:
    "Check that the isolated candidate and pinned MCP harness versions match the verified artifact.",
  server_connection_closed:
    "The candidate exited or closed its transport. Check the isolated installation locally; do not upload server stderr.",
  readonly_mode_not_confirmed:
    "Read-only mode was not confirmed. Stop validation without changing the existing profile.",
  invalid_response:
    "The candidate returned an invalid MCP/tool response. Report this category and stage without the payload.",
  unexpected_result:
    "A fixed safe-read check returned an unexpected value. Report the stage without result rows.",
  unexpected_failure:
    "Report the stage and category to the coordinator. Keep raw errors, credentials, and results local.",
};
const stages = new Set([
  "initialization",
  "connect",
  "tool_discovery",
  "constant_read",
  "parameter_binding",
  "integer_precision",
  "readonly_status",
  "bounded_batching",
  "catalog_tables",
  "catalog_views",
  "catalog_columns",
  "catalog_constraints",
  "catalog_projections",
  "shutdown",
]);

export class ValidationFailure extends Error {
  constructor(stage, category) {
    const safeStage = stages.has(stage) ? stage : "initialization";
    const safeCategory = Object.hasOwn(hints, category)
      ? category
      : "unexpected_failure";
    super(`${safeStage}: ${safeCategory}`);
    this.name = "ValidationFailure";
    this.stage = safeStage;
    this.category = safeCategory;
  }
}

/** Classify privately; never return raw messages, codes, paths, or payloads. */
export function classifyFailure(error) {
  const code = typeof error?.code === "string" ? error.code.toUpperCase() : "";
  const message =
    typeof error === "string"
      ? error
      : typeof error?.message === "string"
        ? error.message
        : "";
  if (["ENOENT", "ENOTDIR"].includes(code)) return "missing_local_file";
  if (["EACCES", "EPERM"].includes(code)) return "local_access_denied";
  if (
    code === "ERR_MODULE_NOT_FOUND" ||
    /cannot find (?:package|module)/i.test(message)
  )
    return "local_dependency_missing";
  if (code.startsWith("ERR_PARSE_ARGS")) return "invalid_arguments";
  if (
    /invalid database configuration|missing required environment variables|cannot read environment file/i.test(
      message,
    )
  )
    return "invalid_configuration";
  if (
    code === "ECONNREFUSED" ||
    /\bECONNREFUSED\b|connection refused/i.test(message)
  )
    return "connection_refused";
  if (
    ["ENOTFOUND", "EAI_AGAIN"].includes(code) ||
    /\b(?:ENOTFOUND|EAI_AGAIN)\b/.test(message)
  )
    return "host_resolution";
  if (/TLS|CERT|SSL/.test(code) || /certificate|\bTLS\b|\bSSL\b/i.test(message))
    return "tls_validation";
  if (
    code.startsWith("28") ||
    /authentication failed|password authentication|invalid credentials|authentication failure/i.test(
      message,
    )
  )
    return "authentication";
  if (
    code === "42501" ||
    /permission denied|insufficient privilege|not authorized/i.test(message)
  )
    return "database_permission";
  if (
    error?.code === -32601 ||
    /protocol version|era negotiation|invalidresult|invalid json|parse error/i.test(
      message,
    )
  )
    return "protocol_compatibility";
  if (
    code === "42601" ||
    code === "0A000" ||
    /syntax error|not supported|unsupported (?:statement|operation)/i.test(
      message,
    )
  )
    return "database_compatibility";
  if (code === "ETIMEDOUT" || /timed?\s*out|timeout/i.test(message))
    return "timeout";
  if (
    error?.code === -32000 ||
    /connection closed|transport.*closed|server.*exit/i.test(message)
  )
    return "server_connection_closed";
  return "unexpected_failure";
}

export function failureReport(error) {
  const failure =
    error instanceof ValidationFailure
      ? new ValidationFailure(error.stage, error.category)
      : new ValidationFailure("initialization", classifyFailure(error));
  return {
    event: "failure",
    success: false,
    stage: failure.stage,
    category: failure.category,
    hint: hints[failure.category],
  };
}

async function atStage(stage, operation, options = {}) {
  options.onStage?.({ event: "stage", stage, status: "started" });
  try {
    const value = await operation();
    options.onStage?.({ event: "stage", stage, status: "passed" });
    return value;
  } catch (error) {
    let category =
      error instanceof ValidationFailure
        ? error.category
        : classifyFailure(error);
    if (
      stage === "connect" &&
      ["unexpected_failure", "server_connection_closed"].includes(category)
    ) {
      const startupCategory = options.startupCategory?.();
      if (Object.hasOwn(hints, startupCategory)) category = startupCategory;
    }
    const failure = new ValidationFailure(stage, category);
    options.onStage?.({
      ...failureReport(failure),
      event: "stage",
      status: "failed",
    });
    // Discard raw database errors and causes rather than exposing them in diagnostics.
    throw failure;
  }
}

function content(response, stage) {
  let result = response.structuredContent;
  if (!result) {
    const text = response.content?.find((item) => item.type === "text")?.text;
    try {
      result = JSON.parse(text);
    } catch {
      throw new ValidationFailure(
        stage,
        response.isError ? classifyFailure(text) : "invalid_response",
      );
    }
  }
  if (response.isError || result?.success === false)
    throw new ValidationFailure(stage, classifyFailure(result?.error));
  if (!result || result.success !== true)
    throw new ValidationFailure(stage, "invalid_response");
  return result;
}

/** Dedicated safe reads only. Do not add mutation, rejection, mock, or write-path tests here. */
export async function runReadOnlySmoke(client, options = {}) {
  if (options.catalogs && !options.schemaName)
    throw new ValidationFailure("initialization", "invalid_arguments");
  const checks = [];
  await atStage(
    "tool_discovery",
    async () => {
      const tools = (await client.listTools()).tools;
      const queryNames = ["execute_query", "stream_query"];
      const catalogNames = [
        "list_tables",
        "list_views",
        "list_indexes",
        "get_table_structure",
      ];
      const byName = new Map((tools ?? []).map((tool) => [tool.name, tool]));
      const readonlyTransactions = queryNames.every(
        (name) =>
          byName.get(name)?._meta?.[
            "com.hechtcarmel.vertica/readOnlyTransaction"
          ] === true,
      );
      const readonlyCatalogs = catalogNames.every(
        (name) => byName.get(name)?.annotations?.readOnlyHint === true,
      );
      if (
        tools?.length !== 6 ||
        byName.size !== 6 ||
        !readonlyTransactions ||
        !readonlyCatalogs
      ) {
        throw new ValidationFailure(
          "tool_discovery",
          "readonly_mode_not_confirmed",
        );
      }
      checks.push("tool discovery and read-only transaction configuration");
    },
    options,
  );
  const read = (stage, name, args, verify, check) =>
    atStage(
      stage,
      async () => {
        const result = content(
          await client.callTool({ name, arguments: args }, { timeout: 30000 }),
          stage,
        );
        if (verify && !verify(result))
          throw new ValidationFailure(
            stage,
            stage === "readonly_status"
              ? "readonly_mode_not_confirmed"
              : "unexpected_result",
          );
        if (check) checks.push(check);
        return result;
      },
      options,
    );
  await read(
    "constant_read",
    "execute_query",
    { sql: "SELECT 1 AS mcp_smoke_check LIMIT 1" },
    (result) => result.rows?.[0]?.mcp_smoke_check === 1,
    "bounded constant read",
  );
  await read(
    "parameter_binding",
    "execute_query",
    { sql: "SELECT ?::INT AS bound_value LIMIT 1", params: [42] },
    (result) => result.rows?.[0]?.bound_value === 42,
    "bound parameter read",
  );
  await read(
    "integer_precision",
    "execute_query",
    { sql: "SELECT 9223372036854775807::INT AS big_value LIMIT 1" },
    (result) => result.rows?.[0]?.big_value === "9223372036854775807",
    "lossless integer read",
  );
  await read(
    "readonly_status",
    "execute_query",
    { sql: "SHOW TRANSACTION_READ_ONLY" },
    (result) => String(result.rows?.[0]?.setting).toLowerCase() === "true",
    "read-only transaction status read",
  );
  await read(
    "bounded_batching",
    "stream_query",
    {
      sql: "SELECT 1 AS n UNION ALL SELECT 2 UNION ALL SELECT 3 ORDER BY n",
      batchSize: 1,
      maxRows: 2,
    },
    (result) => result.totalRows === 2 && result.truncated === true,
    "bounded constant batching read",
  );
  if (options.catalogs) {
    const tables = await read("catalog_tables", "execute_query", {
      sql: "SELECT table_name FROM v_catalog.tables WHERE table_schema = ? ORDER BY table_name LIMIT 1",
      params: [options.schemaName],
    });
    await read("catalog_views", "execute_query", {
      sql: "SELECT table_name FROM v_catalog.views WHERE table_schema = ? ORDER BY table_name LIMIT 5",
      params: [options.schemaName],
    });
    checks.push("bounded existing catalog reads");
    const tableName = options.tableName ?? tables.rows?.[0]?.table_name;
    if (tableName) {
      await read("catalog_columns", "execute_query", {
        sql: "SELECT column_name, data_type, is_nullable FROM v_catalog.columns WHERE table_schema = ? AND table_name = ? ORDER BY ordinal_position LIMIT 10",
        params: [options.schemaName, tableName],
      });
      await read("catalog_constraints", "execute_query", {
        sql: "SELECT constraint_name, constraint_type FROM v_catalog.constraint_columns WHERE table_schema = ? AND table_name = ? ORDER BY constraint_name LIMIT 10",
        params: [options.schemaName, tableName],
      });
      await read("catalog_projections", "execute_query", {
        sql: "SELECT p.projection_name FROM v_catalog.projections p JOIN v_catalog.tables t ON p.anchor_table_id = t.table_id WHERE t.table_schema = ? AND t.table_name = ? ORDER BY p.projection_name LIMIT 5",
        params: [options.schemaName, tableName],
      });
      checks.push("bounded existing column, constraint and projection reads");
    }
  }
  return checks;
}

export async function validateSession(client, transport, options = {}) {
  let checks;
  let protocol;
  let failure;
  try {
    await atStage(
      "connect",
      async () => {
        await client.connect(transport, { timeout: 30000 });
        protocol = client.getProtocolEra();
        if (
          !["modern", "legacy"].includes(protocol) ||
          (options.expectedProtocol && protocol !== options.expectedProtocol)
        ) {
          throw new ValidationFailure("connect", "protocol_compatibility");
        }
      },
      options,
    );
    checks = await runReadOnlySmoke(client, options);
  } catch (error) {
    failure = error;
  }
  try {
    await atStage("shutdown", () => client.close(), options);
  } catch (error) {
    failure ??= error;
  }
  if (failure) throw failure;
  return { success: true, protocol, checks };
}

/** Resolve aliases such as macOS /tmp -> /private/tmp before comparing paths. */
export function isDirectExecution(moduleUrl, entryPath) {
  if (!entryPath) return false;
  try {
    return (
      realpathSync(resolve(entryPath)) ===
      realpathSync(fileURLToPath(moduleUrl))
    );
  } catch {
    return false;
  }
}

async function main() {
  const onStage = (report) => console.error(JSON.stringify(report));
  const setup = await atStage(
    "initialization",
    async () => {
      if (process.platform !== "darwin")
        throw new ValidationFailure("initialization", "unsupported_platform");
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
      if (
        !values.server ||
        !values["env-file"] ||
        !["legacy", "modern"].includes(values.protocol) ||
        (values.catalogs && !values.schema)
      ) {
        throw new ValidationFailure("initialization", "invalid_arguments");
      }
      accessSync(resolve(values.server), constants.R_OK);
      accessSync(resolve(values["env-file"]), constants.R_OK);
      // Load dependencies inside the sanitized initialization stage as well.
      const [{ Client }, { StdioClientTransport, getDefaultEnvironment }] =
        await Promise.all([
          import("@modelcontextprotocol/client"),
          import("@modelcontextprotocol/client/stdio"),
        ]);
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
        stderr: "pipe",
      });
      // Retain only an allowlisted category from private stderr, never its contents.
      let startupCategory;
      transport.stderr?.on("data", (chunk) => {
        const category = classifyFailure(chunk.toString());
        if (category !== "unexpected_failure") startupCategory = category;
      });
      const client = new Client(
        { name: "vertica-mcp-local-readonly-validation", version: "1" },
        {
          versionNegotiation: {
            mode:
              values.protocol === "modern" ? { pin: "2026-07-28" } : "legacy",
            probe: { timeoutMs: 30000, maxRetries: 0 },
          },
        },
      );
      return {
        values,
        client,
        transport,
        startupCategory: () => startupCategory,
      };
    },
    { onStage },
  );
  const { values } = setup;
  const result = await validateSession(setup.client, setup.transport, {
    onStage,
    startupCategory: setup.startupCategory,
    expectedProtocol: values.protocol,
    catalogs: values.catalogs,
    schemaName: values.schema,
    tableName: values.table,
  });
  console.log(JSON.stringify({ event: "complete", ...result }, null, 2));
}

if (isDirectExecution(import.meta.url, process.argv[1])) {
  main().catch((error) => {
    console.error(JSON.stringify(failureReport(error)));
    process.exitCode = 1;
  });
}
