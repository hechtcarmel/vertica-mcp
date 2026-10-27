import { describe, it, expect } from "vitest";
import { setup, result, deferred, config } from "../helpers.js";
import { VerticaService } from "../../src/services/vertica-service.js";

describe("Vertica driver boundary", () => {
  it.each([
    [{}, "disable"],
    [{ ssl: true }, "verify-full"],
    [{ ssl: true, sslRejectUnauthorized: false }, "require"],
    [{ ssl: false, sslRejectUnauthorized: false }, "disable"],
  ] as const)(
    "uses actual driver TLS options for %j",
    async (options, tls_mode) => {
      const { service, factory } = setup(options);
      await service.connect();
      expect(factory).toHaveBeenCalledWith(
        expect.objectContaining({
          tls_mode,
          connectionTimeoutMillis: 60000,
          query_timeout: 60000,
        }),
      );
      expect(factory.mock.calls[0]).not.toHaveProperty("ssl");
      await service.disconnect();
    },
  );
  it("preserves 64-bit integers outside JavaScript's safe range", async () => {
    const { service, client } = setup();
    await service.connect();
    const [oid, format, parse] = client.setTypeParser.mock.calls[0]!;
    expect([oid, format]).toEqual([6, "text"]);
    expect(parse("42")).toBe(42);
    expect(parse("9007199254740991")).toBe(9007199254740991);
    expect(parse("9007199254740993")).toBe("9007199254740993");
    expect(parse("-9223372036854775808")).toBe("-9223372036854775808");
    await service.disconnect();
  });
  it("shares a pending connection and cleans failed clients before retry", async () => {
    const { service, client, factory } = setup();
    const gate = deferred<void>();
    client.connect.mockReturnValueOnce(gate.promise);
    const a = service.connect(),
      b = service.connect();
    expect(factory).toHaveBeenCalledTimes(1);
    gate.resolve();
    await Promise.all([a, b]);
    await service.disconnect();
    client.connect.mockRejectedValueOnce(new Error("refused"));
    await expect(service.connect()).rejects.toThrow("Failed to connect");
    expect(service.isConnected()).toBe(false);
    await service.connect();
    expect(service.isConnected()).toBe(true);
    await service.disconnect();
  });
  it("handles idle driver errors without an unhandled EventEmitter exception", async () => {
    const { service, client } = setup();
    await service.connect();
    client.emit("error", new Error("broken socket"));
    expect(service.isConnected()).toBe(false);
    expect(client.end).toHaveBeenCalled();
    await service.connect();
    client.emit("end");
    expect(service.isConnected()).toBe(false);
  });
  it("sets up and rolls back read-only transactions, preserving parameters", async () => {
    const { service, client } = setup();
    const data = result([{ answer: 42 }]);
    client.query.mockResolvedValueOnce(result()).mockResolvedValueOnce(data);
    expect(await service.executeQuery("SELECT ? AS answer;", [42])).toEqual(
      data,
    );
    expect(client.query.mock.calls).toEqual([
      ["START TRANSACTION READ ONLY"],
      ["SELECT ? AS answer", [42]],
      ["ROLLBACK"],
    ]);
    await service.disconnect();
  });
  it("makes the completed probe transaction available before a later status read", async () => {
    const { service, client } = setup();
    let nextId = 45035996273705927n;
    let activeId: string | undefined;
    const completed = new Map<string, boolean>();
    client.query.mockImplementation(async (sql, params) => {
      if (sql === "START TRANSACTION READ ONLY") {
        activeId = String(nextId++);
        return result();
      }
      if (sql === "ROLLBACK") {
        completed.set(activeId!, true);
        activeId = undefined;
        return result();
      }
      if (sql.includes("CURRENT_TRANS_ID()::VARCHAR"))
        return result([{ transaction_id: activeId }]);
      if (sql.includes("FROM v_monitor.transactions")) {
        expect(params).toEqual(["45035996273705927"]);
        expect(activeId).toBe("45035996273705928");
        return result([{ is_read_only: completed.get(String(params?.[0])) }]);
      }
      throw new Error("Unexpected probe SQL");
    });
    const probe = await service.executeQuery(
      "SELECT CURRENT_TRANS_ID()::VARCHAR AS transaction_id LIMIT 1",
    );
    expect(activeId).toBeUndefined();
    const status = await service.executeQuery(
      "SELECT is_read_only FROM v_monitor.transactions WHERE transaction_id = ?::INT AND session_id = CURRENT_SESSION() AND is_initiator LIMIT 2",
      [probe.rows[0]!.transaction_id],
    );
    expect(status.rows).toEqual([{ is_read_only: true }]);
    expect(client.query.mock.calls.map(([sql]) => sql)).toEqual([
      "START TRANSACTION READ ONLY",
      "SELECT CURRENT_TRANS_ID()::VARCHAR AS transaction_id LIMIT 1",
      "ROLLBACK",
      "START TRANSACTION READ ONLY",
      "SELECT is_read_only FROM v_monitor.transactions WHERE transaction_id = ?::INT AND session_id = CURRENT_SESSION() AND is_initiator LIMIT 2",
      "ROLLBACK",
    ]);
    await service.disconnect();
  });
  it("blocks unsafe SQL without connecting", async () => {
    const { service, factory } = setup();
    await expect(
      service.executeQuery("SELECT 1; DROP TABLE t"),
    ).rejects.toThrow();
    await expect(
      service.executeQuery("WITH t AS (SELECT 1) DELETE FROM x"),
    ).rejects.toThrow();
    expect(factory).not.toHaveBeenCalled();
  });
  it("allows writes only with an explicit opt-in and never replays failures", async () => {
    const { service, client } = setup({ readonlyMode: false });
    client.query.mockRejectedValueOnce(new Error("socket closed"));
    await expect(
      service.executeQuery("INSERT INTO t VALUES (?)", [1]),
    ).rejects.toThrow();
    expect(client.query).toHaveBeenCalledTimes(1);
    expect(service.isConnected()).toBe(false);
  });
  it("rolls back SQL errors and closes the connection if rollback fails", async () => {
    const { service, client } = setup();
    client.query
      .mockResolvedValueOnce(result())
      .mockRejectedValueOnce(new Error("bad SQL"))
      .mockRejectedValueOnce(new Error("rollback failed"));
    await expect(service.executeQuery("SELECT invalid")).rejects.toThrow(
      "bad SQL",
    );
    expect(service.isConnected()).toBe(false);
  });
  it("closes timed-out work instead of returning a still-running connection", async () => {
    const { service, client } = setup();
    client.query
      .mockResolvedValueOnce(result())
      .mockRejectedValueOnce(new Error("Query read timeout"));
    await expect(service.executeQuery("SELECT 1")).rejects.toThrow("timeout");
    expect(client.end).toHaveBeenCalled();
    expect(service.isConnected()).toBe(false);
  });
  it("serializes transactions even for direct concurrent service calls", async () => {
    const { service, client } = setup();
    const gate = deferred<ReturnType<typeof result>>();
    client.query.mockImplementation(async (sql) =>
      sql === "SELECT 1" ? gate.promise : result(),
    );
    const a = service.executeQuery("SELECT 1");
    const b = service.executeQuery("SELECT 2");
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(client.query.mock.calls.map(([sql]) => sql)).toEqual([
      "START TRANSACTION READ ONLY",
      "SELECT 1",
    ]);
    gate.resolve(result());
    await Promise.all([a, b]);
    expect(client.query.mock.calls.map(([sql]) => sql)).toEqual([
      "START TRANSACTION READ ONLY",
      "SELECT 1",
      "ROLLBACK",
      "START TRANSACTION READ ONLY",
      "SELECT 2",
      "ROLLBACK",
    ]);
    await service.disconnect();
  });
  it("honors cancellation before connect and interrupts active queries", async () => {
    const { service, client, factory } = setup();
    const abort = new AbortController();
    abort.abort();
    await expect(
      service.executeQuery("SELECT 1", [], abort.signal),
    ).rejects.toThrow();
    expect(factory).not.toHaveBeenCalled();
    const active = new AbortController();
    const gate = deferred<ReturnType<typeof result>>();
    client.query.mockImplementation(async (sql) =>
      sql === "SELECT 1" ? gate.promise : result(),
    );
    client.end.mockImplementation(async () => {
      gate.reject(new Error("closed"));
    });
    const pending = service.executeQuery("SELECT 1", [], active.signal);
    await new Promise<void>((resolve) => setImmediate(resolve));
    active.abort();
    await expect(pending).rejects.toThrow("closed");
    expect(service.isConnected()).toBe(false);
  });
  it("redacts credentials from driver errors", async () => {
    const { service, client } = setup();
    client.connect.mockRejectedValueOnce(
      new Error(`password ${config.password}`),
    );
    await expect(service.connect()).rejects.not.toThrow(config.password!);
  });
  it("normalizes missing fields and rejects driver multi-results", async () => {
    const { service, client } = setup({ readonlyMode: false });
    client.query.mockResolvedValueOnce({} as ReturnType<typeof result>);
    expect(await service.executeQuery("SELECT 1")).toEqual({
      ...result(),
      command: "",
    });
    client.query.mockResolvedValueOnce([result()]);
    await expect(service.executeQuery("SELECT 1")).rejects.toThrow(
      "Multiple query results",
    );
    await service.disconnect();
  });
});

describe("bounded query batches", () => {
  it.each([0, 2, 3, 4, 5])(
    "returns exact rows, fields and truncation for %i source rows",
    async (count) => {
      const { service, client } = setup();
      const data = result(Array.from({ length: count }, (_, n) => ({ n })));
      client.query.mockImplementation(async (sql) =>
        sql.startsWith("SELECT * FROM (") ? data : result(),
      );
      const batches = [];
      for await (const batch of service.streamQuery(
        "SELECT ? AS n LIMIT 20; -- tail",
        { batchSize: 2, maxRows: 4, params: [1] },
      ))
        batches.push(batch);
      expect(batches.flatMap((b) => b.batch)).toHaveLength(Math.min(4, count));
      expect(batches.at(-1)?.hasMore ?? false).toBe(count > 4);
      expect(
        client.query.mock.calls.filter(([sql]) =>
          sql.startsWith("SELECT * FROM ("),
        ),
      ).toEqual([
        [
          "SELECT * FROM (\nSELECT ? AS n LIMIT 20\n) AS mcp_result LIMIT 5",
          [1],
        ],
      ]);
      await service.disconnect();
    },
  );
  it("enforces maxRows smaller than batchSize and rejects non-SELECTs", async () => {
    const { service, client } = setup({ readonlyMode: false });
    client.query.mockResolvedValue(result([{ n: 1 }, { n: 2 }]));
    const batch = await service
      .streamQuery("SELECT n FROM t", { batchSize: 1000, maxRows: 1 })
      .next();
    expect(batch.value?.batch).toEqual([{ n: 1 }]);
    expect(batch.value?.hasMore).toBe(true);
    await expect(
      service.streamQuery("DELETE FROM t", { batchSize: 1 }).next(),
    ).rejects.toThrow();
    await expect(
      service.streamQuery("SELECT 1", { batchSize: 0 }).next(),
    ).rejects.toThrow("Invalid");
    await service.disconnect();
  });
});

describe("Vertica catalogs", () => {
  it("reads real constraints, native boolean nullability, and bound names", async () => {
    const { service, client } = setup();
    client.query.mockImplementation(async (sql) => {
      if (sql.includes("FROM v_catalog.columns"))
        return result([
          {
            column_name: "id",
            data_type: "int",
            is_nullable: true,
            ordinal_position: 1,
          },
        ]);
      if (sql.includes("FROM v_catalog.tables"))
        return result([{ owner_name: "tester", is_temp_table: "t" }]);
      if (sql.includes("FROM v_catalog.constraint_columns"))
        return result([
          { constraint_name: "pk", constraint_type: "p", column_name: "id" },
        ]);
      return result();
    });
    expect(
      await service.getTableStructure("Order Detail", "Mixed Case"),
    ).toMatchObject({
      tableType: "TEMPORARY TABLE",
      columns: [{ isNullable: true }],
      constraints: [{ constraintName: "pk", columnName: "id" }],
    });
    const catalogCalls = client.query.mock.calls.filter(([sql]) =>
      sql.includes("v_catalog."),
    );
    expect(catalogCalls).toHaveLength(3);
    expect(
      catalogCalls.every(
        ([, params]) =>
          JSON.stringify(params) ===
          JSON.stringify(["Mixed Case", "Order Detail"]),
      ),
    ).toBe(true);
    await service.disconnect();
  });
  it("reports missing tables", async () => {
    const { service } = setup();
    await expect(service.getTableStructure("missing")).rejects.toThrow(
      "not found",
    );
    await service.disconnect();
  });
  it("maps tables, views and projections with the correct anchor schema", async () => {
    const { service, client } = setup();
    client.query.mockImplementation(async (sql) => {
      if (sql.includes("FROM v_catalog.tables"))
        return result([
          {
            table_schema: "public",
            table_name: "t",
            owner_name: "u",
            is_flextable: true,
          },
        ]);
      if (sql.includes("FROM v_catalog.views"))
        return result([
          {
            table_schema: "public",
            view_name: "v",
            view_definition: "SELECT 1",
            owner_name: "u",
          },
        ]);
      if (sql.includes("v_catalog.projection_columns"))
        return result([
          {
            index_name: "p",
            table_name: "t",
            column_name: "id",
            is_key_constraint_projection: true,
            sort_position: 1,
          },
        ]);
      return result();
    });
    expect(await service.listTables()).toMatchObject([
      { tableType: "FLEX TABLE" },
    ]);
    expect(await service.listViews()).toMatchObject([
      { viewName: "v", definition: "SELECT 1" },
    ]);
    expect(await service.listIndexes("t")).toMatchObject([
      { indexName: "p", isUnique: true },
    ]);
    expect(client.query).toHaveBeenCalledWith(
      expect.stringContaining("t.table_schema = ?"),
      ["public", "t"],
    );
    await service.disconnect();
  });
  it("tests connections without leaking driver errors", async () => {
    const { service, client } = setup();
    client.query.mockResolvedValue(result([{ test: 1 }]));
    expect(await service.testConnection()).toBe(true);
    client.query.mockRejectedValue(new Error("bad"));
    expect(await service.testConnection()).toBe(false);
    await service.disconnect();
    expect(new VerticaService(config)).toBeInstanceOf(VerticaService);
  });
});
