import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadDatabaseConfig } from "../../src/config/database.js";
import { VerticaService } from "../../src/services/vertica-service.js";

// Only explicit test-only settings are read. Never fall back to VERTICA_HOST.
const enabled = process.env.VERTICA_INTEGRATION_TESTS === "1";
describe.skipIf(!enabled)("Vertica test database (read-only)", () => {
  let service: VerticaService;
  beforeAll(async () => {
    const env = Object.fromEntries(
      Object.entries(process.env)
        .filter(([key]) => key.startsWith("VERTICA_TEST_"))
        .map(([key, value]) => [
          key.replace("VERTICA_TEST_", "VERTICA_"),
          value,
        ]),
    );
    service = new VerticaService(
      loadDatabaseConfig({ ...env, VERTICA_READONLY_MODE: "true" }),
    );
    await service.connect();
  });
  afterAll(async () => service?.disconnect());
  it("binds ? placeholders with the real driver", async () => {
    expect(
      (await service.executeQuery("SELECT ?::INT AS answer", [42])).rows[0]
        ?.answer,
    ).toBe(42);
  });
  it("preserves 64-bit integer precision with the real driver", async () => {
    expect(
      (
        await service.executeQuery(
          "SELECT 9223372036854775807::INT AS big_value",
        )
      ).rows[0]?.big_value,
    ).toBe("9223372036854775807");
  });
  it("enforces a real read-only transaction", async () => {
    const probe = await service.executeQuery(
      "SELECT CURRENT_TRANS_ID()::VARCHAR AS transaction_id LIMIT 1",
    );
    expect(probe.rows).toHaveLength(1);
    const id = probe.rows[0]?.transaction_id;
    expect(typeof id).toBe("string");
    const response = await service.executeQuery(
      "SELECT is_read_only FROM v_monitor.transactions WHERE transaction_id = ?::INT AND session_id = CURRENT_SESSION() AND is_initiator LIMIT 2",
      [id],
    );
    expect(response.rows).toEqual([{ is_read_only: true }]);
  });
  it("reads catalog views without writes", async () => {
    expect(Array.isArray(await service.listTables())).toBe(true);
    expect(Array.isArray(await service.listViews())).toBe(true);
  });
  it("executes bounded batches on Vertica", async () => {
    const batches = [];
    for await (const batch of service.streamQuery(
      "SELECT 1 AS n UNION ALL SELECT 2 UNION ALL SELECT 3",
      { batchSize: 1, maxRows: 2 },
    ))
      batches.push(batch);
    expect(batches).toHaveLength(2);
    expect(batches.at(-1)?.hasMore).toBe(true);
  });
  it.skipIf(!process.env.VERTICA_TEST_TABLE)(
    "reads fixture columns, constraints and projections",
    async () => {
      const table = process.env.VERTICA_TEST_TABLE!;
      const schema = process.env.VERTICA_TEST_DEFAULT_SCHEMA;
      expect(
        (await service.getTableStructure(table, schema)).columns.length,
      ).toBeGreaterThan(0);
      expect(Array.isArray(await service.listIndexes(table, schema))).toBe(
        true,
      );
    },
  );
});
