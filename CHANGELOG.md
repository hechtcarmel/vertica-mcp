# Changelog

## Unreleased

## [2.0.0]

### Modernization

- Update to current stable MCP SDK v2 and Zod 4; use high-level tool
  registration with one schema per input, validated structured results, annotations,
  and proper MCP error flags. Preserve older protocol negotiation and JSON text.
- Separate CLI startup, server creation, connection leases, and the typed Vertica
  driver boundary. Remove process-wide singleton state and duplicate tool classes.
- Serialize database work; connect lazily, recover failed/idle clients, keep active
  operations alive through the idle window, and close on cancellation or timeout.
  Shut down on stdin EOF, SIGINT, or SIGTERM with a bounded cleanup deadline.
- Preserve optional load balancing, bind the client IP, handle IPv6, and keep the
  initial connection if the redirect fails.
- Fix actual Vertica TLS settings: `VERTICA_SSL=true` uses `verify-full` by default;
  disabling certificate validation uses encrypted `require` mode.
- Read actual table constraints, fix native Boolean nullability, query projections
  through their anchor table, accept exact catalog names with spaces, and expose
  `fullDefinition` alongside the existing 200-character view preview.
- Replace Jest/ts-jest with ESM-native Vitest; add protocol and subprocess CLI tests,
  lifecycle and SQL regression tests, opt-in database tests, coverage gates, real
  ESLint, formatting, strict NodeNext source/test type checks, and a pinned lockfile.
- Add GitHub Actions quality, Linux/Windows runtime compatibility, production
  dependency audit, tarball install checks, and Dependabot updates.
- Rewrite setup, configuration, safety, batching, troubleshooting, and contributor
  documentation. Preserve environment files, variable names, binary aliases, and flags.

- Prepare version 2.0.0 with a checksummed pre-merge CI bundle and a dedicated
  Mac-only safe-read validator that preserves existing connection files.
- Add a manual draft-first release workflow with tag/version/changelog checks,
  digest verification against the locally accepted artifact, and separately
  requested npm OIDC/provenance publication. No account or repository security
  settings are changed.

- Fix the Mac validator entry check for symlinked file/directory paths, including
  `/tmp` and `/private/tmp`.
- Add incremental safe stage diagnostics, allowlisted failure categories and
  static hints without exposing errors, stderr, credentials or result rows.
  Preserve the original failure if cleanup also fails. The safe-read query set
  and read-only restrictions are unchanged.
- Cover the reported Node 24.3.0 runtime in CI.

### Deliberate behavior corrections

- Read-only mode rejects stacked statements, write-capable CTEs, SELECT INTO,
  EXPLAIN of writes, and malformed/ambiguous SQL. Queries also run inside a database
  read-only transaction. The conservative guard can reject unusual valid SQL;
  quoted identifiers and bound values avoid keyword ambiguity. It does not prove
  that every function is side-effect free; database privileges remain necessary.
- Each tool call accepts one statement, including with writes explicitly enabled.
  Multi-statement scripts should be split into individual calls.
- All Boolean settings parse `true`/`false`/`1`/`0` consistently and reject typos.
  Existing configurations containing `VERTICA_SSL=false` or load-balance `false`
  now actually disable those options. Existing environment values override files.
- `stream_query` executes SELECT/WITH once, accepts existing LIMIT/OFFSET and a
  trailing semicolon, binds optional `params`, and honors `maxRows` exactly.
  It returns one response with explicit `truncated`/`hasMore` fields. Omitted maxRows
  uses 100 batches, capped at one million rows; explicit maxRows can use more than
  100 batches. No silent 101-batch cutoff or repeated OFFSET queries remain.
- Preserve 64-bit integer precision in the driver; expose real Vertica type names
  and IDs instead of reporting the wire format as the data type.
- BigInt values are lossless decimal strings, dates are ISO strings, and binary
  buffers serialize as base64. Text and structured content match exactly.

### Compatibility limits

- Raise the minimum runtime to Node 20 for stable MCP SDK v2. Use `serveStdio`
  to explicitly serve MCP 2026-07-28 as well as older initialized clients. Tests
  cover modern, legacy, and automatic era selection.
- StdIO remains the supported transport. No remote HTTP endpoint, authentication
  surface, or package publication is performed by this change. The release workflow
  is manually dispatched and defaults to preparing a draft.
- `execute_query` remains uncapped for direct SQL execution. Use LIMIT or `stream_query`
  for large results. Batches are bounded in rows, not bytes, and are materialized
  in memory before one response is returned.
