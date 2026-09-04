import test from "node:test";
import assert from "node:assert/strict";
import { createCommandService, CommandError, NO_COMMAND } from "./commandService.js";
import type { DeviceCommand } from "../../prisma/generated/client/client.js";

class InMemoryRepo {
  commands: DeviceCommand[] = [];
  installations = new Set<string>(["PSVG-RNDTEST5"]);
  moduleTypes = new Map<string, string>();

  async installationExists(installationId: string) {
    return this.installations.has(installationId);
  }

  async getModuleType(installationId: string) {
    return this.moduleTypes.get(installationId) ?? null;
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
    power: "on" | "off" | "refresh" | "refreshSettings" | "setBasic";
    requestedBy?: string | null;
    expiresAt?: Date | null;
    fields?: unknown;
  }) {
    const cmd: DeviceCommand = {
      id: data.id,
      installationId: data.installationId,
      module: data.module,
      power: data.power,
      status: "pending",
      requestedBy: data.requestedBy ?? null,
      fields: (data.fields as DeviceCommand["fields"]) ?? null,
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

test("setBasic create -> poll includes fields", async () => {
  const repo = new InMemoryRepo();
  const service = createCommandService(repo, { maxModules: 6, ttlSeconds: 60 });

  const created = await service.create({
    installationId: "PSVG-RNDTEST5",
    module: 0,
    power: "setBasic",
    fields: { ectrs: 1200, pcs: 55.5, reactiveSwitch: 1 },
  });
  assert.equal(created.power, "setBasic");

  const polled = await service.poll("PSVG-RNDTEST5");
  assert.equal(polled.id, created.id);
  assert.equal(polled.power, "setBasic");
  assert.deepEqual(polled.fields, {
    ectrs: 1200,
    pcs: 55.5,
    reactiveSwitch: 1,
  });
});

test("setBasic filters to v3v4 allowed keys and renames tc→tpf", async () => {
  const repo = new InMemoryRepo();
  repo.moduleTypes.set("PSVG-RNDTEST5", "v3v4");
  const service = createCommandService(repo, { maxModules: 6, ttlSeconds: 60 });

  const created = await service.create({
    installationId: "PSVG-RNDTEST5",
    module: 0,
    power: "setBasic",
    fields: {
      reactiveSwitch: 1,
      k0: 100,
      tc: 0.98,
      ectrs: 1200, // not allowed on v3v4
      thdup: 5, // not allowed
    },
  });

  const polled = await service.poll("PSVG-RNDTEST5");
  assert.equal(polled.id, created.id);
  // poll()은 NO_COMMAND(fields 없음) | 명령 payload 유니온을 반환한다.
  // "fields" in 으로 좁혀야 아래에서 polled.fields 에 접근할 수 있다.
  assert.ok("fields" in polled);
  assert.deepEqual(polled.fields, {
    reactiveSwitch: 1,
    k0: 100,
    tpf: 0.98,
  });
});

test("setBasic filters to v5 keys, stores enum strings, and leaves wiring 0/1 alone", async () => {
  const repo = new InMemoryRepo();
  repo.moduleTypes.set("PSVG-RNDTEST5", "v5");
  const service = createCommandService(repo, { maxModules: 6, ttlSeconds: 60 });

  const created = await service.create({
    installationId: "PSVG-RNDTEST5",
    module: 0,
    power: "setBasic",
    fields: {
      tpf: 0.98,
      compMode: 3,
      startupMethod: "auto",
      wiring: 0,
      ictrs: 100, // v1v2-only
      reactiveSwitch: 1, // not on v5
      k0: 10, // v3v4-only
    },
  });

  const polled = await service.poll("PSVG-RNDTEST5");
  assert.equal(created.power, "setBasic");
  assert.ok("fields" in polled);
  assert.deepEqual(polled.fields, {
    tpf: 0.98,
    compMode: "Harm+Reactive",
    startupMethod: "Auto",
    wiring: 0,
  });
});

test("setBasic v5 accepts HMI string enums as-is", async () => {
  const repo = new InMemoryRepo();
  repo.moduleTypes.set("PSVG-RNDTEST5", "v5");
  const service = createCommandService(repo, { maxModules: 6, ttlSeconds: 60 });

  await service.create({
    installationId: "PSVG-RNDTEST5",
    module: 0,
    power: "setBasic",
    fields: {
      compMode: "Harm+Reactive",
      harmonicMode: "Selective",
      phaseAdaption: "On",
      wiring: "3P4L",
      priorityMode: "Harm",
    },
  });

  const polled = await service.poll("PSVG-RNDTEST5");
  assert.ok("fields" in polled);
  assert.deepEqual(polled.fields, {
    compMode: "Harm+Reactive",
    harmonicMode: "Selective",
    phaseAdaption: "On",
    wiring: "3P4L",
    priorityMode: "Harm",
  });
});

test("setBasic v1v2 rejects v5-only keys", async () => {
  const repo = new InMemoryRepo();
  repo.moduleTypes.set("PSVG-RNDTEST5", "v1v2");
  const service = createCommandService(repo, { maxModules: 6, ttlSeconds: 60 });

  const created = await service.create({
    installationId: "PSVG-RNDTEST5",
    module: 0,
    power: "setBasic",
    fields: {
      ectrs: 1000,
      pcs: 55.5,
      compMode: "Harmonic",
      wiring: "3P4L",
    },
  });

  const polled = await service.poll("PSVG-RNDTEST5");
  assert.equal(created.power, "setBasic");
  assert.ok("fields" in polled);
  assert.deepEqual(polled.fields, {
    ectrs: 1000,
    pcs: 55.5,
  });
});

test("setBasic v5-only keys succeed even if stored moduleType is stale v1v2", async () => {
  const repo = new InMemoryRepo();
  repo.moduleTypes.set("PSVG-RNDTEST5", "v1v2");
  const service = createCommandService(repo, { maxModules: 6, ttlSeconds: 60 });

  const created = await service.create({
    installationId: "PSVG-RNDTEST5",
    module: 0,
    power: "setBasic",
    moduleType: "v5",
    fields: {
      startupMethod: "Manual",
      harmonicMode: "Selective",
      reactiveRatio: 100,
      wiring: "3P4L",
    },
  });

  const polled = await service.poll("PSVG-RNDTEST5");
  assert.equal(created.power, "setBasic");
  assert.ok("fields" in polled);
  assert.deepEqual(polled.fields, {
    startupMethod: "Manual",
    harmonicMode: "Selective",
    reactiveRatio: 100,
    wiring: "3P4L",
  });
});

test("setBasic infers v5 when only v5-only keys are sent against stale v1v2", async () => {
  const repo = new InMemoryRepo();
  repo.moduleTypes.set("PSVG-RNDTEST5", "v1v2");
  const service = createCommandService(repo, { maxModules: 6, ttlSeconds: 60 });

  await service.create({
    installationId: "PSVG-RNDTEST5",
    module: 0,
    power: "setBasic",
    fields: { startupMethod: "Auto", priorityMode: "Harm" },
  });

  const polled = await service.poll("PSVG-RNDTEST5");
  assert.ok("fields" in polled);
  assert.deepEqual(polled.fields, {
    startupMethod: "Auto",
    priorityMode: "Harm",
  });
});
