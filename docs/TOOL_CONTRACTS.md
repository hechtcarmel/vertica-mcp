# Tool-contract review

The six existing names remain stable. Display titles and descriptions distinguish
actual behavior, including the legacy names `stream_query` and `list_indexes`.
Contracts live in `src/tools/contracts.ts` and are exercised through MCP discovery.

| Tool                  | Use and actual limits                                                                                                                                                                                                                  |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `execute_query`       | One statement for small results, SHOW/DESCRIBE/EXPLAIN, or explicitly enabled writes. No row cap; use SQL LIMIT or batching. Database/policy restrictions still apply.                                                                 |
| `stream_query`        | One SELECT/WITH execution valid inside a subquery. Batches are returned in one response, without a continuation cursor or incremental transport streaming. Explicit maxRows is honored; otherwise min(batchSize × 100, 1,000,000).     |
| `list_tables`         | Visible table metadata in one schema; all matches, no pagination or user-table data reads.                                                                                                                                             |
| `list_views`          | Visible views in one schema; all matches, no pagination. The preview contains up to 200 characters plus an ellipsis; fullDefinition contains complete SQL.                                                                             |
| `list_indexes`        | Projection-column catalog rows for one table, not traditional indexes. indexCount counts entries; isUnique reflects the key-constraint projection flag rather than proving uniqueness. Empty results do not prove the table is absent. |
| `get_table_structure` | One existing table's columns, nullability, constraints and ownership. No table data reads or view inspection. An absent/invisible table produces an error.                                                                             |

Inputs specify required names, limits and defaults. Schema and table are separate
exact catalog names without SQL quoting; parameters bind values, not identifiers.
Unknown fields are rejected, so invented pagination/row-limit arguments cannot be
silently mistaken for supported bounds. The query example is a bounded constant
read, not a mutation or a reference to a guessed user table.

Output schemas describe both `success: true` data and `success: false` errors,
including the appropriate UTC timestamp. They preserve the root object shape for
older clients while using JSON Schema composition. SQL row values remain dynamic;
field metadata supplies Vertica type names/IDs. Catalog NULLs and raw length values
are represented honestly. Batch truncation signals omitted rows, not resumability.
Invalid arguments and unknown tools may use SDK error responses; database/policy
errors use `isError: true` with the structured error envelope.

## Annotations and configured policy

| Tool family                       | readOnlyHint | destructiveHint | idempotentHint | openWorldHint |
| --------------------------------- | ------------ | --------------- | -------------- | ------------- |
| Fixed catalog reads               | true         | false           | true           | false         |
| Arbitrary SQL, including batching | false        | true            | false          | true          |

Arbitrary SQL can call functions with side effects, including effects not blocked
by Vertica read-only transactions. No annotation therefore claims that arbitrary
SQL is pure, idempotent, or restricted to a closed interaction world. Catalog tools
use fixed catalog SELECT statements and can accurately advertise read-only reads.

The read-only **policy remains enabled by default**. The query tools' namespaced
`_meta["com.hechtcarmel.vertica/readOnlyTransaction"]` reports the immutable startup
configuration; it is true when read-only transactions are enforced and false when
writes are explicitly enabled. This metadata separates configuration from a purity
claim. Neither metadata nor annotations replace least-privilege database grants.

The dedicated Mac validator forces read-only mode, requires true configuration
metadata for both SQL tools plus read-only catalog hints, and confirms the actual
completed probe transaction using two bounded reads before all other database
checks. This replaces the session-default SHOW check; see the exact queries and
failure rules in [the Mac handoff](LOCAL_VALIDATION.md).
No mutation, rejection, mock, or aggregate suite belongs in real Mac validation.

## Official references and validation

Reviewed against the current [MCP tools specification](https://modelcontextprotocol.io/specification/2026-07-28/server/tools)
and [SDK tool registration/annotation reference](https://ts.sdk.modelcontextprotocol.io/v2/api/%40modelcontextprotocol/server/server/mcp.html).
Annotations are descriptive hints, not access controls or guarantees from untrusted
servers. Success/error schemas, input validation and honest side-effect hints are
part of the tool's implementation contract.

Cloud tests exercise published descriptions, required inputs, parameter guidance,
strict unknown-field handling, numeric bounds/defaults, configuration metadata,
annotations in both modes, structured success/failure envelopes, and representative
nullable catalog values. Hosted CI must pass on the final commit before its new
artifact is used for the separate safe-read Mac rerun.
