/** Shared types for HMI basic settings (UI engineering units). */

export type ModuleType = "v1v2" | "v3v4" | "v5";

export type BasicSettingRow = Record<string, number | string | boolean | null>;

export type DeviceSettingsSnapshot = {
  installationId: string;
  moduleType: ModuleType;
  numOfMods: number;
  basic: BasicSettingRow[];
  updatedAt: string;
};

export type SettingFieldKind = "number" | "switch" | "select";

export type SettingFieldDef = {
  key: string;
  label: string;
  kind: SettingFieldKind;
  /** select options when kind=select */
  options?: { value: number; label: string }[];
  step?: number;
  hint?: string;
};

/** v3v4 (200A) — exactly these 7 keys (HMI contract). */
const V3V4_FIELDS: SettingFieldDef[] = [
  { key: "reactiveSwitch", label: "무효 보상", kind: "switch" },
  { key: "harmSwitch", label: "하모닉", kind: "switch" },
  { key: "imbSwitch", label: "불평형", kind: "switch" },
  { key: "ectp", label: "CT 위치 (ectp)", kind: "number", step: 1 },
  { key: "k0", label: "K0", kind: "number", step: 1 },
  { key: "ccr", label: "CCR", kind: "number", step: 0.01 },
  { key: "tpf", label: "TPF", kind: "number", step: 0.01 },
];

/**
 * v1v2 / v5 common basic catalog.
 * UI still hides keys absent from the HMI snapshot payload.
 */
const V1V2_V5_FIELDS: SettingFieldDef[] = [
  { key: "ectp", label: "ECTP", kind: "number", step: 1 },
  { key: "ectrs", label: "ECTRS", kind: "number", step: 1 },
  { key: "ictrs", label: "ICTRS", kind: "number", step: 1 },
  { key: "pcs", label: "PCS", kind: "number", step: 0.1 },
  { key: "ccr", label: "CCR", kind: "number", step: 0.1 },
  { key: "tpf", label: "TPF", kind: "number", step: 0.1 },
  { key: "cm", label: "CM", kind: "number", step: 1 },
  { key: "apro", label: "A PRO", kind: "number", step: 1 },
  { key: "bpro", label: "B PRO", kind: "number", step: 1 },
  { key: "cpro", label: "C PRO", kind: "number", step: 1 },
  { key: "reactiveSwitch", label: "무효전력", kind: "switch" },
  { key: "harmSwitch", label: "고조파", kind: "switch" },
  { key: "imbSwitch", label: "불평형", kind: "switch" },
  { key: "reactiveCapacity", label: "무효전력 용량", kind: "number", step: 1 },
  { key: "numOfMods", label: "모듈 수", kind: "number", step: 1 },
];

export const ALLOWED_KEYS_V3V4: ReadonlySet<string> = new Set(
  V3V4_FIELDS.map((f) => f.key),
);

export const ALLOWED_KEYS_V1V2_V5: ReadonlySet<string> = new Set(
  V1V2_V5_FIELDS.map((f) => f.key),
);

export function allowedKeysForModuleType(
  moduleType: ModuleType,
): ReadonlySet<string> {
  return moduleType === "v3v4" ? ALLOWED_KEYS_V3V4 : ALLOWED_KEYS_V1V2_V5;
}

export function moduleTypeLabel(moduleType: ModuleType): string {
  switch (moduleType) {
    case "v1v2":
      return "v1v2 · 150A Gray";
    case "v3v4":
      return "v3v4 · 200A";
    case "v5":
      return "v5 · SIC";
    default:
      return moduleType;
  }
}

/** Allowed field catalog for the moduleType (not yet filtered by payload). */
export function fieldsForModuleType(moduleType: ModuleType): SettingFieldDef[] {
  return moduleType === "v3v4" ? [...V3V4_FIELDS] : [...V1V2_V5_FIELDS];
}

/**
 * Catalog ∩ keys present in snapshot rows.
 * Do not render fields HMI did not send.
 */
export function fieldsFromPayload(
  moduleType: ModuleType,
  basic: BasicSettingRow[],
): SettingFieldDef[] {
  const catalog = fieldsForModuleType(moduleType);
  const present = new Set<string>();
  for (const row of basic) {
    for (const key of Object.keys(row)) {
      if (key === "mod") continue;
      // Legacy alias — treat as tpf for display filtering
      if (key === "tc") present.add("tpf");
      else present.add(key);
    }
  }
  return catalog.filter((f) => present.has(f.key));
}

/** Migrate legacy `tc` → `tpf` on a single basic row (in place copy). */
export function migrateBasicRowKeys(row: BasicSettingRow): BasicSettingRow {
  const next: BasicSettingRow = { ...row };
  if ("tc" in next) {
    if (next.tpf === undefined || next.tpf === null) {
      next.tpf = next.tc;
    }
    delete next.tc;
  }
  return next;
}

export function isModuleType(value: unknown): value is ModuleType {
  return value === "v1v2" || value === "v3v4" || value === "v5";
}
