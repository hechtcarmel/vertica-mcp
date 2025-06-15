#!/usr/bin/env node

import { MCPServer } from "mcp-framework";

async function main() {
  try {
    // Create MCP server instance with automatic tool discovery
    const server = new MCPServer();

    // Set up error handling
    const gracefulShutdown = async () => {
      console.log("\n🛑 Shutting down gracefully...");
      process.exit(0);
    };

    process.on("SIGINT", gracefulShutdown);
    process.on("SIGTERM", gracefulShutdown);

    // Start the server
    console.log("🚀 Starting Vertica MCP Server...");
    await server.start();
    console.log(
      "✅ Vertica MCP Server is running and ready to accept connections"
    );
  } catch (error) {
    console.error(
      "❌ Failed to start Vertica MCP Server:",
      error instanceof Error ? error.message : String(error)
    );
    process.exit(1);
  }
}

// Run the server
main().catch((error) => {
  console.error("❌ Unhandled error in main:", error);
  process.exit(1);
});
