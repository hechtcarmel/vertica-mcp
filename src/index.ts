#!/usr/bin/env node
import { parseArgs } from "node:util";
import { resolve } from "node:path";
import dotenv from "dotenv";
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { loadDatabaseConfig } from "./config/database.js";
import { createServer } from "./server.js";
import { VERSION } from "./version.js";

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      "env-file": { type: "string", short: "e" },
      help: { type: "boolean", short: "h" },
      version: { type: "boolean", short: "v" },
    },
    allowPositionals: false,
  });
  if (values.help) {
    console.log(
      `Vertica MCP Server\n\nUsage: npx @hechtcarmel/vertica-mcp [options]\n\n  -e, --env-file <path>  Environment file (default: .env in current directory)\n  -h, --help             Show help\n  -v, --version          Show version`,
    );
    return;
  }
  if (values.version) {
    console.log(VERSION);
    return;
  }
  const envFile = values["env-file"];
  const loaded = dotenv.config({
    ...(envFile ? { path: resolve(envFile) } : {}),
    quiet: true,
  });
  if (envFile && loaded.error)
    throw new Error(`Cannot read environment file: ${resolve(envFile)}`);
  const config = loadDatabaseConfig();
  const handle = serveStdio(() => createServer(config), {
    onerror: () => console.error("MCP transport error"),
  });
  let shuttingDown = false;
  const shutdown = (exitCode: number) => {
    if (shuttingDown) return;
    shuttingDown = true;
    // Keep shutdown bounded even if a driver or an in-flight connection stalls.
    const timer = setTimeout(() => process.exit(1), 5000);
    timer.unref();
    void handle
      .close()
      .then(() => {
        clearTimeout(timer);
        process.exitCode = exitCode;
      })
      .catch(() => {
        clearTimeout(timer);
        process.exitCode = 1;
      });
  };
  process.once("SIGINT", () => shutdown(0));
  process.once("SIGTERM", () => shutdown(0));
  process.stdin.once("end", () => shutdown(0));
  process.once("uncaughtException", () => {
    console.error("Fatal server error");
    shutdown(1);
  });
  process.once("unhandledRejection", () => {
    console.error("Unhandled server rejection");
    shutdown(1);
  });
  console.error(`Vertica MCP ${VERSION} running on stdio`);
}

main().catch((error: unknown) => {
  console.error(
    error instanceof Error ? error.message : "Failed to start Vertica MCP",
  );
  process.exitCode = 1;
});
