import { DATABASE_CONSTANTS } from "../constants/index.js";
import { VerticaService } from "./vertica-service.js";
import type { VerticaConfig } from "../types/vertica.js";
import { isIP } from "node:net";

type ServiceFactory = (config: VerticaConfig) => VerticaService;

/** Owns a lazy connection and leases it for the entire tool operation. */
export class ConnectionManager {
  private service: VerticaService | null = null;
  private idleTimer: ReturnType<typeof setTimeout> | null = null;
  private queue: Promise<unknown> = Promise.resolve();
  private closed = false;

  constructor(
    private readonly config: VerticaConfig,
    private readonly createService: ServiceFactory = (options) =>
      new VerticaService(options),
  ) {}

  withConnection<T>(
    operation: (service: VerticaService) => Promise<T>,
    signal?: AbortSignal,
  ): Promise<T> {
    const run = this.queue.then(async () => {
      if (this.closed) throw new Error("Connection manager is closed");
      signal?.throwIfAborted();
      this.clearIdleTimer();
      try {
        if (!this.service?.isConnected()) {
          await this.service?.disconnect();
          const candidate = this.createService(this.config);
          try {
            await candidate.connect();
          } catch (error) {
            await candidate.disconnect();
            throw error;
          }
          this.service = candidate;
          if (this.config.connectionLoadBalance)
            await this.applyLoadBalance(candidate);
        }
        if (this.closed) throw new Error("Connection manager is closed");
        signal?.throwIfAborted();
        return await operation(this.service!);
      } finally {
        if (!this.closed) {
          this.idleTimer = setTimeout(() => {
            this.idleTimer = null;
            // Queue disconnect behind any request that acquired the lease first.
            const close = this.queue.then(async () => {
              const service = this.service;
              this.service = null;
              await service?.disconnect();
            });
            this.queue = close.catch(() => {});
          }, this.config.idleTimeout ?? DATABASE_CONSTANTS.DEFAULT_IDLE_TIMEOUT);
          this.idleTimer.unref();
        }
      }
    });
    this.queue = run.catch(() => {});
    return run;
  }

  private async applyLoadBalance(service: VerticaService): Promise<void> {
    let redirected: VerticaService | undefined;
    try {
      const ipResult = await service.executeQuery(
        "SELECT CLIENT_HOSTNAME AS client_ip FROM V_MONITOR.CURRENT_SESSION",
      );
      const rawIp = String(ipResult.rows[0]?.client_ip ?? "");
      const clientIp = isIP(rawIp)
        ? rawIp
        : rawIp.replace(/^\[|\](?::\d+)?$|:\d+$/g, "");
      if (!isIP(clientIp)) throw new Error("Could not determine client IP");
      const decision = await service.executeQuery(
        "SELECT DESCRIBE_LOAD_BALANCE_DECISION(?) AS lb_decision",
        [clientIp],
      );
      const host = String(decision.rows[0]?.lb_decision ?? "").match(
        /Load balance redirect to: \[([^\]]+)\]/,
      )?.[1];
      if (!host || !isIP(host))
        throw new Error("No valid load balance redirect");
      if (host === service.getHost()) return;
      redirected = this.createService({ ...this.config, host });
      await redirected.connect();
      this.service = redirected;
      await service.disconnect();
    } catch {
      await redirected?.disconnect();
      console.error("Load balance routing unavailable; using the initial host");
    }
  }

  private clearIdleTimer(): void {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.idleTimer = null;
  }

  async disconnect(): Promise<void> {
    this.closed = true;
    this.clearIdleTimer();
    // Interrupt in-flight driver work, then wait for its lease to settle.
    await this.service?.disconnect();
    await this.queue;
    const service = this.service;
    this.service = null;
    await service?.disconnect();
  }
}
