import type { Tool } from "@modelcontextprotocol/sdk/types.js";

export interface MCPTool {
  name: string;
  description: string;
  inputSchema: Tool["inputSchema"];
  execute(args: Record<string, unknown>): Promise<string>;
}
