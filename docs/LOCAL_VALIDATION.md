# Mac validation before merge

This is a handoff for a **separate, explicitly authorized local Mac task** after
GitHub CI passes. This cloud task must never read local connection files, copy
credentials, connect to the database, or change local permissions. Nothing here
requires changing the installed released server or its configuration.

## Hard restrictions

- Run only `validate-local.mjs`, with existing approved connection files.
- All database operations are known-safe, bounded reads. Read-only mode is forced
  for the candidate child process, even if the old env file enables writes.
- Do not construct or send any mutation, schema, permission, server-setting,
  test-table, rejection, or write-path request. Do not test write rejection.
- Do not run aggregate unit, compatibility, integration, or mock suites on the
  Mac. Those suites belong to isolated cloud/CI validation, not this handoff.
- Do not edit, source into the shell, print, upload, or copy connection/env files.
  Do not change database settings or grant permissions to make a test pass.
- Keep database errors, schema/table names, credentials, and query results local.
  Report pass/fail checks and artifact identity only. Stop if permissions or
  network access are unavailable; do not expand access or disable TLS validation.

## Identify the exact candidate

Download the `vertica-mcp-<commit SHA>` artifact from the passing CI package job.
It contains the npm tarball, `manifest.json`, `SHA256SUMS`, this handoff, and the
read-only validator. Record the workflow run URL and the manifest's version,
source commit, lockfile digest, and tarball SHA-256. **A dirty manifest is not an
eligible candidate.** Do not substitute a local rebuild or an unpinned `@latest`.

```sh
cd /absolute/path/to/downloaded/bundle
shasum -a 256 -c SHA256SUMS
node -p 'JSON.stringify(JSON.parse(require("fs").readFileSync("manifest.json", "utf8")), null, 2)'
node --version
```

Node 20+ must already be available. Prefer Node 24 LTS. Installing or changing a
system runtime, permissions, network access, trust settings, or global packages
is outside this validation. Ask the coordinator if prerequisites are missing.

## Isolated reinstall

Use the tarball filename from the manifest. The following commands install only
inside a new temporary directory. They do not replace the released installation
or edit any MCP-client configuration. Keep the temporary directory until the
local report has been reviewed.

```sh
VERTICA_CANDIDATE_BUNDLE=/absolute/path/to/downloaded/bundle
VERTICA_CANDIDATE_PACKAGE=hechtcarmel-vertica-mcp-2.0.0.tgz
VERTICA_VALIDATION_DIR="$(mktemp -d -t vertica-mcp-validation)"
npm install --prefix "$VERTICA_VALIDATION_DIR/candidate" --ignore-scripts --no-audit --no-fund \
  "$VERTICA_CANDIDATE_BUNDLE/$VERTICA_CANDIDATE_PACKAGE"
npm install --prefix "$VERTICA_VALIDATION_DIR/harness" --ignore-scripts --no-audit --no-fund \
  @modelcontextprotocol/client@2.4.0
cp "$VERTICA_CANDIDATE_BUNDLE/validate-local.mjs" "$VERTICA_VALIDATION_DIR/harness/validate-local.mjs"
node "$VERTICA_VALIDATION_DIR/candidate/node_modules/@hechtcarmel/vertica-mcp/dist/index.js" --version
```

The authorized local task should inspect the existing MCP-client entry to identify
its existing env-file path and non-secret schema/TLS requirements. Do not rewrite
the file or transfer its contents. Select each existing approved Vertica profile
separately; never enumerate unrelated credentials or files.

## Dedicated safe-read validation

Set this path to the **existing file**, without copying or modifying it:

```sh
VERTICA_EXISTING_ENV=/absolute/path/to/the/existing/vertica.env
node "$VERTICA_VALIDATION_DIR/harness/validate-local.mjs" \
  --server "$VERTICA_VALIDATION_DIR/candidate/node_modules/@hechtcarmel/vertica-mcp/dist/index.js" \
  --env-file "$VERTICA_EXISTING_ENV" --protocol modern
node "$VERTICA_VALIDATION_DIR/harness/validate-local.mjs" \
  --server "$VERTICA_VALIDATION_DIR/candidate/node_modules/@hechtcarmel/vertica-mcp/dist/index.js" \
  --env-file "$VERTICA_EXISTING_ENV" --protocol legacy
```

The validator resolves symlink aliases such as `/tmp` and `/private/tmp`, so either
spelling runs the same entry point. It refuses to run outside macOS.
It checks the exact tool set, fixed catalog read-only hints, explicit query
read-only transaction configuration, the completed probe's actual transaction mode,
one-row constant reads, bound parameters, integer precision, and bounded batching
over constant rows. It emits
incremental JSON stage events on stderr and a final success summary on stdout.
Success requires exit code 0 **and** an `event: "complete"` summary with
`success: true`; empty output is never a successful validation.

Arbitrary-SQL tools intentionally use conservative annotations because database
functions can have side effects. Their `readOnlyHint: false` does **not** disable
the read-only policy. Discovery must instead confirm
`_meta["com.hechtcarmel.vertica/readOnlyTransaction"]: true` for both SQL tools;
the validator then confirms an actual read-only transaction before any other
database checks. It must stop if configuration metadata is absent/false. Do not
bypass this check or broaden the queries.

`readonly_status` now uses these two fixed bounded reads, replacing the session
default check (`SHOW TRANSACTION_READ_ONLY`):

```sql
SELECT CURRENT_TRANS_ID()::VARCHAR AS transaction_id LIMIT 1
SELECT is_read_only FROM v_monitor.transactions
WHERE transaction_id = ?::INT AND session_id = CURRENT_SESSION() AND is_initiator
LIMIT 2
```

The first response arrives after the server rolls back that probe transaction.
Its ID is bound into the second read and retained only inside the validator.
Confirmation requires exactly one record with the native boolean `is_read_only`
equal to true. False fails as `readonly_transaction_not_readonly`; a missing,
ambiguous, or unexpected status fails as `readonly_status_unavailable`. Neither
case permits any further checks. Do not enable monitoring, change session/server
settings, grant permissions, or accept a session default as a substitute.

Vertica documents [SHOW](https://docs.vertica.com/24.1.x/en/sql-reference/statements/show/)
as session settings, while [START TRANSACTION](https://docs.vertica.com/26.2.x/en/sql-reference/statements/start-transaction/)
sets a single transaction's mode. The [TRANSACTIONS table](https://docs.vertica.com/26.2.x/en/sql-reference/system-tables/v-monitor-schema/transactions/)
records `IS_READ_ONLY`; [CURRENT_TRANS_ID](https://docs.vertica.com/24.2.x/en/sql-reference/functions/system-information-functions/current-trans-id/)
identifies the probe. The previous session-default assertion could not establish
the requested transaction mode. The real mode still requires the new Mac gate
to pass; cloud tests alone do not establish it.

Stages include `initialization`, `connect`, `tool_discovery`, the fixed safe-read
checks, optional catalog reads, and `shutdown`. Each stage emits `started` followed
by `passed` or `failed`, so earlier progress remains visible on early failure.
A failure contains only an allowlisted stage, category, and static hint. Categories
distinguish local path/access/dependency issues, invalid configuration, connection
refusal, DNS, timeout, TLS, authentication, read permissions, protocol/database
compatibility, and unexpected fixed-check results. Raw exception messages/causes,
child stderr, paths, credentials, and query results are never included in reports.
Report only the validator's JSON stage/failure events; keep any non-JSON runtime
warnings and local diagnostic details on the Mac. Do not change TLS, permissions,
credentials, network access, or server settings to make a check pass.

Optional catalog validation uses only parameterized SELECT statements with LIMIT,
against a schema/table already selected in the local task:

```sh
node "$VERTICA_VALIDATION_DIR/harness/validate-local.mjs" \
  --server "$VERTICA_VALIDATION_DIR/candidate/node_modules/@hechtcarmel/vertica-mcp/dist/index.js" \
  --env-file "$VERTICA_EXISTING_ENV" --protocol modern \
  --catalogs --schema existing_schema --table existing_table
```

No user-table data is read. Catalog reads are capped at 1–10 rows. The unbounded
catalog-list tools are not invoked by this smoke script. Skip optional catalog
checks if no existing schema/table has been approved; do not create fixtures.

## Rollback and report

The released installation and configuration were never replaced, so rollback is
closing the candidate child process and returning to the existing client entry.
The validator closes its transport in `finally`. Leave existing files unchanged.
After the coordinator approves cleanup, remove only the temporary validation
directory created above; do not remove npm caches or any existing installation.

Report:

- CI URL, package version, source commit, lockfile digest, and tarball SHA-256.
- Mac architecture and Node version; protocol(s) tested.
- JSON stage events, failure stage/category if any, and optional catalog checks skipped.
- Confirmation that only safe bounded reads ran and existing files stayed intact.

Any source, dependency, or packaged-content change requires a new CI artifact and
new local validation. Do not merge or publish until the coordinator/user accepts
this result. A passed cloud test suite does not replace this Mac validation.
