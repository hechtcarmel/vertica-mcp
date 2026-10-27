# Vertica MCP Server

[![CI](https://github.com/hechtcarmel/vertica-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/hechtcarmel/vertica-mcp/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/@hechtcarmel/vertica-mcp)](https://www.npmjs.com/package/@hechtcarmel/vertica-mcp)

Connect an MCP client to Vertica to query data, inspect table structures, and
explore views and projections. **Read-only by default.** Connections open on first
use and are reused until idle. The server communicates over stdio.

Existing client configurations, environment variable names, tool names, and CLI
aliases continue to work. See [upgrade notes](#upgrading) for deliberate bug fixes
and safety restrictions.

## Quick start

Requires Node.js 20 or later and network access to a Vertica database. Use a
currently supported Node LTS release when possible.

Create an environment file (see [.env.example](.env.example)):

```dotenv
VERTICA_HOST=your-vertica-host
VERTICA_PORT=5433
VERTICA_DATABASE=your_database
VERTICA_USER=readonly_user
VERTICA_PASSWORD=your_password
```

Add it to your MCP client's configuration. This form works in Claude Desktop,
Cursor, and other clients that launch stdio servers:

```json
{
  "mcpServers": {
    "vertica-mcp": {
      "command": "npx",
      "args": [
        "-y",
        "@hechtcarmel/vertica-mcp@latest",
        "--env-file",
        "/absolute/path/to/vertica.env"
      ]
    }
  }
}
```

For Claude Code:

```sh
claude mcp add vertica --scope user -- npx -y @hechtcarmel/vertica-mcp@latest --env-file /absolute/path/to/vertica.env
```

You can also supply `VERTICA_*` variables directly through the client's `env`
configuration. Process environment values take precedence over the environment
file. Without `--env-file`, the server loads `.env` from its working directory.
An explicitly selected file must be readable. `-e`, `-h`/`--help`, and
`-v`/`--version` remain supported; both `vertica-mcp` and the original scoped binary
alias are available after installation.

## Tools

| Tool                  | Arguments                                        | Result                                         |
| --------------------- | ------------------------------------------------ | ---------------------------------------------- |
| `execute_query`       | `sql`, optional `params`                         | Rows, fields, row count, original query        |
| `stream_query`        | `sql`, optional `params`, `batchSize`, `maxRows` | Batches, total rows, counts, truncation status |
| `list_tables`         | optional `schemaName`                            | Tables, types, ownership                       |
| `list_views`          | optional `schemaName`                            | View previews and full definitions             |
| `list_indexes`        | `tableName`, optional `schemaName`               | Vertica projections and their columns          |
| `get_table_structure` | `tableName`, optional `schemaName`               | Columns, nullability, constraints, ownership   |

Names passed to catalog tools are exact names, including case and spaces. Do not
wrap them in SQL quotes. Omitted schemas use `VERTICA_DEFAULT_SCHEMA` (`public`).
All catalog filters use bound parameters.

A parameterized query call:

```json
{
  "sql": "SELECT customer_name FROM public.customers WHERE customer_id = ? LIMIT 10",
  "params": [42]
}
```

The driver uses `?` placeholders. Supply values in order; do not interpolate them
into SQL. Parameters represent values, not table or column identifiers.

INTEGER values within JavaScript’s safe range are numbers; larger 64-bit integers
are decimal strings to preserve precision. Field metadata includes the actual
Vertica type name and ID, plus the wire format.

Results retain the original JSON text in `content` and also provide matching
`structuredContent`. Database and policy failures set MCP `isError: true` and
`success: false`. Discovery and help/version commands do not connect to Vertica.

Input schemas reject unknown argument names, including unsupported pagination or
row-limit options. Use only the declared arguments. Output schemas distinguish
success from failure and describe rows, fields, metadata, counts, and truncation.
`execute_query.rowCount` counts returned result rows, not affected rows for writes;
`list_indexes.indexCount` counts projection-column entries, not distinct projections.

Catalog tools advertise read-only behavior for their fixed queries. Both arbitrary
SQL tools use conservative annotations: functions may have side effects, so the
server does not claim purity, idempotence, or a closed interaction world. This does
not disable the default read-only policy. Their
`_meta["com.hechtcarmel.vertica/readOnlyTransaction"]` reports whether read-only
transactions are configured. See the [tool-contract review](docs/TOOL_CONTRACTS.md).

### Batching large results

```json
{
  "sql": "SELECT customer_id, customer_name FROM public.customers ORDER BY customer_id",
  "batchSize": 1000,
  "maxRows": 10000
}
```

`stream_query` executes a SELECT/WITH query **once**, with a bounded outer LIMIT,
and partitions the result into batches. It accepts queries that already contain
LIMIT/OFFSET and trailing semicolons. `maxRows` is honored even when smaller than
`batchSize`; one extra row detects truncation.

- `batchSize`: 1–10,000; default 1,000.
- `maxRows`: 1–1,000,000. If omitted, defaults to `batchSize × 100`, capped at
  1,000,000.
- `truncated` and top-level `hasMore`: true when additional rows exist.
- `batchCount` and `totalRows`: the batches and rows actually returned.

This tool returns **one MCP response**. It does not stream incremental transport
messages or provide a continuation cursor. Rows are materialized in memory;
limits count rows, not bytes. Use small limits and select only needed columns.
Use ORDER BY for reproducible ordering. `execute_query` remains uncapped for
SQL execution; add LIMIT to large queries.

`list_indexes` retains its legacy name and output fields. Vertica uses projections
rather than traditional indexes; `isUnique` reflects the catalog's
`is_key_constraint_projection` flag, not an independent uniqueness proof.
`list_views.definition` retains its 200-character preview; `fullDefinition` adds
the complete SQL.

## Configuration

Required: `VERTICA_HOST`, `VERTICA_DATABASE`, and `VERTICA_USER`.
`VERTICA_PASSWORD` is optional (for example, when the database uses trust auth).

| Variable                          | Default   | Meaning                                                                       |
| --------------------------------- | --------- | ----------------------------------------------------------------------------- |
| `VERTICA_PORT`                    | `5433`    | TCP port, 1–65535                                                             |
| `VERTICA_READONLY_MODE`           | `true`    | Read-only query policy and transactions                                       |
| `VERTICA_QUERY_TIMEOUT`           | `60000`   | Connection and query timeout in ms; 1000–300000                               |
| `VERTICA_IDLE_TIMEOUT`            | `3600000` | Idle disconnect in ms; 60000–86400000                                         |
| `VERTICA_SSL`                     | `false`   | Require encrypted TLS when enabled                                            |
| `VERTICA_SSL_REJECT_UNAUTHORIZED` | `true`    | Validate certificate and hostname when TLS is enabled                         |
| `VERTICA_DEFAULT_SCHEMA`          | `public`  | Default schema for catalog tools                                              |
| `VERTICA_CONNECTION_LOAD_BALANCE` | `false`   | Try a cluster-directed node on first connect                                  |
| `VERTICA_DEBUG` or `DEBUG`        | unset     | Set to `true` for configuration diagnostics on stderr; passwords are redacted |

Boolean options accept `true`, `false`, `1`, and `0` (case-insensitive). Invalid
values fail configuration validation.

When `VERTICA_SSL=true`, the actual Vertica driver's `verify-full` mode checks
both the certificate chain and hostname. Use `NODE_EXTRA_CA_CERTS` for a private
CA. With `VERTICA_SSL_REJECT_UNAUTHORIZED=false`, TLS remains required but peer
verification is disabled (`require` mode). SSL remains off by default for existing
installations.

Load balancing uses `DESCRIBE_LOAD_BALANCE_DECISION` and only replaces the initial
connection after successfully connecting to the selected IP. IPv4 and IPv6 are
supported. If routing fails, the original connection remains usable. Redirects
must be reachable; verified TLS must also accept the selected node's IP.

## Read-only behavior

Read-only mode permits a single SELECT, SHOW, DESCRIBE, EXPLAIN, or read-only WITH
statement. It rejects stacked statements, write-capable CTEs, SELECT INTO, and
EXPLAIN of writes. Leading comments, quoted values/identifiers, and trailing
semicolons are handled. Each query runs in a Vertica read-only transaction that is
rolled back after the result is obtained. Failed rollback invalidates the client.

The statement guard is deliberately conservative. It can reject unusual valid SQL,
including unquoted mutation keywords and ambiguous backslash escapes. Use quoted
identifiers and bound values. It is not a full SQL parser or a sandbox for arbitrary
functions. Vertica read-only transactions do not prevent every possible function
side effect or disk write. Use a dedicated least-privilege account with SELECT and
schema USAGE access, and avoid privileged administrative or user-defined functions.
Treat query results as untrusted data.

To explicitly enable writes:

```dotenv
VERTICA_READONLY_MODE=false
```

`execute_query` then accepts one write statement per call. `stream_query` remains
SELECT/WITH-only. Errors and timeouts never automatically replay SQL. Cancellation
or timeout closes the affected connection to stop driver work; after an interrupted
write, its outcome can be uncertain. Check database state before retrying a write.

## Upgrading

The npm package name, both binary aliases, flags, environment variables, six tools,
argument names, and JSON text fields are retained. Node 20+ is now required. Intentional
corrections are listed in [CHANGELOG.md](CHANGELOG.md):

- String `false` now means false for every Boolean setting; typos are rejected.
- TLS settings now configure the driver's actual TLS modes.
- SQL policy closes prefix-check bypasses; scripts need separate calls.
- Failed tool calls now have the MCP error flag.
- Batched queries run once, honor limits, and report truncation explicitly.

This version uses the current stable [MCP TypeScript SDK v2](https://github.com/modelcontextprotocol/typescript-sdk)
and explicitly serves the 2026-07-28 protocol through the SDK's `serveStdio` entry
point. Older clients using the initialize handshake also work. **The minimum Node
version is now 20**; use Node 24 LTS for development. Existing environment files
and the read-only default remain supported. No HTTP transport or network listener
is introduced.

## Releases and local validation

See the [release process](docs/RELEASING.md) for versioning, draft GitHub releases,
checksummed artifacts, and separately authorized npm publishing with provenance.
Before merge, use the [dedicated Mac read-only handoff](docs/LOCAL_VALIDATION.md)
with the passing CI artifact and existing environment files. Never run aggregate,
mock, rejection, or write-path suites during that real local validation.

## Development and troubleshooting

See [CONTRIBUTING.md](CONTRIBUTING.md) for setup, checks, architecture, package
validation, and opt-in database integration tests.

- Connection failures: verify host, port, credentials, network reachability, and
  TLS trust. Test with `vsql` using the same account.
- Permission failures: grant only needed schema/table access. Catalog discovery
  only reports objects visible to the configured account.
- Timeouts: optimize the query or raise `VERTICA_QUERY_TIMEOUT` within its range.
  Timed-out clients are closed and a future call opens a new connection.
- Large output: add LIMIT or use a small `stream_query.maxRows`; client message
  size limits can be reached before the row cap.
- Stdio failures: stdout is reserved for MCP. Server diagnostics go to stderr.
  Configure an absolute environment-file path and check the client's server logs.

## License and acknowledgments

[MIT](LICENSE). The original project drew on
[mcp-vertica](https://github.com/nolleh/mcp-vertica) by
[@nolleh](https://github.com/nolleh).
