# Contributing

Use Node 24 LTS and pnpm (the version in `package.json`). The installed server
requires Node 20+; CI checks Node 20, 22, 24, and 26 plus Windows.

```sh
corepack enable
pnpm install --frozen-lockfile
pnpm check
```

`check` runs formatting, ESLint, strict source and test type checks, the build,
and Vitest with coverage thresholds. Development tools require Node 22.12+; use
Node 24 LTS. CI builds on Node 24, then runs native Node compatibility tests
against the compiled package on every supported runtime. `pnpm test:watch` runs tests while editing.
Tests inject the driver boundary instead of globally mocking modules or consoles.
CLI tests launch real server subprocesses and never connect to a database.

## Optional database integration tests

These tests are excluded from normal runs and require explicit test-only settings.
Do not point them at production. No environment file is loaded by the test runner,
and ordinary `VERTICA_HOST` credentials are never used as a fallback.

```sh
VERTICA_INTEGRATION_TESTS=1 \
VERTICA_TEST_HOST=localhost \
VERTICA_TEST_DATABASE=testdb \
VERTICA_TEST_USER=readonly_test_user \
VERTICA_TEST_PASSWORD=your_test_password \
pnpm test:integration
```

Use `VERTICA_TEST_PORT`, `VERTICA_TEST_SSL`, and
`VERTICA_TEST_SSL_REJECT_UNAUTHORIZED` as needed. For catalog tests, optionally set
`VERTICA_TEST_TABLE` to an existing fixture table and `VERTICA_TEST_DEFAULT_SCHEMA`
to its schema. The suite only reads data. Use an existing approved table; do not create fixtures
or modify data, schemas, permissions, or server settings for validation.

## Architecture and compatibility

- `src/index.ts`: CLI, quiet environment loading, stdio lifecycle, bounded shutdown.
- `src/server.ts`: SDK handlers and response envelopes.
- `src/tools/contracts.ts`: tool selection descriptions, strict inputs, typed
  success/error outputs, annotations and configuration metadata.
- `src/services/connection-manager.ts`: lazy connection leases, idle cleanup,
  optional load balancing, shutdown. One manager belongs to one server.
- `src/services/vertica-service.ts`: typed driver boundary, query serialization,
  read-only transactions, batching, catalog queries, timeout/cancellation cleanup.
- `src/utils/sql.ts`: conservative single-statement and read-only checks.

Keep the six existing tool names, argument names, JSON text envelopes, CLI aliases,
and documented environment settings. New output fields should be additive. Changes
to intentional safety restrictions belong in `CHANGELOG.md` and the README. Tests
must exercise the behavior at the driver boundary and through an MCP client.
Review descriptions, parameters, limits, output schemas and annotations together;
see [tool contracts](docs/TOOL_CONTRACTS.md). Never use a read-only annotation as
a purity claim for arbitrary database functions.

The server uses current stable MCP SDK v2 and its `serveStdio` factory entry point,
which supports MCP 2026-07-28 as well as older initialized stdio clients. A plain
`server.connect(new StdioServerTransport())` serves only the older protocol era;
do not replace the entry point without updating the explicit modern-protocol tests.
Handler cancellation comes from `ctx.mcpReq.signal`. Existing `.env` files,
environment variable names, and read-only defaults remain supported.

## Packaging

```sh
pnpm clean
pnpm build
npm pack --dry-run
```

`prepare` supports installs from a Git checkout. `prepack` cleans and rebuilds the
published files. CI installs the tarball in a fresh directory and checks both the
CLI and package layout. CI only prepares a checksummed candidate bundle. The separately dispatched release
workflow defaults to a draft and requires explicit publication intent and the
Mac-validated digest. See [releasing](docs/RELEASING.md) and the
[Mac validation handoff](docs/LOCAL_VALIDATION.md).

Use `pnpm test:compatibility` to run the compiled-package checks locally.

Dependency overrides keep transitive dependencies on compatible patched versions;
review them along with lockfile updates and `pnpm audit --prod`. The Vertica driver
is still upstream version 1.1.4, which has not published a newer version. Keep its
small local TypeScript declaration aligned with the actual API, especially TLS.
