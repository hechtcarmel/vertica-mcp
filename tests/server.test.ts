import { afterEach, describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/client";
import { InMemoryTransport } from "@modelcontextprotocol/client";
import { createServer } from "../src/server.js";
import {
  outputSchemas,
  READONLY_TRANSACTION_META_KEY,
} from "../src/tools/contracts.js";
import { ConnectionManager } from "../src/services/connection-manager.js";
import { config, result, setup } from "./helpers.js";
const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup();
});
async function connect(readonlyMode = true) {
  const db = setup({ readonlyMode });
  const manager = new ConnectionManager(
    { ...config, readonlyMode },
    () => db.service,
  );
  const server = createServer({ ...config, readonlyMode }, manager);
  const client = new Client({ name: "test-client", version: "1" });
  const [a, b] = InMemoryTransport.createLinkedPair();
  cleanups.push(async () => {
    await client.close();
    await server.close();
  });
  await server.connect(b);
  await client.connect(a);
  return { ...db, driver: db.client, client, server };
}
describe("MCP compatibility", () => {
  it("initializes and advertises exactly the six existing names and validated schemas", async () => {
    const { client, factory } = await connect();
    expect(client.getServerVersion()?.name).toBe("@hechtcarmel/vertica-mcp");
    const { tools } = await client.listTools();
    expect(tools.map((tool) => tool.name).sort()).toEqual([
      "execute_query",
      "get_table_structure",
      "list_indexes",
      "list_tables",
      "list_views",
      "stream_query",
    ]);
    for (const tool of tools) {
      expect(tool.inputSchema.type).toBe("object");
      expect(tool.outputSchema).toBeDefined();
      const isQuery = ["execute_query", "stream_query"].includes(tool.name);
      expect(tool.annotations?.readOnlyHint).toBe(!isQuery);
      expect(tool.annotations?.destructiveHint).toBe(isQuery);
      expect(tool.annotations?.idempotentHint).toBe(!isQuery);
      expect(tool.annotations?.openWorldHint).toBe(isQuery);
      if (isQuery)
        expect(tool._meta?.[READONLY_TRANSACTION_META_KEY]).toBe(true);
    }
    expect(
      tools.find((t) => t.name === "execute_query")?.inputSchema.required,
    ).toEqual(["sql"]);
    expect(factory).not.toHaveBeenCalled();
  });
  it("advertises accurate selection guidance, input descriptions and complete output envelopes", async () => {
    const { client } = await connect();
    const { tools } = await client.listTools();
    const byName = new Map(tools.map((tool) => [tool.name, tool]));
    for (const tool of tools) {
      expect(tool.title).toEqual(expect.any(String));
      expect(tool.description!.length).toBeLessThan(500);
      expect(tool.inputSchema.additionalProperties).toBe(false);
      for (const property of Object.values(tool.inputSchema.properties ?? {})) {
        expect((property as { description?: string }).description).toEqual(
          expect.any(String),
        );
      }
      expect(tool.outputSchema?.type).toBe("object");
      const branches = tool.outputSchema?.oneOf as { required: string[] }[];
      expect(branches).toHaveLength(2);
      expect(branches[0]?.required).toContain("success");
      expect(branches[1]?.required).toContain("error");
    }
    expect(byName.get("execute_query")?.description).toMatch(/no row cap/);
    expect(byName.get("execute_query")?.description).toMatch(
      /Read-only.*enabled/,
    );
    expect(byName.get("stream_query")?.description).toMatch(/subquery/);
    expect(byName.get("stream_query")?.description).toMatch(
      /no cursor or incremental streaming/,
    );
    expect(byName.get("list_tables")?.description).toMatch(
      /without pagination/,
    );
    expect(byName.get("list_views")?.description).toMatch(
      /200-character preview/,
    );
    expect(byName.get("list_indexes")?.description).toMatch(
      /not a uniqueness proof/,
    );
    expect(byName.get("get_table_structure")?.description).toMatch(
      /absent or invisible/,
    );
    const batchProperties = byName.get("stream_query")?.inputSchema
      .properties as Record<string, Record<string, unknown>>;
    expect(batchProperties.batchSize).toMatchObject({
      default: 1000,
      minimum: 1,
      maximum: 10000,
    });
    expect(batchProperties.maxRows?.description).toMatch(/batchSize \* 100/);
    expect(batchProperties.maxRows).toMatchObject({
      minimum: 1,
      maximum: 1000000,
    });
  });
  it("rejects incomplete or mistyped structured outputs and accepts actual failure envelopes", () => {
    expect(() =>
      outputSchemas.execute_query.parse({
        success: true,
        executedAt: new Date().toISOString(),
      }),
    ).toThrow();
    expect(() =>
      outputSchemas.stream_query.parse({ success: true, totalRows: "3" }),
    ).toThrow();
    expect(() =>
      outputSchemas.list_tables.parse({
        success: false,
        error: "not available",
        queriedAt: new Date().toISOString(),
      }),
    ).not.toThrow();
  });
  it.each(["2024-11-05", "2025-03-26", "2025-06-18", "2025-11-25"])(
    "negotiates existing protocol %s",
    async (protocolVersion) => {
      const server = createServer(config);
      const [clientTransport, serverTransport] =
        InMemoryTransport.createLinkedPair();
      const client = new Client({ name: "legacy", version: "1" });
      cleanups.push(async () => {
        await client.close();
        await server.close();
      });
      await server.connect(serverTransport);
      await client.connect(clientTransport);
      const initialized = await client.request({
        method: "initialize",
        params: {
          protocolVersion,
          capabilities: {},
          clientInfo: { name: "legacy", version: "1" },
        },
      });
      expect(initialized.protocolVersion).toBe(protocolVersion);
    },
  );
  it("preserves text result fields and adds identical structured results", async () => {
    const { client } = await connect();
    const response = await client.callTool({
      name: "execute_query",
      arguments: { sql: "SELECT 1" },
    });
    expect(response.isError).toBe(false);
    expect(() =>
      outputSchemas.execute_query.parse(response.structuredContent),
    ).not.toThrow();
    expect(response.content).toEqual([
      {
        type: "text",
        text: JSON.stringify(response.structuredContent, null, 2),
      },
    ]);
    expect(response.structuredContent).toMatchObject({
      success: true,
      query: "SELECT 1",
      rows: [],
      rowCount: 0,
      fields: [],
      executedAt: expect.any(String),
    });
  });
  it.each([
    { name: "execute_query", arguments: { sql: "SELECT 1; DROP TABLE t" } },
    { name: "execute_query", arguments: { sql: " " } },
    { name: "execute_query", arguments: { params: [] } },
    { name: "execute_query", arguments: { sql: "SELECT 1", maxRows: 1 } },
    {
      name: "stream_query",
      arguments: { sql: "SELECT 1", cursor: "unsupported" },
    },
    { name: "list_tables", arguments: { page: 1 } },
    { name: "stream_query", arguments: { sql: "SELECT 1", batchSize: 0 } },
    { name: "get_table_structure", arguments: {} },
    { name: "list_indexes", arguments: { tableName: "" } },
    { name: "list_tables", arguments: { schemaName: 42 } },
  ])(
    "rejects invalid tools/arguments before database access: %j",
    async (request) => {
      const { client, factory } = await connect();
      const response = await client.callTool(request);
      expect(response.isError).toBe(true);
      expect(factory).not.toHaveBeenCalled();
    },
  );
  it("reports unknown tool names as protocol errors", async () => {
    const { client, factory } = await connect();
    await expect(
      client.callTool({ name: "unknown_tool", arguments: {} }),
    ).rejects.toThrow("not found");
    expect(factory).not.toHaveBeenCalled();
  });
  it("sets isError and preserves error context without leaking passwords", async () => {
    const { client, driver } = await connect();
    driver.query.mockRejectedValueOnce(
      new Error(`connection failure ${config.password}`),
    );
    const response = await client.callTool({
      name: "execute_query",
      arguments: { sql: "SELECT 1" },
    });
    expect(response.isError).toBe(true);
    expect(response.structuredContent).toMatchObject({
      success: false,
      query: "SELECT 1",
      error: expect.stringContaining("[REDACTED]"),
    });
    expect(JSON.stringify(response)).not.toContain(config.password);
    expect(() =>
      outputSchemas.execute_query.parse(response.structuredContent),
    ).not.toThrow();
  });
  it("preserves metadata envelopes, names with spaces, and full view definitions", async () => {
    const { client, driver } = await connect();
    const definition = "SELECT " + "1, ".repeat(100) + "2";
    driver.query.mockImplementation(async (sql) => {
      if (sql.includes("FROM v_catalog.tables"))
        return result([
          {
            table_schema: "Mixed Case",
            table_name: "Order Detail",
            owner_name: "u",
          },
        ]);
      if (sql.includes("FROM v_catalog.columns"))
        return result([
          {
            column_name: "id",
            data_type: "int",
            is_nullable: true,
            column_default: null,
            character_maximum_length: "128",
            numeric_scale: null,
            ordinal_position: 1,
          },
        ]);
      if (sql.includes("FROM v_catalog.constraint_columns"))
        return result([
          {
            constraint_name: "pk",
            constraint_type: "p",
            column_name: "id",
            reference_table_name: null,
            reference_column_name: null,
          },
        ]);
      if (sql.includes("FROM v_catalog.projection_columns"))
        return result([
          {
            index_name: "p",
            column_name: "id",
            is_key_constraint_projection: true,
            sort_position: null,
          },
        ]);
      if (sql.includes("FROM v_catalog.views"))
        return result([
          {
            view_name: "v",
            table_schema: "Mixed Case",
            owner_name: "u",
            view_definition: definition,
          },
        ]);
      return result();
    });
    const tables = await client.callTool({
      name: "list_tables",
      arguments: { schemaName: "Mixed Case" },
    });
    expect(() =>
      outputSchemas.list_tables.parse(tables.structuredContent),
    ).not.toThrow();
    expect(tables.structuredContent).toMatchObject({
      success: true,
      schema: "Mixed Case",
      tableCount: 1,
      tables: [{ tableName: "Order Detail" }],
      queriedAt: expect.any(String),
    });
    const views = await client.callTool({
      name: "list_views",
      arguments: { schemaName: "Mixed Case" },
    });
    expect(() =>
      outputSchemas.list_views.parse(views.structuredContent),
    ).not.toThrow();
    expect(views.structuredContent).toMatchObject({
      viewCount: 1,
      views: [
        {
          definition: definition.slice(0, 200) + "...",
          fullDefinition: definition,
        },
      ],
    });
    const indexes = await client.callTool({
      name: "list_indexes",
      arguments: { tableName: "Order Detail" },
    });
    expect(() =>
      outputSchemas.list_indexes.parse(indexes.structuredContent),
    ).not.toThrow();
    expect(indexes.structuredContent).toMatchObject({
      success: true,
      table: "Order Detail",
      schema: "public",
      indexCount: 1,
      indexes: [
        {
          indexName: "p",
          columnName: "id",
          isUnique: true,
          ordinalPosition: null,
        },
      ],
    });
    const structure = await client.callTool({
      name: "get_table_structure",
      arguments: { tableName: "Order Detail", schemaName: "Mixed Case" },
    });
    expect(() =>
      outputSchemas.get_table_structure.parse(structure.structuredContent),
    ).not.toThrow();
    expect(structure.structuredContent).toMatchObject({
      success: true,
      table: { tableName: "Order Detail" },
      columns: [
        {
          name: "id",
          nullable: true,
          defaultValue: null,
          size: "128",
          decimalDigits: null,
        },
      ],
      constraints: [
        {
          name: "pk",
          type: "p",
          referencedTable: null,
          referencedColumn: null,
        },
      ],
    });
  });
  it("reports exact batch counts and truncation with the legacy response shape", async () => {
    const { client, driver } = await connect();
    driver.query.mockImplementation(async (sql) =>
      sql.startsWith("SELECT * FROM (")
        ? result([{ n: 1 }, { n: 2 }, { n: 3 }, { n: 4 }])
        : result(),
    );
    const response = await client.callTool({
      name: "stream_query",
      arguments: { sql: "SELECT n FROM t", batchSize: 2, maxRows: 3 },
    });
    expect(() =>
      outputSchemas.stream_query.parse(response.structuredContent),
    ).not.toThrow();
    expect(response.structuredContent).toMatchObject({
      success: true,
      query: "SELECT n FROM t",
      totalRows: 3,
      batchCount: 2,
      batchSize: 2,
      truncated: true,
      batches: [
        { batchNumber: 1, rowCount: 2, rows: [{ n: 1 }, { n: 2 }] },
        { batchNumber: 2, rowCount: 1, rows: [{ n: 3 }], hasMore: true },
      ],
    });
  });
  it("marks write tools accurately when writes are explicitly enabled", async () => {
    const { client } = await connect(false);
    const { tools } = await client.listTools();
    const query = tools.find((t) => t.name === "execute_query");
    expect(query?.annotations).toMatchObject({
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
    });
    expect(
      tools.find((t) => t.name === "stream_query")?.annotations?.readOnlyHint,
    ).toBe(false);
    expect(
      tools.find((tool) => tool.name === "execute_query")?._meta?.[
        READONLY_TRANSACTION_META_KEY
      ],
    ).toBe(false);
    expect(
      tools.find((tool) => tool.name === "stream_query")?._meta?.[
        READONLY_TRANSACTION_META_KEY
      ],
    ).toBe(false);
  });
});
