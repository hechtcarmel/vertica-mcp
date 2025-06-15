#!/usr/bin/env node

import "dotenv/config";
import { MCPServer } from "mcp-framework";
import { LOG_MESSAGES } from "./constants/index.js";
import process from "node:process";

async function main() {
  try {
    // Create MCP server instance with automatic tool discovery
    const server = new MCPServer();

    // Set up error handling
    const gracefulShutdown = async () => {
      console.log(LOG_MESSAGES.SERVER_SHUTDOWN);
      process.exit(0);
    };

    process.on("SIGINT", gracefulShutdown);
    process.on("SIGTERM", gracefulShutdown);

    // Start the server
    console.log(LOG_MESSAGES.SERVER_STARTING);
    await server.start();
    console.log(LOG_MESSAGES.SERVER_READY);
  } catch (error) {
    console.error(
      LOG_MESSAGES.SERVER_START_FAILED,
      error instanceof Error ? error.message : String(error)
    );
    process.exit(1);
  }
}

// Run the server
main().catch((error) => {
  console.error(LOG_MESSAGES.UNHANDLED_ERROR, error);
  process.exit(1);
});
