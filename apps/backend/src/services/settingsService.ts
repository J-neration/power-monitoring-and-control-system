import { PrismaPg } from "@prisma/adapter-pg";
import {
  PrismaClient,
  type Prisma,
} from "../../prisma/generated/client/client.js";
import {
  ensureInstallationForIccid,
  getInstallationIdByIccid,
} from "./deviceService.js";
import {
  allowedKeysForModuleType,
  canonicalSettingsKey,
  canonicalizeSettingsValue,
} from "../lib/deviceSettingsKeys.js";

const prisma = new PrismaClient({
  adapter: new PrismaPg({
    connectionString:
      process.env.DATABASE_URL ?? "postgresql://pmcs:pmcs@localhost:5432/pmcs",
  }),
});

export type ModuleType = "v1v2" | "v3v4" | "v5";

export type BasicSettingRow = Record<string, number | string | boolean | null>;

export type DeviceSettingsSnapshot = {
  installationId: string;
  moduleType: ModuleType;
  numOfMods: number;
  basic: BasicSettingRow[];
  updatedAt: string;
};

const MODULE_TYPES = new Set<string>(["v1v2", "v3v4", "v5"]);

export class SettingsError extends Error {
  httpStatus: number;
  code: string;
  constructor(httpStatus: number, code: string, message: string) {
    super(message);
    this.httpStatus = httpStatus;
    this.code = code;
  }
}

const asFiniteNumber = (v: unknown): number | null => {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return null;
};

const normalizeBasicRow = (
  raw: unknown,
  moduleType?: string | null,
): BasicSettingRow | null => {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const src = raw as Record<string, unknown>;
  const allowed = moduleType ? allowedKeysForModuleType(moduleType) : null;
  const out: BasicSettingRow = {};
  for (const [rawKey, value] of Object.entries(src)) {
    const key = canonicalSettingsKey(rawKey);
    // Prefer explicit tpf over legacy tc if both present
    if (rawKey === "tc" && ("tpf" in src || "tpf" in out)) continue;
    if (key !== "mod" && allowed && !allowed.has(key)) continue;
    let stored: number | string | boolean | null;
    if (value === null) {
      stored = null;
    } else if (typeof value === "boolean") {
      stored = value;
    } else if (typeof value === "string") {
      const n = asFiniteNumber(value);
      stored = n !== null ? n : value;
    } else {
      const n = asFiniteNumber(value);
      if (n === null) continue;
      stored = n;
    }
    const canonical = canonicalizeSettingsValue(moduleType, key, stored);
    if (
      canonical === null ||
      typeof canonical === "number" ||
      typeof canonical === "string" ||
      typeof canonical === "boolean"
    ) {
      out[key] = canonical;
    }
  }
  if (typeof out.mod !== "number") {
    const mod = asFiniteNumber(src.mod);
    if (mod === null || !Number.isInteger(mod) || mod < 0) return null;
    out.mod = mod;
  }
  return out;
};

const MODULE_SLOT_MAX = 6;

const toFloatArray = (value?: unknown): number[] | undefined => {
  let arr: unknown = value;
  if (typeof arr === "string") {
    try {
      arr = JSON.parse(arr);
    } catch {
      return undefined;
    }
  }
  if (!Array.isArray(arr)) return undefined;
  const parsed = (arr as unknown[])
    .map((entry) => {
      if (typeof entry === "number")
        return Number.isFinite(entry) ? entry : undefined;
      if (typeof entry === "string") {
        const n = Number.parseFloat(entry);
        return Number.isFinite(n) ? n : undefined;
      }
      return undefined;
    })
    .filter((e): e is number => e !== undefined);
  return parsed.length > 0 ? parsed : undefined;
};

const clipByModuleCount = (
  values: number[] | undefined,
  numOfMods: number,
): number[] | undefined => {
  if (!values) return undefined;
  const n =
    numOfMods > 0
      ? Math.min(numOfMods, MODULE_SLOT_MAX)
      : Math.min(values.length, MODULE_SLOT_MAX);
  const clipped = values.slice(0, n);
  return clipped.length > 0 ? clipped : undefined;
};

const rowCapacity = (row: BasicSettingRow): number | null => {
  const n = asFiniteNumber(row.moduleCapacity);
  return n !== null && n >= 0 ? n : null;
};

/** Dense M1..Mn array from basic rows (mod index). Stops at first gap. */
const capacityFromBasicRows = (
  basic: BasicSettingRow[],
  numOfMods: number,
): number[] | undefined => {
  const byMod = new Map<number, number>();
  for (const row of basic) {
    const mod = asFiniteNumber(row.mod);
    const cap = rowCapacity(row);
    if (mod === null || !Number.isInteger(mod) || mod < 0 || cap === null) {
      continue;
    }
    byMod.set(Math.trunc(mod), cap);
  }
  if (byMod.size === 0) return undefined;
  const n = Math.min(
    numOfMods > 0 ? numOfMods : Math.max(...byMod.keys()) + 1,
    MODULE_SLOT_MAX,
  );
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const v = byMod.get(i);
    if (v == null) break;
    out.push(v);
  }
  return out.length > 0 ? out : undefined;
};

const injectCapacityIntoRows = (
  basic: BasicSettingRow[],
  caps: number[],
): BasicSettingRow[] =>
  basic.map((row) => {
    const mod = asFiniteNumber(row.mod);
    if (mod === null || !Number.isInteger(mod)) return row;
    const i = Math.trunc(mod);
    if (i < 0 || i >= caps.length || rowCapacity(row) !== null) return row;
    return { ...row, moduleCapacity: caps[i] };
  });

/** Migrate legacy `tc` → `tpf` when reading stored snapshots. */
const migrateStoredBasic = (
  basic: BasicSettingRow[],
  moduleType?: string | null,
): BasicSettingRow[] =>
  basic
    .map((row) => normalizeBasicRow(row, moduleType))
    .filter((row): row is BasicSettingRow => row !== null);

export const settingsService = {
  async upsertFromReceiver(input: {
    iccid: string;
    moduleType: string;
    numOfMods?: number;
    /** Top-level array (preferred). Also accepted per-row in basic[]. */
    moduleCapacity?: unknown;
    basic: unknown[];
  }): Promise<{ installationId: string }> {
    const moduleType = input.moduleType.trim().toLowerCase();
    if (!MODULE_TYPES.has(moduleType)) {
      throw new SettingsError(
        400,
        "INVALID_MODULE_TYPE",
        "moduleType must be v1v2, v3v4, or v5",
      );
    }

    const identity = await ensureInstallationForIccid(input.iccid);
    if (!identity.ok) {
      throw new SettingsError(400, "INVALID_ICCID", "Invalid iccid");
    }

    const basic = input.basic
      .map((row) => normalizeBasicRow(row, moduleType))
      .filter((row): row is BasicSettingRow => row !== null);

    const numOfMods =
      typeof input.numOfMods === "number" && Number.isFinite(input.numOfMods)
        ? Math.trunc(input.numOfMods)
        : basic.length;

    const fromTop = clipByModuleCount(
      toFloatArray(input.moduleCapacity),
      numOfMods,
    );
    const fromRows = capacityFromBasicRows(basic, numOfMods);
    const moduleCapacity = fromTop ?? fromRows;
    const storedBasic = moduleCapacity
      ? injectCapacityIntoRows(basic, moduleCapacity)
      : basic;

    await prisma.installationDeviceSettings.upsert({
      where: { installationId: identity.installationId },
      create: {
        installationId: identity.installationId,
        moduleType,
        numOfMods,
        basic: storedBasic as Prisma.InputJsonValue,
      },
      update: {
        moduleType,
        numOfMods,
        basic: storedBasic as Prisma.InputJsonValue,
      },
    });

    if (moduleCapacity) {
      await prisma.device.updateMany({
        where: { installationId: identity.installationId },
        data: { moduleCapacity },
      });
    }

    return { installationId: identity.installationId };
  },

  async getByInstallationId(
    installationId: string,
  ): Promise<DeviceSettingsSnapshot | null> {
    const row = await prisma.installationDeviceSettings.findUnique({
      where: { installationId },
    });
    if (!row) return null;
    const rawBasic = Array.isArray(row.basic)
      ? (row.basic as BasicSettingRow[])
      : [];
    return {
      installationId: row.installationId,
      moduleType: row.moduleType as ModuleType,
      numOfMods: row.numOfMods,
      basic: migrateStoredBasic(rawBasic, row.moduleType),
      updatedAt: row.updatedAt.toISOString(),
    };
  },

  async getByIccid(iccid: string): Promise<DeviceSettingsSnapshot | null> {
    const installationId = await getInstallationIdByIccid(iccid);
    if (!installationId) return null;
    return this.getByInstallationId(installationId);
  },
};
