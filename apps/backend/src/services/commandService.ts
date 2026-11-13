import { type Prisma } from "../../prisma/generated/client/client.js";
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
  SETTINGS_READONLY_KEYS,
} from "../lib/deviceSettingsKeys.js";
import { prisma } from "../lib/prisma.js";
import { otaDownloadPath } from "./otaService.js";

export const NO_COMMAND = { id: "", module: -1, power: "" } as const;

/** Poll answer of an ota command (HMI ota_manager.c OtaManager_PrepareCommand). */
type OtaPollPayload = {
  id: string;
  module: number;
  power: string;
  ver: string;
  pid: number | null;
  asset: number | null;
  size: number;
  url: string;
  /** new screen data package (only when the code needs other screen data) */
  aurl?: string;
  asize?: number;
  /** package of the HMI's current screen data (rollback copy) */
  burl?: string;
  bsize?: number;
  /** never: only setBasic carries fields */
  fields?: undefined;
};

/** OTA 명령에 필요한 파일 정보. kind 가 null 이면 헤더 없는 일반 파일. */
export type OtaCommandFile = {
  id: string;
  /** "code" | "asset" | null */
  kind: string | null;
  size: number;
  downloadToken: string;
  version: string | null;
  productId: number | null;
  assetVersion: number | null;
};

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
  /** pending -> sent. null when the command is no longer pending (cancelled meanwhile). */
  markSent(id: string, sentAt: Date): Promise<DeviceCommand | null>;
  /**
   * ota commands of this installation that the HMI took (sent) before sentBefore
   * but never answered: no ACK and no OTA status report. Back to pending so the
   * next poll hands them out again (retryCount + 1, at most maxRedeliveries).
   */
  requeueUnansweredOta(installationId: string, sentBefore: Date, maxRedeliveries: number): Promise<string[]>;
  /** An OTA status report proves the HMI has the command: pending/sent -> acked or failed. */
  markOtaReported(id: string, status: DeviceCommandStatus, at: Date, message: string): Promise<boolean>;
  findById(id: string): Promise<DeviceCommand | null>;
  markAck(
    id: string,
    status: DeviceCommandStatus,
    ackedAt: Date,
    ackMessage?: string | null,
  ): Promise<DeviceCommand>;
  listHistory(installationId: string, limit: number): Promise<DeviceCommand[]>;
  findOtaFile(id: string): Promise<OtaCommandFile | null>;
  /** 가장 최근에 올린 화면 데이터 패키지 (그 번호, 그 제품) */
  findLatestAssetFile(assetVersion: number, productId: number): Promise<OtaCommandFile | null>;
  /** 텔레메트리로 받은 화면 데이터 번호와 화면 OTA 지원 여부. 기기 행이 없으면 null */
  getDeviceAsset(installationId: string): Promise<{ assetVersion: number | null; assetOta: boolean | null } | null>;
};

const OTA_FILE_SELECT = {
  id: true,
  kind: true,
  size: true,
  downloadToken: true,
  version: true,
  productId: true,
  assetVersion: true,
} as const;

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

  async markSent(id: string, sentAt: Date): Promise<DeviceCommand | null> {
    const res = await prisma.deviceCommand.updateMany({
      where: { id, status: "pending" },
      data: {
        status: "sent",
        sentAt,
      },
    });
    return res.count === 1 ? prisma.deviceCommand.findUnique({ where: { id } }) : null;
  }

  async requeueUnansweredOta(
    installationId: string,
    sentBefore: Date,
    maxRedeliveries: number,
  ): Promise<string[]> {
    const stale = await prisma.deviceCommand.findMany({
      where: {
        installationId,
        power: "ota",
        status: "sent",
        sentAt: { lt: sentBefore },
        retryCount: { lt: maxRedeliveries },
      },
      select: { id: true },
    });
    const requeued: string[] = [];
    for (const { id } of stale) {
      // A status report without an ACK still means the HMI has it.
      if ((await prisma.otaStatusEvent.count({ where: { commandId: id } })) > 0) continue;
      const res = await prisma.deviceCommand.updateMany({
        where: { id, status: "sent" },
        data: { status: "pending", retryCount: { increment: 1 } },
      });
      if (res.count === 1) requeued.push(id);
    }
    return requeued;
  }

  async markOtaReported(
    id: string,
    status: DeviceCommandStatus,
    at: Date,
    message: string,
  ): Promise<boolean> {
    const res = await prisma.deviceCommand.updateMany({
      where: { id, power: "ota", status: { in: ["pending", "sent"] } },
      data: { status, ackedAt: at, ackMessage: message },
    });
    return res.count === 1;
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

  async findOtaFile(id: string): Promise<OtaCommandFile | null> {
    return prisma.otaFile.findUnique({ where: { id }, select: OTA_FILE_SELECT });
  }

  async findLatestAssetFile(assetVersion: number, productId: number): Promise<OtaCommandFile | null> {
    return prisma.otaFile.findFirst({
      where: { kind: "asset", assetVersion, productId },
      select: OTA_FILE_SELECT,
      orderBy: { createdAt: "desc" },
    });
  }

  async getDeviceAsset(installationId: string) {
    return prisma.device.findUnique({
      where: { installationId },
      select: { assetVersion: true, assetOta: true },
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
  if (lower === "on" || lower === "off" || lower === "refresh" || lower === "ota") return lower;
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
    if (!allowed.has(key) || SETTINGS_READONLY_KEYS.has(key)) continue;
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
  cfg?: {
    maxModules?: number;
    ttlSeconds?: number;
    otaAckTimeoutSeconds?: number;
    otaMaxRedeliveries?: number;
  },
) => {
  const maxModules = cfg?.maxModules ?? Number(process.env.COMMAND_MAX_MODULES ?? 6);
  // HMI only starts polling after its next telemetry ACK (~10 min cycle).
  const ttlSeconds = cfg?.ttlSeconds ?? Number(process.env.COMMAND_TTL_SECONDS ?? 900);
  // An ota command the HMI took but never answered (no ACK, no status report) is
  // handed out again after this long: the poll answer can be lost on the LTE link
  // after the server already marked it sent. The HMI ACKs within seconds and
  // ignores a command id it already took ("duplicate ignored").
  const otaAckTimeoutSeconds =
    cfg?.otaAckTimeoutSeconds ?? Number(process.env.OTA_ACK_TIMEOUT_SECONDS ?? 180);
  const otaMaxRedeliveries =
    cfg?.otaMaxRedeliveries ?? Number(process.env.OTA_MAX_REDELIVERIES ?? 3);

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
          "power must be 'on', 'off', 'refresh', 'refreshSettings', 'setBasic', or 'ota'",
        );
      }

      // ota: HMI itself (module 0), fields = { fileId } of an uploaded code package.
      // If the package needs other screen data than the HMI has (HMI repo
      // docs/OTA_ASSET_PLAN.md 11.5), the command also carries the new screen
      // data package and the package of the HMI's current screen data (the
      // rollback copy; the HMI skips it when it already keeps one):
      //   fields = { fileId, assetFileId, backupFileId }
      let otaFields: Prisma.InputJsonValue | null = null;
      if (power === "ota") {
        if (input.module !== 0) {
          throw new CommandError(400, "INVALID_MODULE", "ota uses module 0 (the HMI itself)");
        }
        const fileId = input.fields?.fileId;
        if (typeof fileId !== "string" || !fileId.trim()) {
          throw new CommandError(400, "INVALID_FIELDS", "ota requires fields.fileId");
        }
        const file = await repo.findOtaFile(fileId.trim());
        if (!file) {
          throw new CommandError(404, "OTA_FILE_NOT_FOUND", "ota file not found");
        }
        if (file.kind === "asset") {
          throw new CommandError(
            400,
            "OTA_FILE_IS_ASSET",
            "pick a code package: screen data packages are sent along with the code package that needs them",
          );
        }
        if (!file.version) {
          throw new CommandError(
            400,
            "OTA_FILE_NOT_PACKAGE",
            "ota file has no package header (upload a file made by tools/ota_pack.py)",
          );
        }
        otaFields = { fileId: file.id };

        const device = await repo.getDeviceAsset(installationId);
        // 2.4.0 does not report it: screen data 1, no screen data OTA (docs 7.1).
        const deviceAsset = device?.assetVersion ?? 1;
        const needAsset = file.assetVersion ?? 1;
        if (needAsset !== deviceAsset) {
          if (device?.assetOta !== true) {
            throw new CommandError(
              400,
              "OTA_ASSET_NOT_SUPPORTED",
              `package needs screen data ${needAsset}, the HMI has ${deviceAsset} and cannot take screen data packages (firmware 2.5.0 or later)`,
            );
          }
          const pid = file.productId ?? 1;
          const screen = await repo.findLatestAssetFile(needAsset, pid);
          if (!screen) {
            throw new CommandError(
              400,
              "OTA_ASSET_FILE_MISSING",
              `upload the screen data ${needAsset} package first (tools/ota_pack.py --asset)`,
            );
          }
          const backup = await repo.findLatestAssetFile(deviceAsset, pid);
          if (!backup) {
            throw new CommandError(
              400,
              "OTA_ASSET_BACKUP_MISSING",
              `upload the screen data ${deviceAsset} package (the HMI's current screen data, kept for rollback)`,
            );
          }
          otaFields = { fileId: file.id, assetFileId: screen.id, backupFileId: backup.id };
        }
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
          : otaFields;
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

    /**
     * Oldest pending command for the HMI. opts.otaBaseUrl ("https://<api host>") is
     * prefixed to the OTA download path so DEV and PROD hand out their own host.
     */
    async poll(installationIdRaw: string, opts?: { otaBaseUrl?: string }) {
      const installationId = installationIdRaw?.trim();
      if (!installationId) {
        throw new CommandError(400, "INVALID_INSTALLATION_ID", "installationId is required");
      }

      await repo.expireCommands(new Date());
      await repo.requeueUnansweredOta(
        installationId,
        new Date(Date.now() - otaAckTimeoutSeconds * 1000),
        otaMaxRedeliveries,
      );
      const cmd = await repo.findOldestPending(installationId, new Date());
      if (!cmd) {
        return NO_COMMAND;
      }
      const sent = await repo.markSent(cmd.id, new Date());
      if (!sent) {
        return NO_COMMAND;
      }

      if (sent.power === "ota") {
        // Short keys: the HMI reads the command into a 1024-byte buffer
        // (2.5.0+; 512 before). A code-only command is ~220 B, one with the
        // two screen data URLs ~500 B.
        const f =
          sent.fields && typeof sent.fields === "object" && !Array.isArray(sent.fields)
            ? (sent.fields as Record<string, unknown>)
            : {};
        const load = async (id: unknown) => (typeof id === "string" ? await repo.findOtaFile(id) : null);
        const file = await load(f.fileId);
        if (!file || !file.version) {
          await repo.markAck(sent.id, "failed", new Date(), "ota file missing on server");
          return NO_COMMAND;
        }
        const base = opts?.otaBaseUrl ?? "";
        const payload: OtaPollPayload = {
          id: sent.id,
          module: sent.module,
          power: sent.power,
          ver: file.version,
          pid: file.productId,
          asset: file.assetVersion,
          size: file.size,
          url: `${base}${otaDownloadPath(file)}`,
        };
        if (f.assetFileId !== undefined || f.backupFileId !== undefined) {
          const screen = await load(f.assetFileId);
          const backup = await load(f.backupFileId);
          if (!screen || screen.kind !== "asset" || !backup || backup.kind !== "asset") {
            await repo.markAck(sent.id, "failed", new Date(), "ota screen data file missing on server");
            return NO_COMMAND;
          }
          payload.aurl = `${base}${otaDownloadPath(screen)}`;
          payload.asize = screen.size;
          payload.burl = `${base}${otaDownloadPath(backup)}`;
          payload.bsize = backup.size;
        }
        return payload;
      }

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

    /**
     * The HMI sent an OTA status report for this command: it has the command even
     * if its ACK was lost. Closes the command so it is not handed out again.
     */
    async noteOtaReport(commandId: string | null | undefined, state: string): Promise<boolean> {
      const id = commandId?.trim();
      if (!id) return false;
      return repo.markOtaReported(
        id,
        state === "failed" ? "failed" : "acked",
        new Date(),
        `ota status ${state}`,
      );
    },

    /** Unexpired command still waiting for the HMI to poll it. */
    async hasPending(installationIdRaw: string): Promise<boolean> {
      const installationId = installationIdRaw?.trim();
      if (!installationId) return false;
      // Keep the HMI polling while an unanswered ota command waits to be handed out again.
      await repo.requeueUnansweredOta(
        installationId,
        new Date(Date.now() - otaAckTimeoutSeconds * 1000),
        otaMaxRedeliveries,
      );
      return (await repo.findOldestPending(installationId, new Date())) !== null;
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
