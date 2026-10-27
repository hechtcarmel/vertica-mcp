import { afterEach, describe, expect, it, vi } from "vitest";
import { ConnectionManager } from "../../src/services/connection-manager.js";
import { config, deferred, setup, result } from "../helpers.js";

afterEach(() => vi.useRealTimers());
describe("connection leases", () => {
  it("is lazy, serializes callers, and waits until work finishes to start idle time", async () => {
    vi.useFakeTimers();
    const { service, client } = setup();
    const factory = vi.fn(() => service);
    const manager = new ConnectionManager(config, factory);
    const gate = deferred<void>();
    expect(factory).not.toHaveBeenCalled();
    const a = manager.withConnection(async () => gate.promise);
    await vi.advanceTimersByTimeAsync(0);
    const op = vi.fn(async () => 42);
    const b = manager.withConnection(op);
    await vi.advanceTimersByTimeAsync(120000);
    expect(client.end).not.toHaveBeenCalled();
    expect(op).not.toHaveBeenCalled();
    gate.resolve();
    await a;
    expect(await b).toBe(42);
    await vi.advanceTimersByTimeAsync(59999);
    expect(client.end).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(client.end).toHaveBeenCalledTimes(1);
    await manager.withConnection(async () => {});
    expect(factory).toHaveBeenCalledTimes(2);
    await manager.disconnect();
  });
  it("recovers from connection failures and rejected operations", async () => {
    const { service, client } = setup();
    client.connect.mockRejectedValueOnce(new Error("refused"));
    const manager = new ConnectionManager(config, () => service);
    await expect(manager.withConnection(async () => 1)).rejects.toThrow(
      "refused",
    );
    await expect(
      manager.withConnection(async () => {
        throw new Error("bad");
      }),
    ).rejects.toThrow("bad");
    expect(await manager.withConnection(async () => 42)).toBe(42);
    await manager.disconnect();
    await expect(manager.withConnection(async () => 1)).rejects.toThrow(
      "closed",
    );
  });
  it("skips cancelled queued calls", async () => {
    const { service } = setup();
    const manager = new ConnectionManager(config, () => service);
    const abort = new AbortController();
    abort.abort();
    await expect(
      manager.withConnection(async () => 1, abort.signal),
    ).rejects.toThrow();
    expect(service.isConnected()).toBe(false);
    await manager.disconnect();
  });
  it("closes a connection that finishes opening during shutdown", async () => {
    const { service, client } = setup();
    const gate = deferred<void>();
    client.connect.mockReturnValueOnce(gate.promise);
    const manager = new ConnectionManager(config, () => service);
    const pending = manager.withConnection(async () => 1);
    await new Promise<void>((resolve) => setImmediate(resolve));
    const close = manager.disconnect();
    gate.resolve();
    await expect(pending).rejects.toThrow("closed");
    await close;
    expect(service.isConnected()).toBe(false);
    expect(client.end).toHaveBeenCalledTimes(1);
  });
});

describe("load balancing", () => {
  it.each(["10.0.0.1:5433", "[2001:db8::1]:5433"])(
    "binds client IP %s and closes the original only after redirect success",
    async (clientIp) => {
      const first = setup();
      const second = setup({ host: "10.0.0.2" });
      first.client.query.mockImplementation(async (sql) => {
        if (sql.includes("CLIENT_HOSTNAME"))
          return result([{ client_ip: clientIp }]);
        if (sql.includes("DESCRIBE_LOAD_BALANCE_DECISION"))
          return result([
            { lb_decision: "Load balance redirect to: [10.0.0.2]" },
          ]);
        return result();
      });
      const factory = vi
        .fn()
        .mockReturnValueOnce(first.service)
        .mockReturnValueOnce(second.service);
      const manager = new ConnectionManager(
        { ...config, connectionLoadBalance: true },
        factory,
      );
      expect(
        await manager.withConnection(async (service) => service.getHost()),
      ).toBe("10.0.0.2");
      expect(first.client.query).toHaveBeenCalledWith(
        expect.stringContaining("DESCRIBE_LOAD_BALANCE_DECISION(?)"),
        [clientIp.startsWith("[") ? "2001:db8::1" : "10.0.0.1"],
      );
      expect(first.client.end).toHaveBeenCalled();
      await manager.disconnect();
      expect(second.client.end).toHaveBeenCalled();
    },
  );
  it.each([
    "bad response",
    "Load balance redirect to: [10.0.0.2]",
    "Load balance redirect to: [localhost]",
  ])("keeps initial connection on redirect failure: %s", async (decision) => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const first = setup();
    const second = setup();
    second.client.connect.mockRejectedValue(new Error("refused"));
    first.client.query.mockImplementation(async (sql) =>
      result(
        sql.includes("CLIENT_HOSTNAME")
          ? [{ client_ip: "10.0.0.1" }]
          : sql.includes("DESCRIBE_LOAD_BALANCE_DECISION")
            ? [{ lb_decision: decision }]
            : [],
      ),
    );
    const factory = vi
      .fn()
      .mockReturnValueOnce(first.service)
      .mockReturnValueOnce(second.service);
    const manager = new ConnectionManager(
      { ...config, connectionLoadBalance: true },
      factory,
    );
    expect(
      await manager.withConnection(async (service) => service.getHost()),
    ).toBe("localhost");
    expect(first.client.end).not.toHaveBeenCalled();
    await manager.disconnect();
  });
});
