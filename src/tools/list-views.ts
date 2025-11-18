import { z } from "zod";
import type { MCPTool } from "../types/tool.js";
import { VerticaService } from "../services/vertica-service.js";
import { getDatabaseConfig } from "../config/database.js";
import { safeJsonStringify } from "../utils/response-formatter.js";
import { validateSchemaName } from "../utils/table-helpers.js";

interface ListViewsInput {
  schemaName?: string;
}

export default class ListViewsTool implements MCPTool {
  name = "list_views";
  description =
    "List all views in a schema with their definitions and metadata";

  inputSchema = {
    type: "object" as const,
    properties: {
      schemaName: {
        type: "string" as const,
        description:
          "Schema name (optional, defaults to configured default schema)",
      },
    },
  };

  async execute(input: Record<string, unknown>): Promise<string> {
    // Validate input
    const parsed = this.parseInput(input);
    let verticaService: VerticaService | null = null;

    try {
      // Validate schema name if provided
      if (parsed.schemaName) {
        validateSchemaName(parsed.schemaName);
      }

      // Create Vertica service instance
      const config = getDatabaseConfig();
      verticaService = new VerticaService(config);

      // List views
      const views = await verticaService.listViews(parsed.schemaName);

      return safeJsonStringify(
        {
          success: true,
          schema: parsed.schemaName || config.defaultSchema || "public",
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
        2
      );
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      return safeJsonStringify(
        {
          success: false,
          error: errorMessage,
          schemaName: parsed.schemaName,
          queriedAt: new Date().toISOString(),
        },
        2
      );
    } finally {
      if (verticaService) {
        try {
          await verticaService.disconnect();
        } catch (error) {
          console.error("Warning during service cleanup:", error instanceof Error ? error.message : String(error));
        }
      }
    }
  }

  private parseInput(input: Record<string, unknown>): ListViewsInput {
    const schema = z.object({
      schemaName: z.string().optional(),
    });

    return schema.parse(input);
  }
}
