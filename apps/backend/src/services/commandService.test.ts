import test from "node:test";
import assert from "node:assert/strict";
import { createCommandService, CommandError, NO_COMMAND } from "./commandService.js";
import type { DeviceCommand } from "../../prisma/generated/client/client.js";

class InMemoryRepo {
  commands: DeviceCommand[] = [];
  installations = new Set<string>(["PSVG-RNDTEST5"]);

  async installationExists(installationId: string) {
    return this.installations.has(installationId);
  }

  async expireCommands(now: Date) {
    let n = 0;
    for (const c of this.commands) {
      if (
        (c.status === "pending" || c.status === "sent") &&
        c.expiresAt &&
        c.expiresAt.getTime() < now.getTime()
      ) {
        c.status = "expired";
        c.ackedAt = now;
        c.ackMessage = "expired by server ttl";
        n++;
      }
    }
    return n;
  }

  async findActiveByInstallationModule(installationId: string, module: number) {
    return (
      this.commands.find(
        (c) =>
          c.installationId === installationId &&
          c.module === module &&
          (c.status === "pending" || c.status === "sent"),
      ) ?? null
    );
  }

  async createCommand(data: {
    id: string;
    installationId: string;
    module: number;
    power: "on" | "off";
    requestedBy?: string | null;
    expiresAt?: Date | null;
  }) {
    const cmd: DeviceCommand = {
      id: data.id,
      installationId: data.installationId,
      module: data.module,
      power: data.power,
      status: "pending",
      requestedBy: data.requestedBy ?? null,
      createdAt: new Date(),
      sentAt: null,
      ackedAt: null,
      ackMessage: null,
      expiresAt: data.expiresAt ?? null,
      retryCount: 0,
    };
    this.commands.push(cmd);
    return cmd;
  }

  async findOldestPending(installationId: string, now: Date) {
    const filtered = this.commands
      .filter(
        (c) =>
          c.installationId === installationId &&
          c.status === "pending" &&
          (!c.expiresAt || c.expiresAt.getTime() >= now.getTime()),
      )
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    return filtered[0] ?? null;
  }

  async markSent(id: string, sentAt: Date) {
    const cmd = this.commands.find((c) => c.id === id);
    if (!cmd) throw new Error("missing command");
    cmd.status = "sent";
    cmd.sentAt = sentAt;
    return cmd;
  }

  async findById(id: string) {
    return this.commands.find((c) => c.id === id) ?? null;
  }

  async markAck(
    id: string,
    status: "acked" | "failed" | "pending" | "sent" | "expired" | "cancelled",
    ackedAt: Date,
    ackMessage?: string | null,
  ) {
    const cmd = this.commands.find((c) => c.id === id);
    if (!cmd) throw new Error("missing command");
    cmd.status = status;
    cmd.ackedAt = ackedAt;
    cmd.ackMessage = ackMessage ?? null;
    return cmd;
  }

  async listHistory(installationId: string, limit: number) {
    return this.commands
      .filter((c) => c.installationId === installationId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, limit);
  }
}

test("create -> poll -> ack success flow", async () => {
  const repo = new InMemoryRepo();
  const service = createCommandService(repo, { maxModules: 6, ttlSeconds: 60 });

  const created = await service.create({
    installationId: "PSVG-RNDTEST5",
    module: 2,
    power: "off",
    requestedBy: "admin@company.com",
  });
  assert.equal(created.status, "pending");

  const polled = await service.poll("PSVG-RNDTEST5");
  assert.equal(polled.id, created.id);
  assert.equal(polled.module, 2);
  assert.equal(polled.power, "off");

  const acked = await service.ack({ id: created.id, ok: true, message: "queued" });
  assert.equal(acked.status, "acked");
  assert.equal(acked.ackMessage, "queued");
});

test("invalid module/power are rejected", async () => {
  const repo = new InMemoryRepo();
  const service = createCommandService(repo, { maxModules: 6, ttlSeconds: 60 });

  await assert.rejects(
    () => service.create({ installationId: "PSVG-RNDTEST5", module: 9, power: "off" }),
    (err: unknown) =>
      err instanceof CommandError && err.code === "INVALID_MODULE" && err.httpStatus === 400,
  );
  await assert.rejects(
    () => service.create({ installationId: "PSVG-RNDTEST5", module: 1, power: "toggle" }),
    (err: unknown) =>
      err instanceof CommandError && err.code === "INVALID_POWER" && err.httpStatus === 400,
  );
});

test("no pending command returns sentinel payload", async () => {
  const repo = new InMemoryRepo();
  const service = createCommandService(repo, { maxModules: 6, ttlSeconds: 60 });
  const none = await service.poll("PSVG-RNDTEST5");
  assert.deepEqual(none, NO_COMMAND);
});

test("duplicate ack is idempotent", async () => {
  const repo = new InMemoryRepo();
  const service = createCommandService(repo, { maxModules: 6, ttlSeconds: 60 });

  const created = await service.create({
    installationId: "PSVG-RNDTEST5",
    module: 3,
    power: "on",
  });
  await service.poll("PSVG-RNDTEST5");
  const first = await service.ack({ id: created.id, ok: true, message: "queued" });
  assert.equal(first.idempotent, false);
  const second = await service.ack({ id: created.id, ok: true, message: "queued" });
  assert.equal(second.idempotent, true);
  assert.equal(second.status, "acked");
});
