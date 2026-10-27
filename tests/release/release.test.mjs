import { describe, it, expect } from "vitest";
import {
  releaseDetails,
  sha256,
  verifyArtifact,
} from "../../scripts/lib/release.mjs";
import { runReadOnlySmoke } from "../../scripts/validate-local.mjs";
import { Buffer } from "node:buffer";
const metadata = { name: "@hechtcarmel/vertica-mcp", version: "2.0.0" };
const changelog =
  "# Changelog\n\n## Unreleased\n\n## [2.0.0]\n\nRuntime and safety changes.\n\n## [1.4.0]\nOld notes.\n";
describe("release controls", () => {
  it("selects versioned notes without adjacent releases", () => {
    expect(releaseDetails("v2.0.0", metadata, changelog)).toEqual({
      distTag: "latest",
      notes: "Runtime and safety changes.\n",
    });
    expect(
      releaseDetails(
        "v2.0.0-rc.1",
        { ...metadata, version: "2.0.0-rc.1" },
        changelog.replace("[2.0.0]", "[2.0.0-rc.1]"),
      ).distTag,
    ).toBe("next");
  });
  it.each(["main", "v1.4.0", "v2.0.0; echo unsafe", "v02.0.0"])(
    "rejects invalid or mismatched tag %s",
    (tag) => expect(() => releaseDetails(tag, metadata, changelog)).toThrow(),
  );
  it("requires a versioned nonempty changelog and the correct package identity", () => {
    expect(() =>
      releaseDetails("v2.0.0", metadata, "## Unreleased\nnotes"),
    ).toThrow();
    expect(() =>
      releaseDetails("v2.0.0", metadata, "## [2.0.0]\n\n## [1.4.0]\nold"),
    ).toThrow();
    expect(() =>
      releaseDetails(
        "v2.0.0",
        { ...metadata, name: "other-package" },
        changelog,
      ),
    ).toThrow();
  });
  it("accepts only clean artifacts matching the digest accepted locally", () => {
    const bytes = Buffer.from("reviewed candidate");
    const digest = sha256(bytes);
    const manifest = {
      dirty: false,
      tarball: { filename: "candidate.tgz", sha256: digest },
    };
    expect(() => verifyArtifact(manifest, bytes, digest)).not.toThrow();
    expect(() =>
      verifyArtifact(manifest, Buffer.from("different"), digest),
    ).toThrow("does not match");
    expect(() =>
      verifyArtifact({ ...manifest, dirty: true }, bytes, digest),
    ).toThrow("dirty");
    expect(() => verifyArtifact(manifest, bytes, "")).toThrow(
      "explicit SHA-256",
    );
    expect(() =>
      verifyArtifact(
        {
          ...manifest,
          tarball: { ...manifest.tarball, filename: "../candidate.tgz" },
        },
        bytes,
        digest,
      ),
    ).toThrow("filename");
  });
});

// These isolated cloud/CI tests validate the handoff implementation. They must
// never be part of the real Mac run; the handoff invokes only validate-local.mjs.
function clientFixture() {
  const calls = [];
  const client = {
    listTools: async () => ({
      tools: Array.from({ length: 6 }, () => ({
        annotations: { readOnlyHint: true },
      })),
    }),
    callTool: async (request) => {
      calls.push(request);
      let data = { rows: [] };
      const sql = request.arguments.sql;
      if (sql.includes("mcp_smoke_check")) data.rows = [{ mcp_smoke_check: 1 }];
      else if (sql.includes("bound_value")) data.rows = [{ bound_value: 42 }];
      else if (sql.includes("big_value"))
        data.rows = [{ big_value: "9223372036854775807" }];
      else if (sql === "SHOW TRANSACTION_READ_ONLY")
        data.rows = [{ setting: "true" }];
      else if (request.name === "stream_query")
        data = { totalRows: 2, truncated: true };
      else if (sql.includes("FROM v_catalog.tables"))
        data.rows = [{ table_name: "existing table" }];
      return { structuredContent: { success: true, ...data } };
    },
  };
  return { client, calls };
}
describe("dedicated Mac handoff: safe reads only", () => {
  it("only sends bounded known-safe reads, including optional catalog reads", async () => {
    const { client, calls } = clientFixture();
    const checks = await runReadOnlySmoke(client, {
      catalogs: true,
      schemaName: "existing schema",
    });
    expect(checks).toHaveLength(8);
    expect(
      calls.every(({ name }) =>
        ["execute_query", "stream_query"].includes(name),
      ),
    ).toBe(true);
    for (const { name, arguments: args } of calls) {
      expect(args.sql).toMatch(/^(SELECT\b|SHOW TRANSACTION_READ_ONLY$)/);
      expect(args.sql).not.toContain(";");
      if (name === "execute_query" && args.sql !== "SHOW TRANSACTION_READ_ONLY")
        expect(args.sql).toMatch(/LIMIT (1|5|10)$/);
      if (name === "stream_query") expect(args.maxRows).toBe(2);
    }
    expect(
      calls
        .filter((call) => call.arguments.sql.includes("v_catalog."))
        .every((call) => call.arguments.params?.[0] === "existing schema"),
    ).toBe(true);
  });
  it("refuses database access when tool annotations do not prove the configured mode", async () => {
    const { client, calls } = clientFixture();
    client.listTools = async () => ({ tools: [] });
    await expect(runReadOnlySmoke(client)).rejects.toThrow(
      "Refusing database access",
    );
    expect(calls).toHaveLength(0);
  });
  it("omits catalogs unless explicitly requested", async () => {
    const { client, calls } = clientFixture();
    expect(await runReadOnlySmoke(client)).toHaveLength(6);
    expect(
      calls.some((call) => call.arguments.sql.includes("v_catalog.")),
    ).toBe(false);
  });
});
