import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, type Prisma } from "../../prisma/generated/client/client.js";
import type {
  DeviceCommand,
  DeviceCommandPower,
  DeviceCommandStatus,
} from "../../prisma/generated/client/client.js";
import {
  allowedKeysForModuleType,
  canonicalSettingsKey,
  canonicalizeSettingsValue,
  resolveModuleTypeForSetBasic,
} from "../lib/deviceSettingsKeys.js";

const prisma = new PrismaClient({
  adapter: new PrismaPg({
    connectionString:
      process.env.DATABASE_URL ?? "postgresql://pmcs:pmcs@localhost:5432/pmcs",
  }),
});

export const NO_COMMAND = { id: "", module: -1, power: "" } as const;

type CreateInput = {
  installationId: string;
  module: number;
  power: string;
  requestedBy?: string | null;
  expiresAt?: Date | null;
  /** setBasic partial field map */
  fields?: Record<string, number | string | boolean | null> | null;
  /** Settings form moduleType; used when the stored snapshot type is stale. */
  moduleType?: string | null;
};

type AckInput = {
  id: string;
  ok: boolean;
  message?: string | null;
};

type HistoryInput = {
  installationId: string;
  limit?: number;
};

type CommandRepository = {
  installationExists(installationId: string): Promise<boolean>;
  /** Latest settings moduleType for setBasic key filtering; null if unknown. */
  getModuleType(installationId: string): Promise<string | null>;
  expireCommands(now: Date): Promise<number>;
  findActiveByInstallationModule(
    installationId: string,
    module: number,
  ): Promise<DeviceCommand | null>;
  createCommand(data: {
    id: string;
    installationId: string;
    module: number;
    power: DeviceCommandPower;
    requestedBy?: string | null;
    expiresAt?: Date | null;
    fields?: Prisma.InputJsonValue | null;
  }): Promise<DeviceCommand>;
  findOldestPending(installationId: string, now: Date): Promise<DeviceCommand | null>;
  markSent(id: string, sentAt: Date): Promise<DeviceCommand>;
  findById(id: string): Promise<DeviceCommand | null>;
  markAck(
    id: string,
    status: DeviceCommandStatus,
    ackedAt: Date,
    ackMessage?: string | null,
  ): Promise<DeviceCommand>;
  listHistory(installationId: string, limit: number): Promise<DeviceCommand[]>;
};

class PrismaCommandRepository implements CommandRepository {
  async installationExists(installationId: string): Promise<boolean> {
    const row = await prisma.installation.findUnique({
      where: { id: installationId },
      select: { id: true },
    });
    return !!row;
  }

  async getModuleType(installationId: string): Promise<string | null> {
    const row = await prisma.installationDeviceSettings.findUnique({
      where: { installationId },
      select: { moduleType: true },
    });
    return row?.moduleType ?? null;
  }

  async expireCommands(now: Date): Promise<number> {
    const result = await prisma.deviceCommand.updateMany({
      where: {
        status: { in: ["pending", "sent"] },
        expiresAt: { lt: now },
      },
      data: {
        status: "expired",
        ackedAt: now,
        ackMessage: "expired by server ttl",
      },
    });
    return result.count;
  }

  async findActiveByInstallationModule(
    installationId: string,
    module: number,
  ): Promise<DeviceCommand | null> {
    return prisma.deviceCommand.findFirst({
      where: {
        installationId,
        module,
        status: { in: ["pending", "sent"] },
      },
      orderBy: { createdAt: "asc" },
    });
  }

  async createCommand(data: {
    id: string;
    installationId: string;
    module: number;
    power: DeviceCommandPower;
    requestedBy?: string | null;
    expiresAt?: Date | null;
    fields?: Prisma.InputJsonValue | null;
  }): Promise<DeviceCommand> {
    return prisma.deviceCommand.create({
      data: {
        id: data.id,
        installationId: data.installationId,
        module: data.module,
        power: data.power,
        requestedBy: data.requestedBy ?? null,
        expiresAt: data.expiresAt ?? null,
        fields: data.fields ?? undefined,
      },
    });
  }

  async findOldestPending(
    installationId: string,
    now: Date,
  ): Promise<DeviceCommand | null> {
    return prisma.deviceCommand.findFirst({
      where: {
        installationId,
        status: "pending",
        OR: [{ expiresAt: null }, { expiresAt: { gte: now } }],
      },
      orderBy: { createdAt: "asc" },
    });
  }

  async markSent(id: string, sentAt: Date): Promise<DeviceCommand> {
    return prisma.deviceCommand.update({
      where: { id },
      data: {
        status: "sent",
        sentAt,
      },
    });
  }

  async findById(id: string): Promise<DeviceCommand | null> {
    return prisma.deviceCommand.findUnique({ where: { id } });
  }

  async markAck(
    id: string,
    status: DeviceCommandStatus,
    ackedAt: Date,
    ackMessage?: string | null,
  ): Promise<DeviceCommand> {
    return prisma.deviceCommand.update({
      where: { id },
      data: {
        status,
        ackedAt,
        ackMessage: ackMessage ?? null,
      },
    });
  }

  async listHistory(installationId: string, limit: number): Promise<DeviceCommand[]> {
    return prisma.deviceCommand.findMany({
      where: { installationId },
      orderBy: { createdAt: "desc" },
      take: limit,
    });
  }
}

export const makeCommandId = () => {
  const d = new Date();
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const h = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  const s = String(d.getSeconds()).padStart(2, "0");
  const rand = Math.random().toString(36).slice(2, 8);
  return `cmd_${y}${mo}${day}_${h}${mi}${s}_${rand}`;
};

const parsePower = (power: string): DeviceCommandPower | null => {
  const normalized = power.trim();
  // camelCase commands
  if (normalized === "setBasic") return "setBasic";
  if (normalized === "refreshSettings") return "refreshSettings";
  const lower = normalized.toLowerCase() as DeviceCommandPower;
  if (lower === "on" || lower === "off" || lower === "refresh") return lower;
  return null;
};

const sanitizeFields = (
  fields: CreateInput["fields"],
  moduleType?: string | null,
): Prisma.InputJsonValue | null => {
  if (!fields || typeof fields !== "object" || Array.isArray(fields)) return null;
  const allowed = allowedKeysForModuleType(moduleType);
  const out: Record<string, number | string | boolean | null> = {};
  for (const [rawKey, value] of Object.entries(fields)) {
    if (rawKey === "mod") continue; // module comes from command.module
    const key = canonicalSettingsKey(rawKey);
    if (!allowed.has(key)) continue;
    const canonical = canonicalizeSettingsValue(moduleType, key, value);
    if (
      canonical === null ||
      typeof canonical === "number" ||
      typeof canonical === "string" ||
      typeof canonical === "boolean"
    ) {
      out[key] = canonical;
    }
  }
  return Object.keys(out).length > 0 ? out : null;
};

export class CommandError extends Error {
  httpStatus: number;
  code: string;
  constructor(httpStatus: number, code: string, message: string) {
    super(message);
    this.httpStatus = httpStatus;
    this.code = code;
  }
}

export const createCommandService = (
  repo: CommandRepository,
  cfg?: { maxModules?: number; ttlSeconds?: number },
) => {
  const maxModules = cfg?.maxModules ?? Number(process.env.COMMAND_MAX_MODULES ?? 6);
  const ttlSeconds = cfg?.ttlSeconds ?? Number(process.env.COMMAND_TTL_SECONDS ?? 120);

  return {
    policy: {
      maxModules,
      ttlSeconds,
      activeStatuses: ["pending", "sent"] as DeviceCommandStatus[],
      noCommandPayload: NO_COMMAND,
    },

    async create(input: CreateInput) {
      const installationId = input.installationId?.trim();
      if (!installationId) {
        throw new CommandError(400, "INVALID_INSTALLATION_ID", "installationId is required");
      }
      if (!Number.isInteger(input.module) || input.module < 0 || input.module >= maxModules) {
        throw new CommandError(
          400,
          "INVALID_MODULE",
          `module must be integer between 0 and ${maxModules - 1}`,
        );
      }

      const power = parsePower(input.power);
      if (!power) {
        throw new CommandError(
          400,
          "INVALID_POWER",
          "power must be 'on', 'off', 'refresh', 'refreshSettings', or 'setBasic'",
        );
      }

      const exists = await repo.installationExists(installationId);
      if (!exists) {
        throw new CommandError(404, "INSTALLATION_NOT_FOUND", "installationId not found");
      }

      let moduleType: string | null = null;
      if (power === "setBasic") {
        const storedType = await repo.getModuleType(installationId);
        moduleType = resolveModuleTypeForSetBasic(
          storedType,
          input.moduleType,
          Object.keys(input.fields ?? {}),
        );
      }

      const fields =
        power === "setBasic"
          ? sanitizeFields(input.fields ?? null, moduleType)
          : null;
      if (power === "setBasic" && !fields) {
        const submitted = Object.keys(input.fields ?? {}).filter(
          (key) => key !== "mod",
        );
        throw new CommandError(
          400,
          "INVALID_FIELDS",
          submitted.length === 0
            ? "setBasic requires a non-empty fields object with keys allowed for this moduleType"
            : `setBasic fields [${submitted.join(", ")}] are not allowed for moduleType=${moduleType ?? "unknown"}`,
        );
      }

      await repo.expireCommands(new Date());

      const active = await repo.findActiveByInstallationModule(installationId, input.module);
      if (active) {
        throw new CommandError(
          409,
          "ACTIVE_COMMAND_EXISTS",
          `active command already exists for installation=${installationId}, module=${input.module}`,
        );
      }

      const now = new Date();
      const expiresAt = input.expiresAt ?? new Date(now.getTime() + ttlSeconds * 1000);
      return repo.createCommand({
        id: makeCommandId(),
        installationId,
        module: input.module,
        power,
        requestedBy: input.requestedBy?.trim() || null,
        expiresAt,
        fields,
      });
    },

    async poll(installationIdRaw: string) {
      const installationId = installationIdRaw?.trim();
      if (!installationId) {
        throw new CommandError(400, "INVALID_INSTALLATION_ID", "installationId is required");
      }

      await repo.expireCommands(new Date());
      const cmd = await repo.findOldestPending(installationId, new Date());
      if (!cmd) {
        return NO_COMMAND;
      }
      const sent = await repo.markSent(cmd.id, new Date());
      const payload: {
        id: string;
        module: number;
        power: string;
        fields?: Record<string, unknown>;
      } = {
        id: sent.id,
        module: sent.module,
        power: sent.power,
      };
      if (
        sent.power === "setBasic" &&
        sent.fields &&
        typeof sent.fields === "object" &&
        !Array.isArray(sent.fields)
      ) {
        payload.fields = sent.fields as Record<string, unknown>;
      }
      return payload;
    },

    async ack(input: AckInput) {
      const id = input.id?.trim();
      if (!id) {
        throw new CommandError(400, "INVALID_COMMAND_ID", "id is required");
      }
      const cmd = await repo.findById(id);
      if (!cmd) {
        throw new CommandError(404, "COMMAND_NOT_FOUND", "command not found");
      }

      if (cmd.status === "acked" || cmd.status === "failed") {
        return { ...cmd, idempotent: true };
      }

      const status: DeviceCommandStatus = input.ok ? "acked" : "failed";
      const updated = await repo.markAck(id, status, new Date(), input.message ?? null);
      return { ...updated, idempotent: false };
    },

    async history(input: HistoryInput) {
      const installationId = input.installationId?.trim();
      if (!installationId) {
        throw new CommandError(400, "INVALID_INSTALLATION_ID", "installationId is required");
      }
      const limit = Math.min(Math.max(input.limit ?? 50, 1), 200);
      return repo.listHistory(installationId, limit);
    },
  };
};

export const commandService = createCommandService(new PrismaCommandRepository());
