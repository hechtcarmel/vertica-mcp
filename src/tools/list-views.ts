import { z } from "zod";
import { MCPTool } from "mcp-framework";
import { VerticaService } from "../services/vertica-service.js";
import { getDatabaseConfig } from "../config/database.js";

interface ListViewsInput {
  schemaName?: string;
}

export default class ListViewsTool extends MCPTool<ListViewsInput> {
  name = "list_views";
  description =
    "List all views in a schema with their definitions and metadata";

  schema = {
    schemaName: {
      type: z.string().optional(),
      description:
        "Schema name (optional, defaults to configured default schema)",
    },
  };

  async execute(input: ListViewsInput) {
    try {
      // Create Vertica service instance
      const config = getDatabaseConfig();
      const verticaService = new VerticaService(config);

      try {
        // List views
        const views = await verticaService.listViews(input.schemaName);

        return JSON.stringify(
          {
            success: true,
            schema: input.schemaName || config.defaultSchema || "public",
            viewCount: views.length,
            views: views.map((view) => ({
              schemaName: view.schemaName,
              viewName: view.viewName,
              owner: view.owner,
              comment: view.comment,
              definition:
                view.definition.substring(0, 200) +
                (view.definition.length > 200 ? "..." : ""),
            })),
            queriedAt: new Date().toISOString(),
          },
          null,
          2
        );
      } finally {
        // Always disconnect
        await verticaService.disconnect();
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      return JSON.stringify(
        {
          success: false,
          error: errorMessage,
          schemaName: input.schemaName,
          queriedAt: new Date().toISOString(),
        },
        null,
        2
      );
    }
  }
}
