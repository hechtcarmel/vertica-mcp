import { afterEach, describe, expect, it } from "vitest";
import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { once } from "node:events";
import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";
import { VERSION } from "../src/version.js";
const entry = resolve("dist/index.js");
const directories: string[] = [];
const environment = () =>
  Object.fromEntries(
    Object.entries(process.env).filter(
      ([key, value]) => !key.startsWith("VERTICA_") && value !== undefined,
    ),
  ) as Record<string, string>;
afterEach(() => {
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});
function directory() {
  const path = mkdtempSync(join(tmpdir(), "vertica-cli-"));
  directories.push(path);
  return path;
}
function run(args: string[]) {
  return spawnSync(process.execPath, [entry, ...args], {
    env: environment(),
    cwd: directory(),
    encoding: "utf8",
    timeout: 5000,
  });
}
describe("packaged CLI", () => {
  it.each(["--help", "-h"])("supports %s without configuration", (flag) => {
    const p = run([flag]);
    expect(p.error).toBeUndefined();
    expect(p.status).toBe(0);
    expect(p.stdout).toContain("--env-file");
    expect(p.stderr).toBe("");
  });
  it.each(["--version", "-v"])("supports %s without configuration", (flag) => {
    const p = run([flag]);
    expect(p.error).toBeUndefined();
    expect(p.status).toBe(0);
    expect(p.stdout.trim()).toBe(VERSION);
  });
  it.each([
    { args: ["--no-such-option"] },
    { args: ["-e", "/missing-vertica-env"] },
    { args: [] },
  ])("fails cleanly for %j", ({ args }) => {
    const p = run(args);
    expect(p.status).toBe(1);
    expect(p.stdout).toBe("");
    expect(p.stderr).not.toBe("");
  });
  it.each([".env", "custom.env", "long-option.env"])(
    "loads %s before configuration and keeps stdout protocol-clean",
    async (filename) => {
      const cwd = directory();
      writeFileSync(
        join(cwd, filename),
        "VERTICA_HOST=localhost\nVERTICA_DATABASE=test\nVERTICA_USER=test\nVERTICA_PASSWORD=never-log-this\n",
      );
      const transport = new StdioClientTransport({
        command: process.execPath,
        args: [
          entry,
          ...(filename === ".env"
            ? []
            : [
                filename === "long-option.env" ? "--env-file" : "-e",
                join(cwd, filename),
              ]),
        ],
        cwd,
        env: environment(),
        stderr: "pipe",
      });
      let stderr = "";
      transport.stderr?.on("data", (data: Buffer) => {
        stderr += data.toString();
      });
      const client = new Client({ name: "stdio-test", version: "1" });
      try {
        await client.connect(transport);
        expect((await client.listTools()).tools).toHaveLength(6);
        const response = await client.callTool({
          name: "execute_query",
          arguments: { sql: "DROP TABLE t" },
        });
        expect(response.isError).toBe(true);
        expect(stderr).not.toContain("never-log-this");
      } finally {
        await client.close();
      }
    },
  );
  it.each(["legacy", "modern", "auto"] as const)(
    "serves the %s protocol through the official SDK entry point",
    async (mode) => {
      const transport = new StdioClientTransport({
        command: process.execPath,
        args: [entry],
        env: {
          ...environment(),
          VERTICA_HOST: "localhost",
          VERTICA_DATABASE: "test",
          VERTICA_USER: "test",
        },
        stderr: "pipe",
      });
      const client = new Client(
        { name: "protocol-era-test", version: "1" },
        {
          versionNegotiation: {
            mode: mode === "modern" ? { pin: "2026-07-28" } : mode,
          },
        },
      );
      try {
        await client.connect(transport);
        expect(client.getProtocolEra()).toBe(
          mode === "legacy" ? "legacy" : "modern",
        );
        const tools = await client.listTools();
        expect(tools.tools).toHaveLength(6);
        const response = await client.callTool({
          name: "execute_query",
          arguments: { sql: "DELETE FROM t" },
        });
        expect(response.isError).toBe(true);
        expect(response.structuredContent).toMatchObject({
          success: false,
          query: "DELETE FROM t",
        });
      } finally {
        await client.close();
      }
    },
  );
  it.each(["SIGTERM", "SIGINT", "EOF"])(
    "exits on %s with no database connection",
    async (signal) => {
      const child = spawn(process.execPath, [entry], {
        cwd: directory(),
        env: {
          ...environment(),
          VERTICA_HOST: "localhost",
          VERTICA_DATABASE: "test",
          VERTICA_USER: "test",
        },
        stdio: ["pipe", "pipe", "pipe"],
      });
      const ready = once(child.stderr, "data");
      await ready;
      const exit = once(child, "exit");
      if (signal === "EOF") child.stdin.end();
      else child.kill(signal as NodeJS.Signals);
      expect((await exit)[0]).toBe(0);
    },
  );
});
