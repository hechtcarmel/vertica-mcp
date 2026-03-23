import { VerticaService } from "./vertica-service.js";
import { getDatabaseConfig } from "../config/database.js";
import { LOG_MESSAGES } from "../constants/index.js";

// Connection manager that holds a VerticaService instance and disconnects after idle timeout
export class ConnectionManager {
  private static instance: ConnectionManager;
  private service: VerticaService | null = null;
  private idleTimer: ReturnType<typeof setTimeout> | null = null;

  private constructor() {}

  static getInstance(): ConnectionManager {
    if (!ConnectionManager.instance) {
      ConnectionManager.instance = new ConnectionManager();
    }
    return ConnectionManager.instance;
  }

  // Establish connection on first use
  async getConnection(): Promise<VerticaService> {
    if (!this.service) {
      const config = getDatabaseConfig();
      this.service = new VerticaService(config);
      await this.service.connect();
    }

    this.resetIdleTimer();
    return this.service;
  }

  // Restart the idle timer on every use
  private resetIdleTimer(): void {
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
    }

    const config = getDatabaseConfig();
    const timeout = config.idleTimeout!;

    this.idleTimer = setTimeout(() => {
      this.handleIdleTimeout().catch((error) => {
        console.error(
          "Error during idle disconnect:",
          error instanceof Error ? error.message : String(error)
        );
      });
    }, timeout);
  }

  private async handleIdleTimeout(): Promise<void> {
    this.idleTimer = null;
    if (this.service) {
      console.error(LOG_MESSAGES.DB_IDLE_TIMEOUT);
      await this.service.disconnect();
      this.service = null;
    }
  }

  // Cancel pending idle timer and close the connection
  async disconnect(): Promise<void> {
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }
    if (this.service) {
      await this.service.disconnect();
      this.service = null;
    }
  }
}
