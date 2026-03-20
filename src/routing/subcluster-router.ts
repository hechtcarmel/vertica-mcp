import vertica from "vertica-nodejs";
import { isWithinSchedule, type SubclusterSchedule } from "./schedule.js";

const verticaTyped = vertica as any;

function shuffle<T>(arr: T[]): T[] {
  const result = [...arr];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j]!, result[i]!];
  }
  return result;
}

export interface SubclusterRouterConfig {
  primary: { hosts: string[] };
  secondary: { hosts: string[]; schedule: SubclusterSchedule };
  port: number;
  user: string;
  password?: string;
  database: string;
  queryTimeout?: number;
  ssl?: boolean;
  sslRejectUnauthorized?: boolean;
}

export class SubclusterRouter {
  constructor(private readonly config: SubclusterRouterConfig) {}

  /**
   * Connect to the appropriate subcluster based on current time.
   * Within secondary schedule: tries secondary first, falls back to primary if all fail.
   * Outside secondary schedule: connects directly to primary.
   * Hosts are shuffled randomly; failed hosts are removed before trying the next.
   */
  async connect(): Promise<any> {
    const secondary = this.config.secondary;
    const hasSecondary = secondary.hosts.length > 0;

    if (hasSecondary && isWithinSchedule(secondary.schedule)) {
      const client = await this.trySubcluster(
        secondary.hosts,
        "secondary_subcluster"
      );
      if (client !== null) return client;

      const primaryClient = await this.trySubcluster(
        this.config.primary.hosts,
        "default_subcluster"
      );
      if (primaryClient !== null) return primaryClient;

      throw new Error(
        "Failed to connect to Vertica: all hosts in all subclusters are unreachable"
      );
    }

    const client = await this.trySubcluster(
      this.config.primary.hosts,
      "default_subcluster"
    );
    if (client !== null) return client;

    throw new Error(
      "Failed to connect to Vertica: all default_subcluster hosts are unreachable"
    );
  }

  private async trySubcluster(
    hosts: string[],
    subclusterName: string
  ): Promise<any | null> {
    const remaining = shuffle(hosts);
    while (remaining.length > 0) {
      const host = remaining.shift()!;
      try {
        const client = await this.makeClient(host);
        console.error(
          `Connected to Vertica subcluster: ${subclusterName} (${host}:${this.config.port}/${this.config.database})`
        );
        return client;
      } catch (err) {
        console.error(
          `Failed to connect to ${subclusterName} host ${host}: ${
            err instanceof Error ? err.message : String(err)
          }`
        );
      }
    }
    return null;
  }

  private async makeClient(host: string): Promise<any> {
    const cfg = this.config;
    const clientConfig: Record<string, any> = {
      host,
      port: cfg.port,
      database: cfg.database,
      user: cfg.user,
      password: cfg.password,
      connectionTimeoutMillis: cfg.queryTimeout ?? 30000,
      ssl: cfg.ssl
        ? (cfg.sslRejectUnauthorized !== undefined
            ? cfg.sslRejectUnauthorized
            : true)
        : false,
    };
    const client = new verticaTyped.Client(clientConfig);
    await client.connect();
    return client;
  }
}

// Module-level singleton - persists across tool calls within a single MCP process
let instance: SubclusterRouter | null = null;

export function getRouter(config: SubclusterRouterConfig): SubclusterRouter {
  if (!instance) {
    instance = new SubclusterRouter(config);
  }
  return instance;
}

/** Reset the singleton (useful in tests) */
export function resetRouter(): void {
  instance = null;
}
