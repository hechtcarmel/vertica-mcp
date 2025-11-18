#!/usr/bin/env node

import { parseArgs } from "node:util";
import { resolve } from "node:path";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import dotenv from "dotenv";

// Read version from package.json
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const packageJson = JSON.parse(
  readFileSync(join(__dirname, "..", "package.json"), "utf-8")
);
const VERSION = packageJson.version;

// Parse command line arguments
const { values } = parseArgs({
  args: process.argv.slice(2),
  options: {
    "env-file": {
      type: "string",
      short: "e",
    },
    help: {
      type: "boolean",
      short: "h",
    },
    version: {
      type: "boolean",
      short: "v",
    },
  },
  allowPositionals: false,
});

// Handle help flag
if (values.help) {
  console.log(`
Vertica MCP Server

Usage: npx @hechtcarmel/vertica-mcp [options]

Options:
  -e, --env-file <path>    Path to environment file (default: .env in current directory)
  -h, --help              Show this help message
  -v, --version           Show version number

Examples:
  npx @hechtcarmel/vertica-mcp
  npx @hechtcarmel/vertica-mcp --env-file /path/to/custom.env
  npx @hechtcarmel/vertica-mcp -e ~/.config/vertica/production.env
`);
  process.exit(0);
}

// Handle version flag
if (values.version) {
  console.log(VERSION);
  process.exit(0);
}

// Load environment file
const envFile = values["env-file"];
if (envFile) {
  const envPath = resolve(envFile);
  if (!existsSync(envPath)) {
    console.error(`Error: Environment file not found: ${envPath}`);
    process.exit(1);
  }
  console.error(`Loading environment from: ${envPath}`);
  dotenv.config({ path: envPath });
} else {
  // Load default .env file if it exists
  dotenv.config();
}

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

// Import all tools
import ExecuteQueryTool from "./tools/execute-query.js";
import StreamQueryTool from "./tools/stream-query.js";
import ListTablesTool from "./tools/list-tables.js";
import ListViewsTool from "./tools/list-views.js";
import ListIndexesTool from "./tools/list-indexes.js";
import GetTableStructureTool from "./tools/get-table-structure.js";

// Create server instance
const server = new Server(
  {
    name: "@hechtcarmel/vertica-mcp",
    version: VERSION,
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Initialize all tools
const tools = [
  new ExecuteQueryTool(),
  new StreamQueryTool(),
  new ListTablesTool(),
  new ListViewsTool(),
  new ListIndexesTool(),
  new GetTableStructureTool(),
];

// Register list tools handler
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
    })),
  };
});

// Register call tool handler
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  const tool = tools.find((t) => t.name === name);
  if (!tool) {
    throw new Error(`Unknown tool: ${name}`);
  }

  try {
    const result = await tool.execute(args || {});
    return {
      content: [
        {
          type: "text",
          text: result,
        },
      ],
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              success: false,
              error: errorMessage,
              executedAt: new Date().toISOString(),
            },
            null,
            2
          ),
        },
      ],
      isError: true,
    };
  }
});

// Start the server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Vertica MCP Server running on stdio");
}

// Global error handlers for production stability
process.on("unhandledRejection", (reason, promise) => {
  console.error("Unhandled Rejection at:", promise, "reason:", reason);
});

process.on("uncaughtException", (error) => {
  console.error("Uncaught Exception:", error);
  process.exit(1);
});

process.on("SIGTERM", () => {
  console.error("Received SIGTERM, shutting down gracefully");
  process.exit(0);
});

process.on("SIGINT", () => {
  console.error("Received SIGINT, shutting down gracefully");
  process.exit(0);
});

main().catch((error) => {
  console.error("Fatal error in main():", error);
  process.exit(1);
});
