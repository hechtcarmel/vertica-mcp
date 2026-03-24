import { VerticaService } from "./vertica-service.js";
import { getDatabaseConfig } from "../config/database.js";
import { LOG_MESSAGES } from "../constants/index.js";
import type { VerticaConfig } from "../types/vertica.js";

// Connection manager that holds a VerticaService instance and disconnects after idle timeout
export class ConnectionManager {
  private static instance: ConnectionManager;
  private service: VerticaService | null = null;
  private idleTimer: ReturnType<typeof setTimeout> | null = null;
  private connecting: Promise<void> | null = null;
  private config = getDatabaseConfig();

  private constructor() {}

  static getInstance(): ConnectionManager {
    if (!ConnectionManager.instance) {
      ConnectionManager.instance = new ConnectionManager();
    }
    return ConnectionManager.instance;
  }

  // Establish connection on first use, with optional load balance routing
  async getConnection(): Promise<VerticaService> {
    if (!this.service) {
      // Prevent concurrent connection attempts
      if (!this.connecting) {
        this.connecting = this._connect().finally(() => {
          this.connecting = null;
        });
      }
      await this.connecting;
    }

    this.resetIdleTimer();
    return this.service!;
  }

  private async _connect(): Promise<void> {
    this.service = new VerticaService(this.config);
    await this.service.connect();

    if (this.config.connectionLoadBalance) {
      await this._applyLoadBalance(this.config);
    }
  }

  // Resolve target host via DESCRIBE_LOAD_BALANCE_DECISION, reconnect if different
  private async _applyLoadBalance(config: VerticaConfig): Promise<void> {
    try {
      const service = this.service!;

      // Get client IP from current session
      const ipResult = await service.executeQuery(
        "SELECT SPLIT_PART(CLIENT_HOSTNAME, ':', 1) AS client_ip FROM V_MONITOR.CURRENT_SESSION"
      );
      const clientIp = ipResult.rows[0]?.client_ip as string | undefined;
      if (!clientIp) throw new Error("Could not determine client IP from current session");

      // Get load balance decision for that IP
      const lbResult = await service.executeQuery(
        `SELECT DESCRIBE_LOAD_BALANCE_DECISION('${clientIp}') AS lb_decision`
      );
      const lbOutput = lbResult.rows[0]?.lb_decision as string | undefined;
      if (!lbOutput) throw new Error("Empty load balance decision response");

      const match = lbOutput.match(/Load balance redirect to: \[([^\]]+)\]/);
      if (!match) throw new Error(`Unexpected load balance response: ${lbOutput}`);

      const redirectIp = match[1]!;
      if (redirectIp === service.getHost()) {
        console.error(LOG_MESSAGES.DB_LOAD_BALANCE_SAME);
        return;
      }

      console.error(`${LOG_MESSAGES.DB_LOAD_BALANCE_ROUTING} ${service.getHost()} → ${redirectIp}`);

      // Connect to the target node first, then close the original
      const redirectConfig = { ...config, host: redirectIp };
      const redirected = new VerticaService(redirectConfig);
      await redirected.connect();

      await service.disconnect();
      this.service = redirected;
    } catch (error) {
      // Keep existing connection on initial host - no rethrow
      console.error(
        LOG_MESSAGES.DB_LOAD_BALANCE_SKIP,
        error instanceof Error ? error.message : String(error)
      );
    }
  }

  // Restart the idle timer on every use
  private resetIdleTimer(): void {
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
    }

    this.idleTimer = setTimeout(() => {
      this.handleIdleTimeout().catch((error) => {
        console.error(
          "Error during idle disconnect:",
          error instanceof Error ? error.message : String(error)
        );
      });
    }, this.config.idleTimeout!);
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
