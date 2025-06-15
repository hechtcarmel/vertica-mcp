import { MCPTool } from "mcp-framework";
import { VerticaService } from "../services/vertica-service.js";
import { getDatabaseConfig } from "../config/database.js";
import {
  createSuccessResponse,
  createErrorResponse,
} from "../utils/response-formatter.js";
import type { BaseError } from "../types/errors.js";

/**
 * Base class for all Vertica MCP tools
 * Provides common functionality like service management and error handling
 */
export abstract class BaseTool<
  TInput extends Record<string, any> = Record<string, any>,
  TOutput = unknown
> extends MCPTool<TInput> {
  protected service: VerticaService | null = null;

  /**
   * Get or create a Vertica service instance
   * Implements lazy initialization and connection reuse
   */
  protected async getService(): Promise<VerticaService> {
    if (!this.service) {
      const config = getDatabaseConfig();
      this.service = new VerticaService(config);
    }
    return this.service;
  }

  /**
   * Execute the tool operation with consistent error handling
   */
  async execute(input: TInput): Promise<string> {
    try {
      const result = await this.executeOperation(input);
      return createSuccessResponse(result);
    } catch (error) {
      return this.handleError(error, input);
    } finally {
      await this.cleanup();
    }
  }

  /**
   * Abstract method that subclasses must implement
   * Contains the actual business logic for the tool
   */
  protected abstract executeOperation(input: TInput): Promise<TOutput>;

  /**
   * Handle errors consistently across all tools
   */
  protected handleError(error: unknown, input: TInput): string {
    let formattedError: BaseError;

    if (error instanceof Error) {
      formattedError = {
        message: error.message,
        details: { input },
      };
    } else {
      formattedError = {
        message: String(error),
        details: { input },
      };
    }

    return createErrorResponse(formattedError);
  }

  /**
   * Cleanup resources (disconnect from database)
   */
  protected async cleanup(): Promise<void> {
    if (this.service) {
      try {
        await this.service.disconnect();
      } catch (error) {
        console.warn("Warning during service cleanup:", error);
      } finally {
        this.service = null;
      }
    }
  }

  /**
   * Validate required input fields
   */
  protected validateRequired<T>(
    value: T | undefined | null,
    fieldName: string
  ): T {
    if (value === undefined || value === null || value === "") {
      throw new Error(`${fieldName} is required`);
    }
    return value;
  }
}
