import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { URL, fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import process from "node:process";
import {
  classifyFailure,
  failureReport,
  isDirectExecution,
  runReadOnlySmoke,
  validateSession,
  ValidationFailure,
} from "../../scripts/validate-local.mjs";
const directories = [];
afterEach(() => {
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});
const temp = () => {
  const directory = mkdtempSync(join(tmpdir(), "vertica-validator-"));
  directories.push(directory);
  return directory;
};
const privateMarker = "private-password-host-row-path";
function fixture() {
  let era = "modern";
  const client = {
    connect: vi.fn(async () => {}),
    close: vi.fn(async () => {
      era = undefined;
    }),
    getProtocolEra: () => era,
    listTools: vi.fn(async () => ({
      tools: Array.from({ length: 6 }, () => ({
        annotations: { readOnlyHint: true },
      })),
    })),
    callTool: vi.fn(async ({ name, arguments: { sql } }) => {
      const rows = sql.includes("mcp_smoke_check")
        ? [{ mcp_smoke_check: 1 }]
        : sql.includes("bound_value")
          ? [{ bound_value: 42 }]
          : sql.includes("big_value")
            ? [{ big_value: "9223372036854775807" }]
            : [{ setting: "true" }];
      return {
        structuredContent: {
          success: true,
          rows,
          ...(name === "stream_query" ? { totalRows: 2, truncated: true } : {}),
        },
      };
    }),
  };
  return client;
}

describe("validator entry path portability", () => {
  it("recognizes a symlinked file and directory as the same direct entry point", () => {
    const directory = temp();
    const actual = join(directory, "actual file.mjs");
    writeFileSync(actual, "");
    const alias = join(directory, "alias.mjs");
    symlinkSync(actual, alias);
    expect(isDirectExecution(pathToFileURL(actual).href, alias)).toBe(true);
    const directoryAlias = `${directory}-alias`;
    symlinkSync(directory, directoryAlias);
    directories.push(directoryAlias);
    expect(
      isDirectExecution(
        pathToFileURL(actual).href,
        join(directoryAlias, "actual file.mjs"),
      ),
    ).toBe(true);
    expect(
      isDirectExecution(pathToFileURL(actual).href, join(directory, "missing")),
    ).toBe(false);
    expect(isDirectExecution(pathToFileURL(actual).href, undefined)).toBe(
      false,
    );
  });
  it("actually enters the CLI through a symlink instead of silently exiting successfully", () => {
    const alias = join(temp(), "validate-local.mjs");
    symlinkSync(
      fileURLToPath(
        new URL("../../scripts/validate-local.mjs", import.meta.url),
      ),
      alias,
    );
    // Cloud-only Linux test: the platform guard stops before imports or connections.
    const result = spawnSync(process.execPath, [alias], {
      encoding: "utf8",
      timeout: 5000,
    });
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(1);
    expect(result.stdout).toBe("");
    const events = result.stderr
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    expect(events[0]).toEqual({
      event: "stage",
      stage: "initialization",
      status: "started",
    });
    expect(events.at(-1)).toMatchObject({
      event: "failure",
      stage: "initialization",
      category: "unsupported_platform",
    });
    expect(result.stderr).not.toContain(alias);
  });
});

describe("safe incremental diagnostics", () => {
  it.each([
    [{ code: "ENOENT", message: privateMarker }, "missing_local_file"],
    [{ code: "EACCES", message: privateMarker }, "local_access_denied"],
    [
      { code: "ERR_MODULE_NOT_FOUND", message: privateMarker },
      "local_dependency_missing",
    ],
    [
      { code: "ERR_PARSE_ARGS_UNKNOWN_OPTION", message: privateMarker },
      "invalid_arguments",
    ],
    [
      { message: `Invalid database configuration: ${privateMarker}` },
      "invalid_configuration",
    ],
    [{ code: "ECONNREFUSED", message: privateMarker }, "connection_refused"],
    [{ code: "ENOTFOUND", message: privateMarker }, "host_resolution"],
    [
      { code: "ERR_TLS_CERT_ALTNAME_INVALID", message: privateMarker },
      "tls_validation",
    ],
    [{ code: "28P01", message: privateMarker }, "authentication"],
    [{ code: "42501", message: privateMarker }, "database_permission"],
    [{ code: "42601", message: privateMarker }, "database_compatibility"],
    [{ message: `Query read timeout ${privateMarker}` }, "timeout"],
    [{ code: -32601, message: privateMarker }, "protocol_compatibility"],
    [
      { message: `Protocol version not supported: ${privateMarker}` },
      "protocol_compatibility",
    ],
    [{ code: -32000, message: privateMarker }, "server_connection_closed"],
    [{ message: privateMarker }, "unexpected_failure"],
  ])("returns only an allowlisted category for %j", (error, category) => {
    expect(classifyFailure(error)).toBe(category);
    expect(JSON.stringify(failureReport(error))).not.toContain(privateMarker);
  });
  it("emits the started stage while the operation is still pending", async () => {
    const client = fixture();
    const events = [];
    let reject;
    client.listTools.mockImplementation(
      () =>
        new Promise((_, fail) => {
          reject = fail;
        }),
    );
    const pending = runReadOnlySmoke(client, {
      onStage: (event) => events.push(event),
    });
    expect(events).toEqual([
      { event: "stage", stage: "tool_discovery", status: "started" },
    ]);
    reject(new Error(privateMarker));
    await expect(pending).rejects.toThrow("tool_discovery: unexpected_failure");
    expect(events.at(-1)).toMatchObject({
      stage: "tool_discovery",
      status: "failed",
      category: "unexpected_failure",
    });
    expect(JSON.stringify(events)).not.toContain(privateMarker);
  });
  it("reports the failing read and retains earlier passed stages without error/result payloads", async () => {
    const client = fixture();
    const events = [];
    client.callTool.mockResolvedValueOnce({
      structuredContent: {
        success: false,
        error: `password authentication failed: ${privateMarker}`,
        rows: [{ secret: privateMarker }],
      },
      isError: true,
    });
    await expect(
      validateSession(client, {}, { onStage: (event) => events.push(event) }),
    ).rejects.toThrow("constant_read: authentication");
    expect(events).toContainEqual({
      event: "stage",
      stage: "connect",
      status: "passed",
    });
    expect(events).toContainEqual({
      event: "stage",
      stage: "tool_discovery",
      status: "passed",
    });
    expect(events).toContainEqual(
      expect.objectContaining({
        stage: "constant_read",
        status: "failed",
        category: "authentication",
      }),
    );
    expect(events.at(-1)).toEqual({
      event: "stage",
      stage: "shutdown",
      status: "passed",
    });
    expect(JSON.stringify(events)).not.toContain(privateMarker);
    expect(client.close).toHaveBeenCalledOnce();
  });
  it("handles text errors and malformed responses without exposing their contents", async () => {
    for (const response of [
      {
        isError: true,
        content: [
          {
            type: "text",
            text: JSON.stringify({
              success: false,
              error: { code: "42601", message: privateMarker },
              rows: [{ secret: privateMarker }],
            }),
          },
        ],
      },
      { content: [{ type: "text", text: privateMarker }] },
    ]) {
      const client = fixture();
      const events = [];
      client.callTool.mockResolvedValueOnce(response);
      await expect(
        validateSession(client, {}, { onStage: (event) => events.push(event) }),
      ).rejects.toBeInstanceOf(ValidationFailure);
      expect(events).toContainEqual(
        expect.objectContaining({ stage: "constant_read", status: "failed" }),
      );
      expect(JSON.stringify(events)).not.toContain(privateMarker);
      expect(client.close).toHaveBeenCalledOnce();
    }
  });
  it("classifies an early connection failure using only a sanitized startup category", async () => {
    const client = fixture();
    const events = [];
    client.connect.mockRejectedValue(
      Object.assign(new Error(privateMarker), { code: -32000 }),
    );
    await expect(
      validateSession(
        client,
        {},
        {
          onStage: (event) => events.push(event),
          startupCategory: () => "invalid_configuration",
        },
      ),
    ).rejects.toThrow("connect: invalid_configuration");
    expect(client.listTools).not.toHaveBeenCalled();
    expect(client.callTool).not.toHaveBeenCalled();
    expect(JSON.stringify(events)).not.toContain(privateMarker);
    expect(client.close).toHaveBeenCalledOnce();
  });
  it("reports shutdown failures without masking an earlier query failure", async () => {
    const client = fixture();
    const events = [];
    client.callTool.mockRejectedValueOnce(
      Object.assign(new Error(privateMarker), { code: "42501" }),
    );
    client.close.mockRejectedValue(new Error(privateMarker));
    await expect(
      validateSession(client, {}, { onStage: (event) => events.push(event) }),
    ).rejects.toThrow("constant_read: database_permission");
    expect(events.at(-1)).toMatchObject({
      stage: "shutdown",
      status: "failed",
      category: "unexpected_failure",
    });
    expect(JSON.stringify(events)).not.toContain(privateMarker);
  });
  it("returns success only after cleanup and preserves the negotiated era before closing", async () => {
    const client = fixture();
    const events = [];
    expect(
      await validateSession(
        client,
        {},
        { onStage: (event) => events.push(event) },
      ),
    ).toMatchObject({ success: true, protocol: "modern" });
    expect(events.at(-1)).toEqual({
      event: "stage",
      stage: "shutdown",
      status: "passed",
    });
  });
  it("does not forward mutable fields from errors into reports", () => {
    const error = new ValidationFailure("initialization", "invalid_arguments");
    error.stage = privateMarker;
    error.category = privateMarker;
    expect(failureReport(error)).toMatchObject({
      stage: "initialization",
      category: "unexpected_failure",
    });
    expect(JSON.stringify(failureReport(error))).not.toContain(privateMarker);
  });
});
